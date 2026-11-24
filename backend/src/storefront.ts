/**
 * Public product catalog for the storefront (Next.js `web/`): /api/shop/products, /api/shop/products/by-ids,
 * /api/shop/products/:slug, and /api/shop/resolve (301 target for old / renamed URLs). Plan: docs/PROJECT_PLAN.md section 11.
 *
 * Rules:
 * - Only fields in PUBLIC_COLS leave this file. Never `raw`, cost/margin or dealer prices (they live in raw / mirror_rows).
 * - Prices are in ֏: Access price × latest rate of its currency in `Курсы`, rounded to 100 ֏ (֏ prices stay as they are).
 * - A product is shown when it is not deleted, visible, not discontinued, has a price AND is in stock (owner's decision
 *   2026-11-25: in-stock items only for now). Which out-of-stock items stay orderable is an open client question
 *   (docs/PROJECT_PLAN.md section 11 "Open questions") — when decided, change VISIBLE / add the rule here.
 * - Categories = site categories only (`site_categories` + `product_site_categories`), never the Access `Типы`.
 * - URL slug = transliterated name + "-" + Access code; the code finds the product, so renamed products keep working.
 */
import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { identify } from './photos';

const LOW_STOCK = 3; // "last N" on the site
const MAX_LIMIT = 60;
const VISIBLE = `p.deleted_at IS NULL AND p.is_visible AND NOT p.discontinued AND p.price > 0 AND p.quantity > 0`;
const PUBLIC_COLS = `p.id, p.external_id AS "code", p.name, p.slug AS "customSlug", p.unit, p.quantity, p.images, p.barcode,
  p.web_description AS "description", p.seo_title AS "seoTitle", p.seo_description AS "seoDescription", p.weight`;

// ---------------------------------------------------------------- slugs

const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e',
  ю: 'yu', я: 'ya',
};
/** "Мышь Logitech M330 (USB, Black)" → "mysh-logitech-m330-usb-black" (max 80 chars, cut at a word). */
export function translit(s: string) {
  const t = s.toLowerCase().replace(/[а-яё]/g, (ch) => RU[ch] ?? '').replace(/\+/g, ' plus ').replace(/&/g, ' and ')
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (t.length <= 80) return t;
  const cut = t.slice(0, 81);
  return cut.slice(0, cut.lastIndexOf('-') > 40 ? cut.lastIndexOf('-') : 80).replace(/-+$/, '');
}
const slugOf = (p: { code: number; name: string; customSlug?: string | null }) =>
  `${(p.customSlug && translit(p.customSlug)) || translit(p.name) || 'product'}-${p.code}`;

// ---------------------------------------------------------------- caches (one API instance)

type Cat = { id: number; parentId: number | null; slug: string; names: [string, string, string]; visible: boolean; sort: number };
type Tree = { byId: Map<number, Cat>; kids: Map<number | null, Cat[]>; at: number };
type Rates = { map: Map<number, number>; at: number };

const brandCache = new Map<string, string | null>();
const brandOf = (name: string) => {
  let b = brandCache.get(name);
  if (b === undefined) {
    b = identify({ name, brand: null, barcode: null }).brand;
    if (brandCache.size > 50000) brandCache.clear();
    brandCache.set(name, b);
  }
  return b;
};

export type StockState = 'in' | 'low' | 'order';
const stockOf = (qty: number): { qty: number; state: StockState } => {
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  return { qty: q, state: q <= 0 ? 'order' : q <= LOW_STOCK ? 'low' : 'in' };
};

const SORTS = ['default', 'cheap', 'expensive', 'new', 'name'] as const;
type Sort = (typeof SORTS)[number];

type Row = { id: number; code: number; name: string; price: number; quantity: number; hasImg: boolean };

@Controller('shop')
export class StorefrontController {
  private tree: Tree | null = null;
  private rates: Rates | null = null;

  constructor(@InjectDataSource() private ds: DataSource) {}

