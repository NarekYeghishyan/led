/**
 * Category URL state: ?brand=Lenovo,HP&min=&max=&sort=&page= plus spec filters ?ram=16 GB,32 GB&cpu=Core i5 (keys from the
 * API's facets.specs, backend/src/specs.ts). Page 1 and empty values are left out; spec keys are written sorted so one
 * filter set has one URL.
 */
export interface CatQuery { brand: string[]; min?: number; max?: number; sort?: string; page?: number; specs: Record<string, string[]> }
export const SORTS = ['default', 'cheap', 'expensive', 'new', 'name'] as const;
const RESERVED = new Set(['brand', 'min', 'max', 'sort', 'page', 'q', 'cat', 'limit', 'stock']);
const SPEC_KEY = /^[a-z][a-z_]{1,15}$/;

const list = (v: string | undefined) => [...new Set((v || '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 20);

export function parseQuery(sp: Record<string, string | string[] | undefined>): CatQuery {
  const one = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const num = (k: string) => { const n = Math.round(Number(one(k))); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const sort = one('sort');
  const page = num('page');
  const specs: Record<string, string[]> = {};
  for (const k of Object.keys(sp).sort()) {
    if (RESERVED.has(k) || !SPEC_KEY.test(k)) continue;
    const v = list(one(k));
    if (v.length) specs[k] = v;
  }
  return {
    brand: list(one('brand')),
    min: num('min'), max: num('max'),
    sort: sort && (SORTS as readonly string[]).includes(sort) && sort !== 'default' ? sort : undefined,
    page: page && page > 1 ? page : undefined,
    specs,
  };
}

export function toSearch(q: CatQuery, change: Partial<CatQuery> = {}) {
  const v = { ...q, page: undefined, ...change }; // any filter change goes back to page 1
  const p = new URLSearchParams();
  if (v.brand.length) p.set('brand', v.brand.join(','));
  for (const k of Object.keys(v.specs).sort()) if (v.specs[k].length) p.set(k, v.specs[k].join(','));
  if (v.min) p.set('min', String(v.min));
  if (v.max) p.set('max', String(v.max));
  if (v.sort) p.set('sort', v.sort);
  if (v.page && v.page > 1) p.set('page', String(v.page));
  const s = p.toString().replace(/%2C/g, ',').replace(/\+/g, '%20');
  return s ? `?${s}` : '';
}

/** One spec value switched on/off. */
export function withSpec(q: CatQuery, k: string, v: string): Partial<CatQuery> {
  const cur = q.specs[k] || [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  const specs = { ...q.specs, [k]: next };
  if (!next.length) delete specs[k];
  return { specs };
}

/** Filters or sorting active → this URL is a variant of the category page (canonical = clean URL, noindex). */
export const isFiltered = (q: CatQuery) => !!(q.brand.length || q.min || q.max || q.sort || Object.keys(q.specs).length);
