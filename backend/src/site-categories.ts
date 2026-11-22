/**
 * Storefront catalog tree — admin "Site categories" (/api/admin/site-categories) and the public tree the site menus
 * read (/api/shop/categories). 3 levels: section (icon + promo line) → group → item. Every change is written to change_log
 * (entity 'site_category'). Not the Access categories: those are read-only and come from the agent.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, Header, NotFoundException, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from './auth';

const MAX_DEPTH = 3; // section → group → item (the site's catalog popup shows exactly these levels)
const TEXT = ['name_ru', 'name_hy', 'name_en', 'icon', 'promo_ru', 'promo_hy', 'promo_en', 'slug'] as const;
const COLS = `c.id, c.parent_id AS "parentId", c.sort, c.slug, c.name_ru AS "nameRu", c.name_hy AS "nameHy", c.name_en AS "nameEn",
  c.icon, c.promo_ru AS "promoRu", c.promo_hy AS "promoHy", c.promo_en AS "promoEn", c.is_visible AS "isVisible",
  c.access_category_ids AS "accessCategoryIds", c.updated_at AS "updatedAt"`;
/** camelCase body field → column */
const FIELD: Record<string, string> = {
  nameRu: 'name_ru', nameHy: 'name_hy', nameEn: 'name_en', icon: 'icon', promoRu: 'promo_ru', promoHy: 'promo_hy', promoEn: 'promo_en',
  slug: 'slug', isVisible: 'is_visible', accessCategoryIds: 'access_category_ids', parentId: 'parent_id',
};

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[″"'`]/g, '').replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

type Req = { user?: { email?: string } };

@Controller('admin/site-categories')
@UseGuards(JwtGuard)
export class SiteCategoriesController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /** Flat list (the admin builds the tree); productCount = products (not deleted) in the linked Access categories. */
  @Get()
  list() {
    return this.ds.query(`
      SELECT ${COLS},
        (SELECT COUNT(*)::int FROM products p WHERE p.deleted_at IS NULL AND p.category_external_id = ANY(c.access_category_ids)) AS "productCount"
      FROM site_categories c ORDER BY c.parent_id NULLS FIRST, c.sort, c.id`);
  }

  @Post()
  async create(@Body() b: Record<string, unknown>, @Req() req: Req) {
    const parentId = b?.parentId === null || b?.parentId === undefined || b?.parentId === '' ? null : Number(b.parentId);
    if (parentId !== null) await this.checkParent(parentId, null);
    const v = this.clean(b, true);
    if (!v.name_ru && !v.name_hy && !v.name_en) throw new BadRequestException('Name is required');
    const slug = await this.freeSlug(parentId, String(v.slug || slugify(String(v.name_en || v.name_ru || v.name_hy || '')) || 'category'), null);
    const [{ s }] = await this.ds.query(
      `SELECT COALESCE(MAX(sort), 0) + 10 AS s FROM site_categories WHERE parent_id IS NOT DISTINCT FROM $1`, [parentId]);
    const [row] = await this.ds.query(
      `INSERT INTO site_categories (parent_id, sort, slug, name_ru, name_hy, name_en, icon, promo_ru, promo_hy, promo_en, is_visible, access_category_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [parentId, s, slug, v.name_ru ?? '', v.name_hy ?? '', v.name_en ?? '', v.icon ?? null, v.promo_ru ?? null, v.promo_hy ?? null,
        v.promo_en ?? null, v.is_visible ?? true, v.access_category_ids ?? []]);
    await this.log('created', row.id, String(v.name_ru || v.name_en || ''), {}, req);
    return this.one(row.id);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() b: Record<string, unknown>, @Req() req: Req) {
    const [cur] = await this.ds.query(`SELECT * FROM site_categories WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException();
    const v = this.clean(b, false);
    if ('parent_id' in v) {
      const p = v.parent_id === null ? null : Number(v.parent_id);
      if (p !== null) await this.checkParent(p, id);
      v.parent_id = p;
    }
    if ('slug' in v || 'parent_id' in v) {
      const parent = 'parent_id' in v ? (v.parent_id as number | null) : cur.parent_id;
      v.slug = await this.freeSlug(parent, String(v.slug || cur.slug), id);
    }
    const changes: Record<string, [unknown, unknown]> = {};
    const sets: string[] = [];
    const args: unknown[] = [id];
    for (const [k, val] of Object.entries(v)) {
      if (JSON.stringify(val) === JSON.stringify(cur[k])) continue;
      changes[k] = [cur[k], val];
      args.push(val);
      sets.push(`${k} = $${args.length}`);
    }
    if (!sets.length) return this.one(id);
    if ('parent_id' in changes) { // moved: goes to the end of its new parent
      const [{ s }] = await this.ds.query(
        `SELECT COALESCE(MAX(sort), 0) + 10 AS s FROM site_categories WHERE parent_id IS NOT DISTINCT FROM $1`, [v.parent_id]);
      args.push(s); sets.push(`sort = $${args.length}`);
    }
    await this.ds.query(`UPDATE site_categories SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, args);
    await this.log('updated', id, cur.name_ru || cur.name_en, changes, req);
    return this.one(id);
  }

  /** Moves the category one place up/down among its siblings. */
  @Post(':id/move')
  async move(@Param('id', ParseIntPipe) id: number, @Body() b: { dir?: string }) {
    const [cur] = await this.ds.query(`SELECT id, parent_id, sort FROM site_categories WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException();
    const sib: { id: number }[] = await this.ds.query(
      `SELECT id FROM site_categories WHERE parent_id IS NOT DISTINCT FROM $1 ORDER BY sort, id`, [cur.parent_id]);
    const i = sib.findIndex((s) => s.id === id);
    const j = b?.dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= sib.length) return { ok: true };
    [sib[i], sib[j]] = [sib[j], sib[i]];
    await this.ds.transaction(async (m) => {
      for (const [k, s] of sib.entries()) await m.query(`UPDATE site_categories SET sort = $2 WHERE id = $1`, [s.id, (k + 1) * 10]);
    });
    return { ok: true };
  }

  /** Deletes the category with everything inside it. */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Req) {
    const [cur] = await this.ds.query(`SELECT * FROM site_categories WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException();
    const [{ n }] = await this.ds.query(`
      WITH RECURSIVE t AS (SELECT id FROM site_categories WHERE id = $1 UNION ALL SELECT c.id FROM site_categories c JOIN t ON c.parent_id = t.id)
      SELECT COUNT(*)::int AS n FROM t`, [id]);
    await this.ds.query(`DELETE FROM site_categories WHERE id = $1`, [id]);
    await this.log('deleted', id, cur.name_ru || cur.name_en, { removed: [n, null] }, req);
    return { ok: true, removed: n };
  }

  // ---------------------------------------------------------------- helpers

  private async one(id: number) {
    const [r] = await this.ds.query(`SELECT ${COLS} FROM site_categories c WHERE c.id = $1`, [id]);
    return r;
  }

  /** Validates body fields and maps them to columns (only the ones present). */
  private clean(b: Record<string, unknown>, creating: boolean) {
    const out: Record<string, unknown> = {};
    for (const [k, col] of Object.entries(FIELD)) {
      if (!b || !(k in b) || (creating && k === 'parentId')) continue;
      const val = b[k];
      if (col === 'is_visible') out[col] = val === true || val === 'true' || val === 1;
      else if (col === 'access_category_ids') {
        if (!Array.isArray(val)) throw new BadRequestException('accessCategoryIds must be an array');
        out[col] = [...new Set(val.map(Number).filter((x) => Number.isInteger(x)))];
      } else if (col === 'parent_id') out[col] = val === null || val === '' ? null : Number(val);
      else if ((TEXT as readonly string[]).includes(col)) {
        const s = val === null || val === undefined ? '' : String(val).trim().slice(0, 300);
        if (col === 'slug') { out[col] = slugify(s); continue; }
        if (col === 'icon' && s && !/^[\w-]{1,40}$/.test(s)) throw new BadRequestException('Bad icon');
        out[col] = col.startsWith('name_') ? s : s || null;
      }
    }
    if (!creating && ['name_ru', 'name_hy', 'name_en'].every((c) => c in out && !out[c])) throw new BadRequestException('Name is required');
    return out;
  }

  /** Parent must exist, not be the category itself or inside it, and keep the tree at most MAX_DEPTH levels deep. */
  private async checkParent(parentId: number, selfId: number | null) {
    const chain: { id: number }[] = await this.ds.query(`
      WITH RECURSIVE up AS (SELECT id, parent_id, 1 AS d FROM site_categories WHERE id = $1
        UNION ALL SELECT c.id, c.parent_id, up.d + 1 FROM site_categories c JOIN up ON c.id = up.parent_id WHERE up.d < 10)
      SELECT id FROM up`, [parentId]);
    if (!chain.length) throw new BadRequestException('Parent not found');
    if (selfId !== null && chain.some((c) => c.id === selfId)) throw new BadRequestException('Cannot move a category inside itself');
    let below = 0; // levels the moved category brings with it (itself = 1)
    if (selfId !== null) {
      const [{ d }] = await this.ds.query(`
        WITH RECURSIVE t AS (SELECT id, 1 AS d FROM site_categories WHERE id = $1
          UNION ALL SELECT c.id, t.d + 1 FROM site_categories c JOIN t ON c.parent_id = t.id WHERE t.d < 10)
        SELECT MAX(d)::int AS d FROM t`, [selfId]);
      below = d;
    } else below = 1;
    if (chain.length + below > MAX_DEPTH) throw new BadRequestException(`The catalog has at most ${MAX_DEPTH} levels`);
  }

  private async freeSlug(parentId: number | null, base: string, selfId: number | null) {
    const b = slugify(base) || 'category';
    for (let i = 1; ; i++) {
      const s = i === 1 ? b : `${b}-${i}`;
      const [hit] = await this.ds.query(
        `SELECT 1 FROM site_categories WHERE parent_id IS NOT DISTINCT FROM $1 AND slug = $2 AND id IS DISTINCT FROM $3`, [parentId, s, selfId]);
      if (!hit) return s;
    }
  }

  private log(action: string, id: number, name: string, changes: Record<string, unknown>, req: Req) {
    return this.ds.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('site_category', $1, $2, $3, $4)`,
      [action, id, name, JSON.stringify({ ...changes, by: [null, req.user?.email ?? 'admin'] })]);
  }
}

