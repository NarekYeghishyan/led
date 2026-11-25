/**
 * Info / account pages (Design/site-src/*_content*.html → src/content/info.json). A page listed in NEXT lives in Next.js at
 * that path (+ /ru, /en); the others are still static templates (`.html`, language from localStorage). Moving a page:
 * add it to NEXT, create its route, add its `.html` to the nginx 301 rule (deploy/nginx-led.creativeweb.am.conf).
 */
import { href, type Lang } from './i18n';

export type InfoKey = 'credit' | 'about' | 'buy' | 'order' | 'pay' | 'delivery' | 'warranty' | 'exchange' | 'contacts' | 'register'
  | 'login' | 'account' | 'forgot' | 'track';

/** static template file of each page */
export const STATIC_FILE: Record<InfoKey, string> = {
  credit: '/credit.html', about: '/about.html', buy: '/how-to-buy.html', order: '/how-to-order.html', pay: '/how-to-pay.html',
  delivery: '/delivery.html', warranty: '/warranty.html', exchange: '/exchange.html', contacts: '/contacts.html',
  register: '/registration.html', login: '/login.html', account: '/account.html', forgot: '/forgot-password.html', track: '/track-order.html',
};
/** pages already in Next.js → their path (without language prefix) */
export const NEXT: Partial<Record<InfoKey, string>> = {
  credit: '/credit', about: '/about', buy: '/how-to-buy', order: '/how-to-order', pay: '/how-to-pay', delivery: '/delivery',
  warranty: '/warranty', exchange: '/exchange', contacts: '/contacts',
  login: '/login', register: '/registration', forgot: '/forgot-password', account: '/account', track: '/track-order',
};

export const pageUrl = (lang: Lang, k: InfoKey) => (NEXT[k] ? href(lang, NEXT[k]!) : STATIC_FILE[k]);

/** Links inside template HTML / API messages: moved pages → Next.js path with the language prefix. */
export function fixLinks(html: string, lang: Lang) {
  let out = html;
  for (const k of Object.keys(NEXT) as InfoKey[]) {
    out = out.split(`"${STATIC_FILE[k]}`).join(`"${href(lang, NEXT[k]!)}`);
  }
  return out.replace(/"\/(cart|favorites|compare)\.html/g, (_, p) => `"${href(lang, `/${p}`)}`);
}
