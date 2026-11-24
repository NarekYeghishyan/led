import { NextResponse, type NextRequest } from 'next/server';

/**
 * 1. Old led.am URLs (Google has them indexed): /am|/ru|/en + /products/category/…html, /help_up_menu/…, /users/…,
 *    /about.html… → 301 to the new page, decided by the API (/api/shop/resolve: Access code in old product URLs, old
 *    category table, renamed categories). nginx only sends us paths that are not static files.
 * 2. Language in the URL: Armenian has no prefix, Russian /ru, English /en (docs/PROJECT_PLAN.md section 11).
 *    All routes live under app/[lang]/, so an unprefixed path is rewritten to /hy/... Next runs the proxy again on that
 *    rewritten path, so the rewrite carries an internal header (MARK): /hy/... WITH it = our rewrite → pass; WITHOUT it
 *    = a visitor typed it → 301 to the unprefixed URL (one address per page).
 */
const MARK = 'x-led-lang-rewrite';
const API = process.env.API_ORIGIN ?? 'https://led.creativeweb.am';
/** old led.am paths: anything under /am, *.html, and /products|/help_up_menu|/users (optionally after /ru or /en) */
const OLD = /^\/(?:am(?:\/|$)|(?:(?:ru|en)\/)?(?:products|help_up_menu|users)\/)|\.html?$/;

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (/\.(ico|png|jpe?g|webp|svg|css|js|txt|xml|map|woff2?)$/i.test(pathname)) return NextResponse.next();

  // old site: /am/... is always old (the new site has no /am); /ru|/en only for old-style paths
  if (OLD.test(pathname) && req.headers.get(MARK) !== '1') {
    {
      try {
        const r = await fetch(`${API}/api/shop/resolve?path=${encodeURIComponent(pathname + search)}`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          const { to } = (await r.json()) as { to?: string };
          if (to && to.startsWith('/') && !to.startsWith('//')) return NextResponse.redirect(new URL(to, req.url), 301);
        }
      } catch { /* API down: fall through to the 404 page */ }
    }
  }

  if (pathname === '/hy' || pathname.startsWith('/hy/')) {
    if (req.headers.get(MARK) === '1') return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/';
    return NextResponse.redirect(url, 301);
  }
  if (/^\/(ru|en)(\/|$)/.test(pathname)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/hy${pathname === '/' ? '' : pathname}`;
  const headers = new Headers(req.headers);
  headers.set(MARK, '1');
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // not for Next's own files, the API or images
  matcher: ['/((?!_next|api|internal|img).*)'],
};
