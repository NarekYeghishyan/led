/**
 * Keeps indexed URLs alive (docs/PROJECT_PLAN.md section 11, "URLs"): when a site category's path changes in the admin
 * (slug edit, move, delete), the old path gets a 301 to the new one. Rows live in `url_redirects` (migration 1764700000000).
 */
import { DataSource, EntityManager } from 'typeorm';

/** Top-level slugs that would clash with pages / app routes (/catalog, /product/…, /ru, the static templates…). */
export const RESERVED_ROOT = new Set([
  'catalog', 'product', 'products', 'p', 'hy', 'am', 'ru', 'en', 'api', 'admin', 'img', 'media', '_next', 'internal', 'search',
  'cart', 'checkout', 'account', 'login', 'logout', 'register', 'registration', 'forgot-password', 'compare', 'favorites',
  'brand', 'brands', 'about', 'contacts', 'delivery', 'warranty', 'exchange', 'credit', 'help', 'track-order', 'assembly',
  'how-to-buy', 'how-to-order', 'how-to-pay', 'sitemap', 'robots', 'sale', 'new', 'home', 'index', 'static', 'favicon',
]);

type Q = DataSource | EntityManager;

/** id → "/section/group/item" for every site category. */
export async function categoryPaths(q: Q) {
  const rows: { id: number; parent_id: number | null; slug: string }[] = await q.query(`SELECT id, parent_id, slug FROM site_categories`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Map<number, string>();
  const path = (id: number, depth = 0): string => {
    const hit = out.get(id);
    if (hit) return hit;
    const r = byId.get(id)!;
    const p = (r.parent_id && depth < 10 ? path(r.parent_id, depth + 1) : '') + '/' + r.slug;
    out.set(id, p);
    return p;
  };
  for (const r of rows) path(r.id);
  return { paths: out, parentOf: new Map(rows.map((r) => [r.id, r.parent_id])) };
}

/**
 * After a change: every category whose path changed gets old → new; deleted ones point to their nearest surviving
 * parent (or /catalog). Existing redirects to an old path are re-pointed (no chains), and a path that is live again
 * stops redirecting.
 */
export async function recordPathChanges(q: Q, before: Awaited<ReturnType<typeof categoryPaths>>, note: string) {
  const after = await categoryPaths(q);
  const moves: [string, string][] = [];
  for (const [id, oldPath] of before.paths) {
    let to = after.paths.get(id);
    if (!to) { // deleted: walk up the old tree to the first parent that still exists
      for (let p = before.parentOf.get(id); p && !to; p = before.parentOf.get(p)) to = after.paths.get(p);
      to = to || '/catalog';
    }
    if (to !== oldPath) moves.push([oldPath, to]);
  }
  for (const [from, to] of moves) {
    await q.query(`UPDATE url_redirects SET to_path = $2 WHERE to_path = $1`, [from, to]);
    await q.query(
      `INSERT INTO url_redirects (from_path, to_path, source, note) VALUES ($1, $2, 'slug', $3)
       ON CONFLICT (from_path) DO UPDATE SET to_path = EXCLUDED.to_path, source = 'slug', note = EXCLUDED.note`, [from, to, note]);
  }
  const live = [...after.paths.values()];
  if (live.length) await q.query(`DELETE FROM url_redirects WHERE from_path = ANY($1::text[])`, [live]);
  return moves.length;
}
