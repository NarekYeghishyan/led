/**
 * /robots.txt (plan step 9). SITE_INDEX != '1' (test domain, until go-live, step 11): everything disallowed, as the
 * pages' noindex and nginx's X-Robots-Tag. SITE_INDEX=1: crawl the shop, not personal / filtered / search pages, + sitemap.
 */
const SITE = process.env.SITE_URL ?? 'https://led.creativeweb.am';
export const dynamic = 'force-dynamic';

export function GET() {
  const body = process.env.SITE_INDEX === '1'
    ? ['User-agent: *', 'Allow: /',
      ...['/api/', '/admin/', '/internal/', '/search', '/cart', '/favorites', '/compare', '/account', '/login', '/registration', '/forgot-password', '/checkout']
        .flatMap((p) => [`Disallow: ${p}`, `Disallow: /ru${p}`, `Disallow: /en${p}`]),
      'Disallow: /*?*sort=', '', `Sitemap: ${SITE}/sitemap.xml`]
    : ['# Test site: not for search engines (SITE_INDEX is off)', 'User-agent: *', 'Disallow: /'];
  return new Response(body.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