/** Public: the visible tree for the site menus. Compact keys: s slug, n [ru,hy,en], i icon, p promo [ru,hy,en], c children. */
@Controller('shop')
export class SiteCategoriesPublicController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get('categories')
  @Header('Cache-Control', 'public, max-age=60')
  async tree() {
    const rows: { id: number; parent_id: number | null; slug: string; name_ru: string; name_hy: string; name_en: string;
      icon: string | null; promo_ru: string | null; promo_hy: string | null; promo_en: string | null }[] = await this.ds.query(
      `SELECT id, parent_id, slug, name_ru, name_hy, name_en, icon, promo_ru, promo_hy, promo_en
       FROM site_categories WHERE is_visible ORDER BY sort, id`);
    type Node = { s: string; n: string[]; i?: string; p?: string[]; c?: Node[] };
    const kids = new Map<number | null, typeof rows>();
    for (const r of rows) kids.set(r.parent_id, [...(kids.get(r.parent_id) || []), r]);
    const or = (...v: (string | null)[]) => v.find((x) => x) || '';
    const build = (parent: number | null): Node[] => (kids.get(parent) || []).map((r) => {
      const n: Node = { s: r.slug, n: [or(r.name_ru, r.name_en, r.name_hy), or(r.name_hy, r.name_ru), or(r.name_en, r.name_ru)] };
      if (parent === null) {
        n.i = r.icon || 'pc';
        if (r.promo_ru || r.promo_hy || r.promo_en) n.p = [or(r.promo_ru, r.promo_en), or(r.promo_hy, r.promo_ru), or(r.promo_en, r.promo_ru)];
      }
      const c = build(r.id);
      if (c.length) n.c = c;
      return n;
    });
    return build(null); // a hidden category hides everything inside it
  }
}
