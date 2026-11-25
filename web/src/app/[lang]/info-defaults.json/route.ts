/**
 * GET /info-defaults.json — the template texts of the editable info pages (content/info.json), for the admin editor
 * "Страницы сайта" to start from. Public data (the same texts are on the pages); the contact form = [[form]].
 */
import content from '@/content/info.json';

const PAGES = ['credit', 'about', 'buy', 'order', 'pay', 'delivery', 'warranty', 'exchange', 'contacts'];
type B = { title: string; h1: string; lead: string; html: string };

export function GET() {
  const c = content as unknown as Record<string, Record<string, B>>;
  const out = Object.fromEntries(PAGES.map((k) => [k, Object.fromEntries(['hy', 'ru', 'en'].map((l) => {
    const b = c[k][l];
    return [l, { title: b.title, h1: b.h1, lead: b.lead, html: b.html.replace(/<form[\s\S]*?<\/form>/, '[[form]]') }];
  }))]));
  return Response.json(out, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
