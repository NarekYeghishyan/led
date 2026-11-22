/**
 * Products → site categories (admin "Привязка товаров", /api/admin/product-categories).
 *
 * Who decides, first wins:
 *  1. manual — the admin set the product's categories (products.site_cats_manual); rules and AI never touch it again
 *     until "back to automatic".
 *  2. rule   — name rules of the site categories (+ their linked Access categories), see category-rules.ts. Recomputed
 *     after every Access sync batch, after a category edit, and every 15 min.
 *  3. ai     — only for in-stock products the rules left without an exact (leaf) category. The AI picks one leaf
 *     (inside the group the rules found, else from the whole tree): confidence ≥ 90 → applied (marked "AI"),
 *     lower → waits in the review list. Runs by itself every 30 min for new products (AI_CATEGORIES_AUTO=0 turns it off).
 *
 * Env: AI_CATEGORIES = gemini | openai | off (default: same AI as the photos — AI_PROVIDER), GEMINI_API_KEY / OPENAI_API_KEY.
 * Admin-only; nothing here goes to /api/shop except through site-categories.ts counts.
 */
import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown,
  Param, ParseIntPipe, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { JwtGuard } from './auth';
import { cleanRules, matchAll, type MatchRule } from './category-rules';
import { gemini, openai, useOpenAI } from './photos';

export const AI_AUTO_MIN = 90; // confidence from which an AI answer is applied without review
const AI_BATCH = 40;
const AI_AUTO_LIMIT = 300; // products per automatic run
type Req = { user?: { email?: string } };

interface CatRow { id: number; parent_id: number | null; name_ru: string; is_visible: boolean; match_rules: MatchRule[]; access_category_ids: number[] }