  /** currency id → ֏ per unit. ֏ itself = 1; others = latest `Курсы` row (by date, then operation code). */
  private async getRates() {
    if (this.rates && Date.now() - this.rates.at < 5 * 60_000) return this.rates.map;
    try {
      const cur: { id: number; short: string }[] = await this.ds.query(
        `SELECT external_id AS id, coalesce(raw->>'Кратко', '') AS short FROM currencies WHERE deleted_at IS NULL`);
      const rows: { cid: number; rate: string }[] = await this.ds.query(
        `SELECT DISTINCT ON ((data->>'КодВалюты')::int) (data->>'КодВалюты')::int AS cid, data->>'Курс' AS rate
         FROM mirror_rows WHERE tbl = 'Курсы' AND deleted_at IS NULL AND (data->>'Курс')::numeric > 0
         ORDER BY (data->>'КодВалюты')::int, data->>'Дата' DESC, (data->>'КодОперации')::int DESC`);
      const map = new Map<number, number>();
      for (const c of cur) if (c.short.toUpperCase() === 'AMD') map.set(c.id, 1);
      for (const r of rows) if (!map.has(r.cid)) map.set(r.cid, Number(r.rate));
      this.rates = { map, at: Date.now() };
    } catch (e) {
      if (!this.rates) throw e; // keep serving the last known rates if the DB hiccups
    }
    return this.rates.map;
  }

  /** SQL for the ֏ price; $1 = currency ids, $2 = their rates (see params()). */
  private static PRICE = `(SELECT CASE WHEN r.rate = 1 THEN ROUND(p.price) ELSE ROUND(p.price * r.rate / 100) * 100 END
    FROM unnest($1::int[], $2::numeric[]) AS r(cid, rate) WHERE r.cid = p.currency_external_id)`;

  private async rateParams() {
    const m = await this.getRates();
    if (!m.size) throw new ServiceUnavailableException('No currency rates yet');
    return [[...m.keys()], [...m.values()]];
  }

  private async getTree() {
    if (this.tree && Date.now() - this.tree.at < 60_000) return this.tree;
    const rows: { id: number; parent_id: number | null; slug: string; name_ru: string; name_hy: string; name_en: string;
      is_visible: boolean; sort: number }[] = await this.ds.query(
      `SELECT id, parent_id, slug, name_ru, name_hy, name_en, is_visible, sort FROM site_categories ORDER BY sort, id`);
    const byId = new Map<number, Cat>();
    const kids = new Map<number | null, Cat[]>();
    const or = (...v: (string | null)[]) => v.find((x) => x) || '';
    for (const r of rows) {
      const c: Cat = { id: r.id, parentId: r.parent_id, slug: r.slug, visible: r.is_visible, sort: r.sort,
        names: [or(r.name_ru, r.name_en, r.name_hy), or(r.name_hy, r.name_ru), or(r.name_en, r.name_ru)] };
      byId.set(c.id, c);
      kids.set(c.parentId, [...(kids.get(c.parentId) || []), c]);
    }
    this.tree = { byId, kids, at: Date.now() };
    return this.tree;
  }

  /** Visible path root → category, or null when the category or one of its parents is hidden / missing. */
  private pathOf(t: Tree, id: number) {
    const out: Cat[] = [];
    for (let c = t.byId.get(id); c; c = c.parentId === null ? undefined : t.byId.get(c.parentId)) {
      if (!c.visible) return null;
      out.unshift(c);
    }
    return out.length ? out : null;
  }

  private subtree(t: Tree, id: number) {
    const ids: number[] = [];
    const walk = (c: Cat) => { if (!c.visible) return; ids.push(c.id); for (const k of t.kids.get(c.id) || []) walk(k); };
    const c = t.byId.get(id);
    if (c) walk(c);
    return ids;
  }

  /** Deepest visible site category of a product (manual > rule > AI on equal depth). */
  private bestPath(t: Tree, placed: { site_category_id: number; source: string }[]) {
    const rank: Record<string, number> = { manual: 3, rule: 2, ai: 1 };
    let best: Cat[] | null = null;
    let bestScore = -1;
    for (const x of placed) {
      const path = this.pathOf(t, x.site_category_id);
      const score = path ? path.length * 10 + (rank[x.source] || 0) : -1;
      if (path && score > bestScore) { best = path; bestScore = score; }
    }
    return best;
  }

  private crumbs(path: Cat[]) {
    return path.map((c, i) => ({ slug: c.slug, path: path.slice(0, i + 1).map((x) => x.slug).join('/'), name: c.names }));
  }

  // ---------------------------------------------------------------- list

