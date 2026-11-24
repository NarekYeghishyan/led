/** Category URL state: ?brand=Lenovo,HP&min=&max=&sort=&page= (page 1 and empty values are left out). */
export interface CatQuery { brand: string[]; min?: number; max?: number; sort?: string; page?: number }
export const SORTS = ['default', 'cheap', 'expensive', 'new', 'name'] as const;

export function parseQuery(sp: Record<string, string | string[] | undefined>): CatQuery {
  const one = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const num = (k: string) => { const n = Math.round(Number(one(k))); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const sort = one('sort');
  const page = num('page');
  return {
    brand: [...new Set((one('brand') || '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 20),
    min: num('min'), max: num('max'),
    sort: sort && (SORTS as readonly string[]).includes(sort) && sort !== 'default' ? sort : undefined,
    page: page && page > 1 ? page : undefined,
  };
}

export function toSearch(q: CatQuery, change: Partial<CatQuery> = {}) {
  const v = { ...q, page: undefined, ...change }; // any filter change goes back to page 1
  const p = new URLSearchParams();
  if (v.brand.length) p.set('brand', v.brand.join(','));
  if (v.min) p.set('min', String(v.min));
  if (v.max) p.set('max', String(v.max));
  if (v.sort) p.set('sort', v.sort);
  if (v.page && v.page > 1) p.set('page', String(v.page));
  const s = p.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}

/** Filters or sorting active → this URL is a variant of the category page (canonical = clean URL, noindex). */
export const isFiltered = (q: CatQuery) => !!(q.brand.length || q.min || q.max || q.sort);