/** Tree helpers over site_categories rows. */
function tree(rows: CatRow[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const kids = new Map<number, number[]>();
  for (const r of rows) if (r.parent_id !== null) kids.set(r.parent_id, [...(kids.get(r.parent_id) || []), r.id]);
  const isLeaf = (id: number) => !kids.get(id)?.length;
  const path = (id: number): string => {
    const r = byId.get(id);
    if (!r) return `#${id}`;
    return r.parent_id === null ? r.name_ru : `${path(r.parent_id)} › ${r.name_ru}`;
  };
  const visible = (id: number): boolean => { const r = byId.get(id); return !!r && r.is_visible && (r.parent_id === null || visible(r.parent_id)); };
  const leavesUnder = (id: number): number[] => (isLeaf(id) ? [id] : kids.get(id)!.flatMap(leavesUnder));
  return { byId, isLeaf, path, visible, leavesUnder };
}

interface AiJob {
  running: boolean; by: string | null; startedAt: string | null; finishedAt: string | null;
  total: number; done: number; applied: number; pending: number; none: number; error: string | null; provider: string | null;
}
interface Candidate { id: number; name: string; brand: string | null; access: string | null; cats: number[] }

@Injectable()
export class ProductCategoriesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('ProductCategories');
  private rulesTimer: NodeJS.Timeout | null = null;
  private rulesDue = 0;
  private rulesRunning: Promise<void> | null = null;
  private rulesAgain = false;
  private aiTimer: NodeJS.Timeout | null = null;
  private ticks: NodeJS.Timeout[] = [];
  private stopped = false;
  rules = { at: null as string | null, ms: 0, pairs: 0, products: 0, error: null as string | null };
  ai: AiJob = { running: false, by: null, startedAt: null, finishedAt: null, total: 0, done: 0, applied: 0, pending: 0, none: 0, error: null, provider: null };

  constructor(@InjectDataSource() private ds: DataSource) {}

  onApplicationBootstrap() {
    this.scheduleRules(15_000);
    this.ticks.push(setInterval(() => this.scheduleRules(0), 15 * 60_000));
    this.ticks.push(setInterval(() => this.scheduleAi(0), 30 * 60_000));
  }
  onApplicationShutdown() {
    this.stopped = true;
    for (const t of this.ticks) clearInterval(t);
    if (this.rulesTimer) clearTimeout(this.rulesTimer);
    if (this.aiTimer) clearTimeout(this.aiTimer);
  }

  // ------------------------------------------------------------------ rules

  /** Runs the rules within `delayMs` (an earlier request keeps its earlier time, so a stream of sync batches can't postpone it). */
  scheduleRules(delayMs = 1500) {
    const due = Date.now() + delayMs;
    if (this.rulesTimer && this.rulesDue <= due) return;
    if (this.rulesTimer) clearTimeout(this.rulesTimer);
    this.rulesDue = due;
    this.rulesTimer = setTimeout(() => { this.rulesTimer = null; this.runRules().catch(() => undefined); }, delayMs);
  }

  runRules(): Promise<void> {
    if (this.rulesRunning) { this.rulesAgain = true; return this.rulesRunning; }
    this.rulesRunning = this.doRules()
      .catch((e) => { this.rules.error = (e as Error).message; this.log.error(`rules: ${(e as Error).message}`); })
      .finally(() => {
        this.rulesRunning = null;
        if (this.rulesAgain) { this.rulesAgain = false; this.scheduleRules(1000); }
      });
    return this.rulesRunning;
  }

  private async doRules() {
    const t0 = Date.now();
    const cats: CatRow[] = await this.ds.query(`SELECT id, parent_id, name_ru, is_visible, match_rules, access_category_ids FROM site_categories`);
    const products: { id: number; name: string; cat: number | null }[] = await this.ds.query(
      `SELECT id, name, category_external_id AS cat FROM products WHERE deleted_at IS NULL AND NOT site_cats_manual`);
    const pairs = matchAll(cats.map((c) => ({
      id: c.id, rules: Array.isArray(c.match_rules) ? c.match_rules : [], accessIds: c.access_category_ids || [],
    })), products);
    await this.ds.transaction(async (m) => {
      await m.query(`CREATE TEMP TABLE _rm (product_id int, site_category_id int) ON COMMIT DROP`);
      await m.query(`INSERT INTO _rm SELECT * FROM unnest($1::int[], $2::int[])`, [pairs.map((p) => p[0]), pairs.map((p) => p[1])]);
      await m.query(`DELETE FROM product_site_categories x WHERE x.source = 'rule'
        AND NOT EXISTS (SELECT 1 FROM _rm r WHERE r.product_id = x.product_id AND r.site_category_id = x.site_category_id)`);
      await m.query(`INSERT INTO product_site_categories (product_id, site_category_id, source)
        SELECT product_id, site_category_id, 'rule' FROM _rm ON CONFLICT DO NOTHING`);
      // an automatic AI pick gives way once a rule finds an exact (leaf) category for the product
      await m.query(`
        WITH ruled AS (SELECT DISTINCT r.product_id FROM _rm r
            WHERE NOT EXISTS (SELECT 1 FROM site_categories k WHERE k.parent_id = r.site_category_id)),
          gone AS (DELETE FROM product_site_categories x USING product_ai_categories a, ruled
            WHERE x.source = 'ai' AND a.product_id = x.product_id AND a.status = 'applied' AND ruled.product_id = x.product_id
            RETURNING x.product_id)
        UPDATE product_ai_categories a SET status = 'replaced' FROM gone WHERE gone.product_id = a.product_id`);
    });
    this.rules = { at: new Date().toISOString(), ms: Date.now() - t0, pairs: pairs.length, products: new Set(pairs.map((p) => p[0])).size, error: null };
    this.scheduleAi(60_000); // new products may now be waiting for an exact category
  }

  /** What one category's rules would catch (editor preview). */
  async testRules(rules: unknown, accessIds: unknown) {
    let clean: MatchRule[];
    try { clean = cleanRules(rules); } catch (e) { throw new BadRequestException((e as Error).message); }
    const acc = Array.isArray(accessIds) ? accessIds.map(Number).filter(Number.isInteger) : [];
    const products: { id: number; name: string; cat: number | null; qty: number }[] = await this.ds.query(
      `SELECT id, name, category_external_id AS cat, quantity::float AS qty FROM products WHERE deleted_at IS NULL`);
    const ids = new Set(matchAll([{ id: 0, rules: clean, accessIds: acc }], products).map((p) => p[0]));
    const hit = products.filter((p) => ids.has(p.id));
    const inStock = hit.filter((p) => p.qty > 0);
    return {
      count: hit.length, inStock: inStock.length,
      sample: [...inStock, ...hit.filter((p) => p.qty <= 0)].slice(0, 40).map((p) => ({ id: p.id, name: p.name, inStock: p.qty > 0 })),
    };
  }

  // ------------------------------------------------------------------ AI

  provider(): 'gemini' | 'openai' | null {
    const v = (process.env.AI_CATEGORIES || '').toLowerCase();
    if (v === 'off') return null;
    if (v === 'openai') return process.env.OPENAI_API_KEY ? 'openai' : null;
    if (v === 'gemini') return process.env.GEMINI_API_KEY ? 'gemini' : null;
    if (useOpenAI() && process.env.OPENAI_API_KEY) return 'openai';
    return process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : null;
  }
  private autoOn = () => process.env.AI_CATEGORIES_AUTO !== '0' && !!this.provider();

  scheduleAi(delayMs: number) {
    if (!this.autoOn() || this.aiTimer || this.stopped) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.ai.running) return;
      this.startAi({ limit: AI_AUTO_LIMIT, by: 'auto' }).catch(() => undefined);
    }, delayMs);
  }

  /** In-stock products the rules left without a leaf category, not asked yet with this name (or the given ids, always asked). */
  async candidates(ids?: number[], limit = 5000): Promise<Candidate[]> {
    const forced = !!ids?.length;
    const rows: Candidate[] = await this.ds.query(`
      SELECT p.id, p.name, p.brand, c.name AS access,
        COALESCE(array_agg(x.site_category_id) FILTER (WHERE x.site_category_id IS NOT NULL), '{}') AS cats,
        bool_or(x.site_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM site_categories k WHERE k.parent_id = x.site_category_id)) AS has_leaf
      FROM products p
      LEFT JOIN categories c ON c.external_id = p.category_external_id
      LEFT JOIN product_site_categories x ON x.product_id = p.id
      LEFT JOIN product_ai_categories a ON a.product_id = p.id
      WHERE p.deleted_at IS NULL AND NOT p.site_cats_manual AND p.name <> ''
        AND ${forced ? 'p.id = ANY($1)' : `p.quantity > 0 AND (a.product_id IS NULL OR a.product_name <> p.name)`}
      GROUP BY p.id, c.name
      ${forced ? '' : `HAVING NOT COALESCE(bool_or(x.site_category_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM site_categories k WHERE k.parent_id = x.site_category_id)), false)`}
      ORDER BY p.id LIMIT ${Number(limit) || 5000}`, forced ? [ids] : []);
    return rows;
  }

  async startAi(opts: { ids?: number[]; limit?: number; by: string }) {
    if (this.ai.running) throw new BadRequestException('AI is already sorting products — wait for it to finish');
    const provider = this.provider();
    if (!provider) throw new BadRequestException('No AI key on the server (GEMINI_API_KEY or OPENAI_API_KEY), or AI_CATEGORIES=off');
    const items = await this.candidates(opts.ids, opts.limit);
    if (!items.length && opts.by === 'auto') return this.ai; // nothing new: keep the last run's summary
    this.ai = { running: items.length > 0, by: opts.by, startedAt: new Date().toISOString(), finishedAt: items.length ? null : new Date().toISOString(),
      total: items.length, done: 0, applied: 0, pending: 0, none: 0, error: null, provider };
    if (items.length) {
      void this.aiLoop(items, provider)
        .catch((e) => { this.ai.error = (e as Error).message; this.log.error(`ai: ${(e as Error).message}`); })
        .finally(() => { this.ai.running = false; this.ai.finishedAt = new Date().toISOString(); });
    }
    return this.ai;
  }

  private async aiLoop(items: Candidate[], provider: 'gemini' | 'openai') {
    const cats: CatRow[] = await this.ds.query(`SELECT id, parent_id, name_ru, is_visible, match_rules, access_category_ids FROM site_categories`);
    const t = tree(cats);
    const allLeaves = cats.filter((c) => t.isLeaf(c.id) && t.visible(c.id)).map((c) => c.id);
    // products with the same choice of leaves go to the AI together
    const groups = new Map<string, { leaves: number[]; items: Candidate[] }>();
    for (const p of items) {
      const groupCats = p.cats.filter((c) => t.byId.has(c) && !t.isLeaf(c));
      let leaves = [...new Set(groupCats.flatMap(t.leavesUnder))].filter(t.visible);
      if (!leaves.length || p.cats.some((c) => t.isLeaf(c))) leaves = allLeaves;
      leaves.sort((a, b) => a - b);
      const key = leaves.join(',');
      if (!groups.has(key)) groups.set(key, { leaves, items: [] });
      groups.get(key)!.items.push(p);
    }
    const pause = provider === 'gemini' ? 4500 : 800; // Gemini free plan ≈ 15 requests a minute
    let first = true;
    for (const g of groups.values()) {
      for (let i = 0; i < g.items.length; i += AI_BATCH) {
        if (this.stopped) return;
        if (!first) await sleep(pause);
        first = false;
        const batch = g.items.slice(i, i + AI_BATCH);
        const { list, model } = await this.askWithRetry(provider, batch, g.leaves.map((id) => `${id}: ${t.path(id)}`));
        await this.saveAnswers(batch, list, new Set(g.leaves), model);
        this.ai.done += batch.length;
      }
    }
  }

  private async askWithRetry(provider: 'gemini' | 'openai', batch: Candidate[], catLines: string[]) {
    for (let attempt = 0; ; attempt++) {
      try { return await this.ask(provider, batch, catLines); } catch (e) {
        const status = (e as { getStatus?: () => number }).getStatus?.() ?? 0;
        if (attempt >= 2) throw e;
        await sleep(status === 429 ? 65_000 : 10_000);
      }
    }
  }

  private async ask(provider: 'gemini' | 'openai', batch: Candidate[], catLines: string[]) {
    const prompt = `You sort the products of LED Computers, a computer store in Yerevan, Armenia, into the categories of its new website.

Website categories (id: path):
${catLines.join('\n')}

Products (id | name from the store database | brand | old store category — often wrong or outdated):
${batch.map((p) => `${p.id} | ${p.name.replace(/\s+/g, ' ').trim()} | ${p.brand || '-'} | ${p.access || '-'}`).join('\n')}

For every product pick the ONE website category from the list above where a customer would look for it.
Answer with JSON only: [{"id": <product id>, "cat": <category id or null>, "conf": <0-100>, "why": "<max 10 words, in Russian>"}]
- conf = how sure you are; give 90 or more only when the name makes it obvious.
- "cat": null when no category in the list fits the product.
- Decide by what the product is, not by its brand or the old store category.
- Laptops: "Игровые" = gaming GPU (RTX, GTX, RX) or gaming series (Victus, OMEN, Legion, LOQ, TUF, ROG, Nitro, Predator, Katana);
  "Офисные" = business series (ThinkPad, ThinkBook, Latitude, Vostro, ProBook, EliteBook, ExpertBook, TravelMate, Lenovo V14/V15);
  "Для дома" = other consumer laptops (IdeaPad, Aspire, Pavilion, OmniBook, Zenbook, Vivobook, Inspiron, XPS, Gram, Swift, Yoga).
- Ready-built PCs: the line in the name decides (Office, Home, Design, Develop; GFirst = gaming).`;
    let text: string, model: string;
    if (provider === 'gemini') {
      const r = await gemini({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }, 120_000);
      text = r.text; model = r.model;
    } else {
      text = (await openai({ input: prompt }, 120_000)).text; model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
    }
    const s = text.indexOf('['), e = text.lastIndexOf(']');
    if (s < 0 || e < s) throw new Error('AI answer is not a JSON list');
    const list = JSON.parse(text.slice(s, e + 1)) as { id?: unknown; cat?: unknown; conf?: unknown; why?: unknown }[];
    return { list: Array.isArray(list) ? list : [], model };
  }

  private async saveAnswers(batch: Candidate[], answers: { id?: unknown; cat?: unknown; conf?: unknown; why?: unknown }[], leaves: Set<number>, model: string) {
    const byId = new Map(answers.map((a) => [Number(a.id), a]));
    await this.ds.transaction(async (m) => {
      for (const p of batch) {
        const a = byId.get(p.id);
        const cat = a && a.cat !== null && leaves.has(Number(a.cat)) ? Number(a.cat) : null;
        const conf = cat === null ? 0 : Math.max(0, Math.min(100, Math.round(Number(a?.conf) || 0)));
        const status = cat === null ? 'none' : conf >= AI_AUTO_MIN ? 'applied' : 'pending';
        const why = a ? String(a.why ?? '').slice(0, 200) || null : 'no answer';
        await m.query(`DELETE FROM product_site_categories WHERE product_id = $1 AND source = 'ai'`, [p.id]);
        await m.query(`
          INSERT INTO product_ai_categories (product_id, site_category_id, confidence, reason, status, product_name, model, checked_at, decided_by, decided_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, now(), NULL, NULL)
          ON CONFLICT (product_id) DO UPDATE SET site_category_id = $2, confidence = $3, reason = $4, status = $5, product_name = $6,
            model = $7, checked_at = now(), decided_by = NULL, decided_at = NULL`,
          [p.id, cat, conf, why, status, p.name, model]);
        if (status === 'applied') {
          await m.query(`INSERT INTO product_site_categories (product_id, site_category_id, source, confidence)
            SELECT $1, $2, 'ai', $3 WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = $1 AND site_cats_manual)
            ON CONFLICT DO NOTHING`, [p.id, cat, conf]);
          this.ai.applied++;
        } else if (status === 'pending') this.ai.pending++;
        else this.ai.none++;
      }
    });
  }

  // ------------------------------------------------------------------ manual changes

  /** Paths of the product's categories (for the change log). */
  private async catNames(m: EntityManager, productId: number): Promise<string[]> {
    const rows: { id: number }[] = await m.query(`SELECT site_category_id AS id FROM product_site_categories WHERE product_id = $1 ORDER BY 1`, [productId]);
    if (!rows.length) return [];
    const cats: CatRow[] = await m.query(`SELECT id, parent_id, name_ru, is_visible, match_rules, access_category_ids FROM site_categories`);
    const t = tree(cats);
    return rows.map((r) => t.path(r.id));
  }

  private async logChange(m: EntityManager, productId: number, before: string[], after: string[], by: string, note?: string) {
    const [p] = await m.query(`SELECT external_id, name FROM products WHERE id = $1`, [productId]);
    if (!p) return;
    const changes: Record<string, [unknown, unknown]> = { categories: [before.join('; ') || '—', after.join('; ') || '—'], by: [null, by] };
    if (note) changes.how = [null, note];
    await m.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('product_site_category', 'updated', $1, $2, $3)`,
      [p.external_id, p.name, JSON.stringify(changes)]);
  }

  async assign(ids: number[], cats: number[], mode: 'set' | 'add' | 'remove', by: string) {
    const valid: { id: number }[] = await this.ds.query(`SELECT id FROM site_categories WHERE id = ANY($1)`, [cats]);
    if (valid.length !== new Set(cats).size) throw new BadRequestException('Unknown site category');
    if (mode !== 'remove' && mode !== 'add' && !cats.length && ids.length > 1) throw new BadRequestException('Pick a category');
    await this.ds.transaction(async (m) => {
      for (const id of ids) {
        const before = await this.catNames(m, id);
        const cur: { c: number }[] = await m.query(`SELECT site_category_id AS c FROM product_site_categories WHERE product_id = $1`, [id]);
        const now = new Set(mode === 'set' ? cats : cur.map((r) => r.c));
        if (mode === 'add') cats.forEach((c) => now.add(c));
        if (mode === 'remove') cats.forEach((c) => now.delete(c));
        await m.query(`UPDATE products SET site_cats_manual = true WHERE id = $1`, [id]);
        await m.query(`DELETE FROM product_site_categories WHERE product_id = $1`, [id]);
        if (now.size) {
          await m.query(`INSERT INTO product_site_categories (product_id, site_category_id, source) SELECT $1, unnest($2::int[]), 'manual'`, [id, [...now]]);
        }
        await m.query(`UPDATE product_ai_categories SET status = 'replaced' WHERE product_id = $1 AND status IN ('pending', 'applied')`, [id]);
        await this.logChange(m, id, before, await this.catNames(m, id), by);
      }
    });
    return { ok: true, updated: ids.length };
  }

  /** Back to automatic: manual choice dropped, rules run again, AI may ask again. */
  async auto(ids: number[], by: string) {
    await this.ds.transaction(async (m) => {
      for (const id of ids) {
        const [p] = await m.query(`SELECT site_cats_manual FROM products WHERE id = $1`, [id]);
        if (!p) continue;
        const before = await this.catNames(m, id);
        await m.query(`UPDATE products SET site_cats_manual = false WHERE id = $1`, [id]);
        await m.query(`DELETE FROM product_site_categories WHERE product_id = $1 AND source IN ('manual', 'ai')`, [id]);
        await m.query(`DELETE FROM product_ai_categories WHERE product_id = $1`, [id]);
        if (p.site_cats_manual) await this.logChange(m, id, before, ['(automatic)'], by);
      }
    });
    if (this.rulesRunning) await this.rulesRunning; // a run that started before this change would miss it
    await this.runRules();
    return { ok: true };
  }

  async accept(ids: number[], by: string) {
    let n = 0;
    await this.ds.transaction(async (m) => {
      const rows: { product_id: number; site_category_id: number; confidence: number }[] = await m.query(`
        SELECT a.product_id, a.site_category_id, a.confidence FROM product_ai_categories a JOIN products p ON p.id = a.product_id
        WHERE a.product_id = ANY($1) AND a.status IN ('pending', 'rejected') AND a.site_category_id IS NOT NULL AND NOT p.site_cats_manual`, [ids]);
      for (const r of rows) {
        const before = await this.catNames(m, r.product_id);
        await m.query(`INSERT INTO product_site_categories (product_id, site_category_id, source, confidence) VALUES ($1, $2, 'ai', $3)
          ON CONFLICT (product_id, site_category_id) DO UPDATE SET source = 'ai', confidence = $3`, [r.product_id, r.site_category_id, r.confidence]);
        await m.query(`UPDATE product_ai_categories SET status = 'accepted', decided_by = $2, decided_at = now() WHERE product_id = $1`, [r.product_id, by]);
        await this.logChange(m, r.product_id, before, await this.catNames(m, r.product_id), by, 'AI suggestion accepted');
        n++;
      }
    });
    return { ok: true, accepted: n };
  }

  async reject(ids: number[], by: string) {
    let n = 0;
    await this.ds.transaction(async (m) => {
      const rows: { product_id: number; status: string }[] = await m.query(
        `SELECT product_id, status FROM product_ai_categories WHERE product_id = ANY($1) AND status IN ('pending', 'applied', 'accepted')`, [ids]);
      for (const r of rows) {
        const before = await this.catNames(m, r.product_id);
        await m.query(`DELETE FROM product_site_categories WHERE product_id = $1 AND source = 'ai'`, [r.product_id]);
        await m.query(`UPDATE product_ai_categories SET status = 'rejected', decided_by = $2, decided_at = now() WHERE product_id = $1`, [r.product_id, by]);
        if (r.status !== 'pending') await this.logChange(m, r.product_id, before, await this.catNames(m, r.product_id), by, 'AI category rejected');
        n++;
      }
    });
    return { ok: true, rejected: n };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idList = (v: unknown, max = 500): number[] => {
  if (!Array.isArray(v)) throw new BadRequestException('ids must be an array');
  const out = [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x > 0))];
  if (out.length > max) throw new BadRequestException(`At most ${max} at once`);
  return out;
};

const VIEWS: Record<string, string> = {
  all: 'true',
  none: 'NOT EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id)',
  group: `EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id
      AND NOT EXISTS (SELECT 1 FROM site_categories k WHERE k.parent_id = x.site_category_id))`,
  pending: `a.status = 'pending'`,
  ai: `EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id AND x.source = 'ai')`,
  manual: 'p.site_cats_manual',
  rule: `EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id AND x.source = 'rule')`,
};

@Controller('admin/product-categories')
@UseGuards(JwtGuard)
export class ProductCategoriesController {
  constructor(@InjectDataSource() private ds: DataSource, private svc: ProductCategoriesService) {}

  @Get('stats')
  async stats() {
    const [s] = await this.ds.query(`
      WITH pp AS (
        SELECT p.quantity > 0 AS f_st, p.site_cats_manual AS f_manual,
          EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id) AS f_any,
          EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id
            AND NOT EXISTS (SELECT 1 FROM site_categories k WHERE k.parent_id = x.site_category_id)) AS f_leaf,
          EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id AND x.source = 'ai') AS f_ai,
          EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id AND x.source = 'rule') AS f_rule,
          (SELECT status FROM product_ai_categories a WHERE a.product_id = p.id) AS f_status
        FROM products p WHERE p.deleted_at IS NULL)
      SELECT COUNT(*)::int AS "all", COUNT(*) FILTER (WHERE f_any)::int AS "allAny",
        COUNT(*) FILTER (WHERE f_st)::int AS "inStock",
        COUNT(*) FILTER (WHERE f_st AND f_leaf)::int AS "leaf",
        COUNT(*) FILTER (WHERE f_st AND f_any AND NOT f_leaf)::int AS "group",
        COUNT(*) FILTER (WHERE f_st AND NOT f_any)::int AS "none",
        COUNT(*) FILTER (WHERE f_st AND f_manual)::int AS "manual",
        COUNT(*) FILTER (WHERE f_st AND f_ai)::int AS "aiCount",
        COUNT(*) FILTER (WHERE f_st AND f_rule AND NOT f_manual)::int AS "rule",
        COUNT(*) FILTER (WHERE f_status = 'pending')::int AS "pending",
        (SELECT MAX(checked_at) FROM product_ai_categories) AS "aiLastAt"
      FROM pp`);
    const waitingAi = (await this.svc.candidates()).length;
    return { ...s, waitingAi, rules: this.svc.rules, ai: this.svc.ai, provider: this.svc.provider(), autoMin: AI_AUTO_MIN,
      auto: process.env.AI_CATEGORIES_AUTO !== '0' };
  }

  @Get('products')
  async products(@Query() q: Record<string, string>) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const where = [`p.deleted_at IS NULL`, VIEWS[q.view] || VIEWS.all];
    const args: unknown[] = [];
    if (q.stock !== 'all') where.push('p.quantity > 0');
    if (q.search?.trim()) {
      args.push(`%${q.search.trim()}%`, q.search.trim());
      where.push(`(p.name ILIKE $${args.length - 1} OR p.brand ILIKE $${args.length - 1} OR p.external_id::text = $${args.length})`);
    }
    if (q.cat && Number(q.cat)) {
      args.push(Number(q.cat));
      where.push(`EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id AND x.site_category_id IN (
        WITH RECURSIVE t AS (SELECT id FROM site_categories WHERE id = $${args.length}
          UNION ALL SELECT c.id FROM site_categories c JOIN t ON c.parent_id = t.id) SELECT id FROM t))`);
    }
    if (q.access && Number(q.access)) { args.push(Number(q.access)); where.push(`p.category_external_id = $${args.length}`); }
    const from = `FROM products p LEFT JOIN product_ai_categories a ON a.product_id = p.id LEFT JOIN categories c ON c.external_id = p.category_external_id
      WHERE ${where.join(' AND ')}`;
    const [{ n }] = await this.ds.query(`SELECT COUNT(*)::int AS n ${from}`, args);
    const order = q.view === 'pending' ? 'a.confidence DESC, p.name' : 'p.name';
    const items = await this.ds.query(`
      SELECT p.id, p.external_id AS "externalId", p.name, p.brand, p.quantity::float AS quantity, p.site_cats_manual AS manual,
        c.name AS "accessName",
        COALESCE((SELECT json_agg(json_build_object('id', x.site_category_id, 'source', x.source, 'conf', x.confidence) ORDER BY x.site_category_id)
          FROM product_site_categories x WHERE x.product_id = p.id), '[]') AS cats,
        CASE WHEN a.product_id IS NULL THEN NULL ELSE json_build_object('cat', a.site_category_id, 'conf', a.confidence, 'why', a.reason,
          'status', a.status, 'at', a.checked_at, 'by', a.decided_by) END AS ai
      ${from} ORDER BY ${order}, p.id OFFSET ${(page - 1) * limit} LIMIT ${limit}`, args);
    return { items, total: n, page, limit };
  }

  @Get('product/:id')
  async product(@Param('id', ParseIntPipe) id: number) {
    const [p] = await this.ds.query(`SELECT id, site_cats_manual AS manual FROM products WHERE id = $1`, [id]);
    if (!p) throw new NotFoundException();
    const cats = await this.ds.query(`SELECT site_category_id AS id, source, confidence AS conf FROM product_site_categories WHERE product_id = $1 ORDER BY 1`, [id]);
    const [ai] = await this.ds.query(`SELECT site_category_id AS cat, confidence AS conf, reason AS why, status, checked_at AS at, decided_by AS by
      FROM product_ai_categories WHERE product_id = $1`, [id]);
    return { manual: p.manual, cats, ai: ai || null };
  }

  @Post('assign')
  assign(@Body() b: { ids?: unknown; cats?: unknown; mode?: string }, @Req() req: Req) {
    const mode = b?.mode === 'add' || b?.mode === 'remove' ? b.mode : 'set';
    return this.svc.assign(idList(b?.ids), idList(b?.cats ?? [], 20), mode, req.user?.email ?? 'admin');
  }

  @Post('auto')
  auto(@Body() b: { ids?: unknown }, @Req() req: Req) { return this.svc.auto(idList(b?.ids), req.user?.email ?? 'admin'); }

  @Post('accept')
  accept(@Body() b: { ids?: unknown }, @Req() req: Req) { return this.svc.accept(idList(b?.ids), req.user?.email ?? 'admin'); }

  @Post('reject')
  reject(@Body() b: { ids?: unknown }, @Req() req: Req) { return this.svc.reject(idList(b?.ids), req.user?.email ?? 'admin'); }

  @Post('ai-run')
  aiRun(@Body() b: { ids?: unknown }, @Req() req: Req) {
    const ids = b?.ids === undefined ? undefined : idList(b.ids);
    return this.svc.startAi({ ids, by: req.user?.email ?? 'admin' });
  }

  @Post('rules-run')
  async rulesRun() { await this.svc.runRules(); return this.svc.rules; }

  @Post('rules-test')
  rulesTest(@Body() b: { rules?: unknown; accessIds?: unknown }) { return this.svc.testRules(b?.rules ?? [], b?.accessIds ?? []); }
}