  /**
   * GET /api/shop/products?cat=section/group/sub&q=words&brand=Lenovo,HP&min=&max=&sort=&page=&limit=
   * → { items, total, page, pages, limit, facets: { brands, price }, category: { path, children } | null }
   * Facets ignore their own filter (brand counts ignore the brand filter, the price range ignores min/max).
   */
  @Get('products')
  @Header('Cache-Control', 'public, max-age=30')
  async list(@Query() qs: Record<string, string>) {
    const t = await this.getTree();
    const page = Math.max(1, Math.min(1000, parseInt(qs.page, 10) || 1));
    const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(qs.limit, 10) || 24));
    const sort: Sort = (SORTS as readonly string[]).includes(qs.sort) ? (qs.sort as Sort) : 'default';

    let category: { path: ReturnType<StorefrontController['crumbs']>; children: { slug: string; path: string; name: string[] }[] } | null = null;
    let catIds: number[] | null = null;
    if (qs.cat) {
      const slugs = String(qs.cat).split('/').map((s) => s.trim()).filter(Boolean).slice(0, 3);
      let parent: number | null = null;
      let node: Cat | undefined;
      for (const s of slugs) {
        node = (t.kids.get(parent) || []).find((c) => c.slug === s && c.visible);
        if (!node) throw new NotFoundException('Category not found');
        parent = node.id;
      }
      const path = this.pathOf(t, node!.id)!;
      const base = path.map((c) => c.slug).join('/');
      category = {
        path: this.crumbs(path),
        children: (t.kids.get(node!.id) || []).filter((c) => c.visible).map((c) => ({ slug: c.slug, path: `${base}/${c.slug}`, name: c.names })),
      };
      catIds = this.subtree(t, node!.id);
    }

    const words = String(qs.q || '').toLowerCase().split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 1).slice(0, 8);
    const [cids, rates] = await this.rateParams();
    const params: unknown[] = [cids, rates];
    const where = [VISIBLE];
    if (catIds) {
      params.push(catIds);
      where.push(`EXISTS (SELECT 1 FROM product_site_categories x WHERE x.product_id = p.id AND x.site_category_id = ANY($${params.length}::int[]))`);
    }
    for (const w of words) {
      params.push(`%${w.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.barcode ILIKE $${params.length} OR p.external_id::text = '${/^\d+$/.test(w) ? w : '-'}')`);
    }
    const rows: Row[] = (await this.ds.query(
      `SELECT p.id, p.external_id AS code, p.name, ${StorefrontController.PRICE} AS price, p.quantity::float AS quantity,
         (jsonb_array_length(p.images) > 0) AS "hasImg"
       FROM products p WHERE ${where.join(' AND ')}`, params))
      .map((r: Row) => ({ ...r, price: Number(r.price) }))
      .filter((r: Row) => r.price > 0);


    // brand / price filters + facets (brand comes from the name: the Access brand column is empty)
    const want = new Set(String(qs.brand || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    const min = Number(qs.min) || 0;
    const max = Number(qs.max) || Infinity;
    const inPrice = (r: Row) => r.price >= min && r.price <= max;
    const inBrand = (r: Row) => !want.size || want.has((brandOf(r.name) || '').toLowerCase());
    const brandCount = new Map<string, number>();
    let lo = Infinity, hi = 0;
    for (const r of rows) {
      if (inPrice(r)) { const b = brandOf(r.name); if (b) brandCount.set(b, (brandCount.get(b) || 0) + 1); }
      if (inBrand(r)) { lo = Math.min(lo, r.price); hi = Math.max(hi, r.price); }
    }
    const hit = rows.filter((r) => inPrice(r) && inBrand(r));

    const cmp: Record<Sort, (a: Row, b: Row) => number> = {
      default: (a, b) => Number(b.hasImg) - Number(a.hasImg) || b.code - a.code,
      cheap: (a, b) => a.price - b.price || b.code - a.code,
      expensive: (a, b) => b.price - a.price || b.code - a.code,
      new: (a, b) => b.code - a.code,
      name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    };
    hit.sort(cmp[sort]);
    const pages = Math.max(1, Math.ceil(hit.length / limit));
    const slice = hit.slice((page - 1) * limit, page * limit);

    return {
      items: await this.cards(slice.map((r) => r.id)),
      total: hit.length, page, pages, limit, sort,
      facets: {
        brands: [...brandCount].map(([v, n]) => ({ v, n })).sort((a, b) => b.n - a.n || a.v.localeCompare(b.v)),
        price: { min: Number.isFinite(lo) ? lo : 0, max: hi },
      },
      category,
    };
  }

  /**
   * Card data for product ids, in the given order. `section` = slug of the product's catalog section (or null): the site
   * shows img/placeholder/<section>.svg when `image` is null.
   */
  private async cards(ids: number[]) {
    if (!ids.length) return [];
    const [cids, rates] = await this.rateParams();
    const t = await this.getTree();
    const placements: { product_id: number; site_category_id: number; source: string }[] = await this.ds.query(
      `SELECT product_id, site_category_id, source FROM product_site_categories WHERE product_id = ANY($1::int[])`, [ids]);
    const placedBy = new Map<number, typeof placements>();
    for (const x of placements) placedBy.set(x.product_id, [...(placedBy.get(x.product_id) || []), x]);
    const sectionOf = (id: number) => this.bestPath(t, placedBy.get(id) || [])?.[0]?.slug ?? null;
    const rows: (Record<string, unknown> & { id: number; code: number; name: string; customSlug: string | null; quantity: number;
      images: string[]; price: string; unit: string | null })[] = await this.ds.query(
      `SELECT ${PUBLIC_COLS}, ${StorefrontController.PRICE} AS price FROM products p WHERE p.id = ANY($3::int[])`, [cids, rates, ids]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({
      code: r.code, slug: slugOf(r), name: r.name, brand: brandOf(r.name), price: Number(r.price), unit: r.unit,
      stock: stockOf(r.quantity), image: r.images?.[0] ?? null, section: sectionOf(r.id),
    }));
  }

  // ---------------------------------------------------------------- cart / favourites re-check

  /** GET /api/shop/products/by-ids?codes=17053,15221 (Access codes, max 100) → current card data; sold-out/hidden ones listed in `gone`. */
  @Get('products/by-ids')
  @Header('Cache-Control', 'no-store')
  async byIds(@Query('codes') codes: string) {
    const list = [...new Set(String(codes || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0))].slice(0, 100);
    if (!list.length) return { items: [], gone: [] };
    const rows: { id: number; code: number }[] = await this.ds.query(
      `SELECT p.id, p.external_id AS code FROM products p WHERE ${VISIBLE} AND p.external_id = ANY($1::int[])`, [list]);
    const items = await this.cards(rows.map((r) => r.id));
    const found = new Set(items.map((i) => i.code));
    return { items, gone: list.filter((c) => !found.has(c)) };
  }

  // ---------------------------------------------------------------- old / renamed URLs

  /**
   * GET /api/shop/resolve?path=/ru/products/category/genius-hs-04s_6801.html → { to: '/ru/product/…-6801' } or 404.
   * The storefront asks this for every URL it doesn't know and answers with a 301, so pages Google indexed on the old
   * led.am (languages /am, /ru, /en) and category URLs renamed in the admin keep their place. Order:
   *  1. url_redirects (renamed/moved/deleted site categories, old led.am categories)
   *  2. old product URL "…_<Access code>" → product page; not on sale → its site category; unknown → /catalog
   *  3. old info pages (about, contacts, help, cart…) → the new ones
   */
  @Get('resolve')
  @Header('Cache-Control', 'public, max-age=300')
  async resolve(@Query('path') raw: string) {
    const [pathPart, query = ''] = String(raw || '').split('?');
    let p = pathPart;
    try { p = decodeURIComponent(p); } catch { /* keep as is */ }
    p = p.toLowerCase().replace(/\/+$/, '').replace(/\.(html?|php)$/, '');
    const m = /^\/(am|hy|ru|en)(?=\/|$)/.exec(p);
    const lang = m && (m[1] === 'ru' || m[1] === 'en') ? m[1] : 'hy';
    const rest = (m ? p.slice(m[0].length) : p) || '/';
    const pre = lang === 'hy' ? '' : `/${lang}`;
    const app = (to: string) => ({ to: `${pre}${to === '/' ? '' : to}` || '/' });
    const page = (to: string) => ({ to: lang === 'hy' ? to : `${to}${to.includes('?') ? '&' : '?'}lang=${lang}` }); // static templates

    const [r] = await this.ds.query(`SELECT to_path FROM url_redirects WHERE from_path = $1`, [rest]);
    if (r) {
      await this.ds.query(`UPDATE url_redirects SET hits = hits + 1, last_hit_at = now() WHERE from_path = $1`, [rest]);
      return app(r.to_path);
    }
    const prod = /^\/products\/(?:category|item|product)\/.*_(\d{1,7})$/.exec(rest);
    if (prod) {
      const code = Number(prod[1]);
      const [cids, rates] = await this.rateParams();
      const [x] = await this.ds.query(
        `SELECT p.id, p.external_id AS code, p.name, p.slug AS "customSlug", (${VISIBLE} AND ${StorefrontController.PRICE} > 0) AS shown
         FROM products p WHERE p.external_id = $3 AND p.deleted_at IS NULL`, [cids, rates, code]);
      if (x?.shown) return app(`/product/${slugOf(x)}`);
      if (x) {
        const placed = await this.ds.query(`SELECT site_category_id, source FROM product_site_categories WHERE product_id = $1`, [x.id]);
        const best = this.bestPath(await this.getTree(), placed);
        if (best) return app('/' + best.map((c) => c.slug).join('/'));
      }
      return app('/catalog');
    }
    if (rest.startsWith('/products/category/')) return app('/catalog'); // old category without a mapping
    const term = /(?:^|&)term=([^&]*)/.exec(query)?.[1];
    if (rest === '/search') return page(term ? `/search.html?q=${term}` : '/search.html');
    const OLD: Record<string, string> = {
      '/': '/', '/home': '/', '/index': '/', '/about': '/about.html', '/jobs': '/about.html', '/comments': '/about.html',
      '/contacts': '/contacts.html', '/credit_sale': '/credit.html', '/assembly': '/assembly.html', '/products/cart': '/cart.html',
      '/products/compare': '/compare.html', '/users/registration': '/registration.html', '/users/login': '/login.html',
      '/users/forgot': '/forgot-password.html', '/users/profile': '/account.html', '/help_up_menu/change': '/exchange.html',
      '/help_up_menu/delivery': '/delivery.html', '/help_up_menu/how_order': '/how-to-buy.html',
      '/help_up_menu/how_order_2': '/how-to-order.html', '/help_up_menu/how_pay': '/how-to-pay.html', '/help_up_menu/warranty': '/warranty.html',
    };
    if (OLD[rest]) return page(OLD[rest]); // home included: /?lang=ru until the home page moves to Next.js (step 7)
    throw new NotFoundException('No redirect');
  }

  // ---------------------------------------------------------------- product page

  /**
   * GET /api/shop/products/:slug — slug must end with "-<code>" (or be just the code). Returns `slug` = canonical slug:
   * the site 301s when the requested one differs. Includes breadcrumb (deepest site category, manual > rule > AI) and
   * similar products (same category, in stock, nearest price).
   */
  @Get('products/:slug')
  @Header('Cache-Control', 'public, max-age=30')
  async one(@Param('slug') slug: string) {
    const m = /(?:^|-)(\d{1,9})$/.exec(String(slug || ''));
    if (!m) throw new BadRequestException('Bad product address');
    const [cids, rates] = await this.rateParams();
    const [p] = await this.ds.query(
      `SELECT ${PUBLIC_COLS}, ${StorefrontController.PRICE} AS price FROM products p WHERE ${VISIBLE} AND p.external_id = $3`,
      [cids, rates, Number(m[1])]);
    if (!p || !(Number(p.price) > 0)) throw new NotFoundException('Product not found');

    const t = await this.getTree();
    const placed: { site_category_id: number; source: string }[] = await this.ds.query(
      `SELECT site_category_id, source FROM product_site_categories WHERE product_id = $1`, [p.id]);
    const best = this.bestPath(t, placed);

    let similar: Awaited<ReturnType<StorefrontController['cards']>> = [];
    if (best) {
      const leaf = best[best.length - 1];
      const ids: { id: number }[] = await this.ds.query(
        `SELECT p.id FROM products p JOIN product_site_categories x ON x.product_id = p.id AND x.site_category_id = ANY($3::int[])
         WHERE ${VISIBLE} AND p.id <> $4 AND ${StorefrontController.PRICE} > 0
         GROUP BY p.id ORDER BY abs(${StorefrontController.PRICE} - $5) LIMIT 12`,
        [cids, rates, this.subtree(t, leaf.id), p.id, Number(p.price)]);
      similar = await this.cards(ids.map((r) => r.id));
    }

    return {
      code: p.code, slug: slugOf(p), name: p.name, brand: brandOf(p.name), price: Number(p.price), currency: 'AMD', unit: p.unit,
      stock: stockOf(p.quantity), images: p.images || [], barcode: p.barcode || null,
      description: p.description || null, seoTitle: p.seoTitle || null, seoDescription: p.seoDescription || null,
      weight: p.weight || null, section: best?.[0]?.slug ?? null, breadcrumb: best ? this.crumbs(best) : [], similar,
    };
  }
}
