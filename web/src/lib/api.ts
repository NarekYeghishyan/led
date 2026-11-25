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
  specs?: { k: string; v: string; names: string[] }[];
  oldPrice?: number | null;
}
export interface Crumb { slug: string; path: string; name: string[] }
/** Spec filter from the API: key, label [ru, hy, en], values with counts (counts ignore the key's own selection). */
export interface SpecFacet { k: string; names: string[]; values: { v: string; n: number }[] }
export interface Spec { k: string; v: string; names: string[]; group: string }
export interface ProductList {
  items: ProductCard[]; total: number; page: number; pages: number; limit: number; sort: string;
  facets: { brands: { v: string; n: number }[]; price: { min: number; max: number }; specs: SpecFacet[];
    cats?: { path: string; name: string[]; n: number }[] };
  /** search: the corrected query when words were replaced (typos) */
  fix?: string | null;
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

export interface ProductDetail {
  code: number; slug: string; name: string; brand: string | null; price: number; currency: string; unit: string | null;
  stock: { qty: number; state: StockState }; images: string[]; barcode: string | null; description: string | null;
  seoTitle: string | null; seoDescription: string | null; weight: number | string | null; section: string | null;
  breadcrumb: Crumb[]; similar: ProductCard[]; specs: Spec[];
  /** admin web texts per language: desc, title (SEO), meta (SEO description) */
  web?: Partial<Record<'desc' | 'title' | 'meta', Partial<Record<'hy' | 'ru' | 'en', string>>>>;
  oldPrice?: number | null;
}
/** admin text in the visitor's language, else hy → ru → en, else the old single-language field */
export const webText = (p: ProductDetail, k: 'desc' | 'title' | 'meta', lang: 'hy' | 'ru' | 'en', old: string | null) => {
  const w = p.web?.[k];
  return w?.[lang] || w?.hy || w?.ru || w?.en || old || null;
};
/** GET /api/shop/products/<slug>-<code>; NotFound when unknown or out of stock. */
export const getProduct = (slug: string) => get<ProductDetail>(`/shop/products/${encodeURIComponent(slug)}`, ['products'], 60);

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

/** Home page settings from the admin "Главная страница" (backend site-blocks.ts); empty = automatic defaults. */
export type L3 = Partial<Record<'hy' | 'ru' | 'en', string>>;
export interface HomeBlocks {
  slides: { mode: 'auto' | 'manual'; items: { code: number; tag?: L3 }[] };
  quick: { mode: 'auto' | 'manual'; items: { style: 'sale' | 'srv' | 'new'; title: L3; sub: L3; url: string }[] };
  tabs: string[]; hide: string[];
}
export const getHomeBlocks = () => get<HomeBlocks>('/shop/blocks/home', ['blocks'], 60);
export const getByCodes = (codes: number[]) =>
  get<{ items: ProductCard[] }>(`/shop/products/by-ids?codes=${codes.join(',')}`, ['products'], 60);
/** Info page texts edited in the admin "Страницы сайта": { page: { hy|ru|en: { title?, h1?, lead?, html? } } } */
export const getInfoBlocks = () => get<Record<string, Partial<Record<'hy' | 'ru' | 'en', { title?: string; h1?: string; lead?: string; html?: string }>>>>('/shop/blocks/info', ['blocks'], 60);
