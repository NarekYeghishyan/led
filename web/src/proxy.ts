import { NextResponse, type NextRequest } from 'next/server';

/**
 * Language in the URL: Armenian has no prefix, Russian /ru, English /en (docs/PROJECT_PLAN.md section 11).
 * All routes live under app/[lang]/, so an unprefixed path is rewritten to /hy/... Next runs the proxy again on that
 * rewritten path, so the rewrite carries an internal header (MARK): /hy/... WITH it = our rewrite → pass; /hy/...
 * WITHOUT it = a visitor typed it → 301 to the unprefixed URL (one address per page).
 */
const MARK = 'x-led-lang-rewrite';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next(); // files: static templates, favicon, images
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
  // not for Next's own files, the API or images (paths with a file extension are skipped above)
  matcher: ['/((?!_next|api|internal|img).*)'],
};
