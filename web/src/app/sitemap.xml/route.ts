/**
 * /sitemap.xml (plan step 9): home, catalog, brands, info pages, every visible site category with in-stock products,
 * every in-stock product and brand page — each URL once per language (hy without prefix, /ru, /en) with
 * <loc> + <lastmod> (hreflang is in the page heads). Data: GET /api/shop/sitemap.
 * Served always, but robots.txt only points to it when SITE_INDEX=1 (test domain stays out of search engines).
 */
const API = process.env.API_ORIGIN ?? 'https://led.creativeweb.am';
const SITE = process.env.SITE_URL ?? 'https://led.creativeweb.am';
const LANGS = [['hy', ''], ['ru', '/ru'], ['en', '/en']] as const;
const STATIC = ['/', '/catalog', '/brands', '/assembly', '/credit', '/about', '/how-to-buy', '/how-to-order', '/how-to-pay', '/delivery',
  '/warranty', '/exchange', '/contacts'];

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const loc = (pre: string, path: string) => SITE + (path === '/' ? pre || '/' : pre + path);

export async function GET() {
  let data: { products: { path: string; at: string }[]; categories: string[]; brands: string[] } = { products: [], categories: [], brands: [] };
  try {
    const r = await fetch(`${API}/api/shop/sitemap`, { next: { revalidate: 600, tags: ['products', 'categories'] } });
    if (r.ok) data = await r.json();
  } catch { /* API down: static pages only */ }
  const entries: { path: string; at?: string }[] = [
    ...STATIC.map((path) => ({ path })),
    ...data.categories.map((path) => ({ path })),
    ...data.brands.map((b) => ({ path: `/brand/${b}` })),
    ...data.products,
  ];
  // Plain format: <url><loc>…</loc><lastmod>2026-11-25T08:18:54+00:00</lastmod></url>, one block per URL.
  // hreflang alternates live in each page's <head>, so they are not repeated here.
  const iso = (d: string | number) => new Date(d).toISOString().slice(0, 19) + '+00:00';
  const newest = data.products.reduce((m, p) => Math.max(m, +new Date(p.at) || 0), 0) || Date.now();
  const urls = entries.flatMap(({ path, at }) => LANGS.map(([, pre]) =>
    `<url>\n<loc>${esc(loc(pre, path))}</loc>\n<lastmod>${iso(at || newest)}</lastmod>\n</url>`));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
