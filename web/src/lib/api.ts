/**
 * NestJS API client — server side only (pages and layouts). The browser never calls API_ORIGIN.
 * Cached with tags: NestJS can refresh them through /internal/revalidate (tags 'categories', 'products').
 */
import 'server-only';

const API = process.env.API_ORIGIN ?? 'https://led.creativeweb.am';

/** Site catalog node from GET /api/shop/categories: s slug, n [ru, hy, en], i icon, g [viewBox, svg], p promo, k count, c children. */
export interface CatNode {
  s: string; n: string[]; i?: string; g?: [string, string]; p?: string[]; k?: number; c?: CatNode[];
}

export type StockState = 'in' | 'low' | 'order';
export interface ProductCard {
  code: number; slug: string; name: string; brand: string | null; price: number; unit: string | null;
  stock: { qty: number; state: StockState }; image: string | null; section: string | null;
}
export interface Crumb { slug: string; path: string; name: string[] }
export interface ProductList {
  items: ProductCard[]; total: number; page: number; pages: number; limit: number; sort: string;
  facets: { brands: { v: string; n: number }[]; price: { min: number; max: number } };
  category: { path: Crumb[]; children: { slug: string; path: string; name: string[] }[] } | null;
}

async function get<T>(path: string, tags: string[], revalidate: number): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { next: { revalidate, tags }, headers: { accept: 'application/json' } });
  if (res.status === 404) throw new NotFound(path);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export class NotFound extends Error {}

export const getCategories = () => get<CatNode[]>('/shop/categories', ['categories'], 60);

export function getProducts(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  return get<ProductList>(`/shop/products?${q}`, ['products'], 60);
}

/** Popup data per section: 3 in-stock products + top brands. One cached call per section. */
export async function getMegaExtras(sections: CatNode[]) {
  const out: Record<string, { hot: ProductCard[]; brands: string[] }> = {};
  await Promise.all(sections.map(async (s) => {
    try {
      const r = await getProducts({ cat: s.s, limit: 3 });
      out[s.s] = { hot: r.items, brands: r.facets.brands.slice(0, 6).map((b) => b.v) };
    } catch {
      out[s.s] = { hot: [], brands: [] };
    }
  }));
  return out;
}

/** Where an unknown / old URL should 301 to (old led.am pages, renamed categories), or null. Path may include ?query. */
export async function resolvePath(path: string): Promise<string | null> {
  const res = await fetch(`${API}/api/shop/resolve?path=${encodeURIComponent(path)}`, { next: { revalidate: 300, tags: ['categories'] } });
  if (!res.ok) return null;
  const j = (await res.json()) as { to?: string };
  return j.to && j.to.startsWith('/') && !j.to.startsWith('//') ? j.to : null;
}
