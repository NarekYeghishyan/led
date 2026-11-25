/**
 * Frame of the info / account pages = the templates' info layout (Design/site-src/info_shared.html): breadcrumb, side
 * menu (customers · help · contacts / account), "have a question?" call box, blue hero, then the page body — the
 * template's HTML block from content/info.json, or React children (account page).
 */
import type { Metadata } from 'next';
import content from '@/content/info.json';
import { href, type Lang } from '@/lib/i18n';
import { fixLinks, NEXT, pageUrl, type InfoKey } from '@/lib/pages';
import { Icon } from '../Icon';
import { getInfoBlocks } from '@/lib/api';

type Block = { title: string; icon: string; h1: string; lead: string; html: string };
/** the template text of a page (content/info.json, made by import_design.py) */
export const templateBlock = (k: InfoKey, lang: Lang) => (content as unknown as Record<string, Record<Lang, Block>>)[k][lang];
const FORM = /<form\b[\s\S]*?<\/form>/;
/**
 * Page text = the admin's edit ("Страницы сайта", /api/shop/blocks/info) over the template text, field by field.
 * Edited HTML is already cleaned on the server (formatting only); its [[form]] placeholder = the template's form
 * (the contact form), which is not editable.
 */
export async function block(k: InfoKey, lang: Lang): Promise<Block> {
  const base = templateBlock(k, lang);
  const ed = (await getInfoBlocks().catch(() => null))?.[k]?.[lang];
  if (!ed) return base;
  const form = FORM.exec(base.html)?.[0] ?? '';
  return { ...base, title: ed.title || base.title, h1: ed.h1 || base.h1, lead: ed.lead || base.lead,
    html: ed.html ? ed.html.replace('[[form]]', form) : base.html };
}

/** [hy, ru, en] */
const T: Record<string, [string, string, string]> = {
  credit: ['Ապառիկ', 'Рассрочка', 'Instalments'], about: ['Մեր մասին', 'О нас', 'About us'], help: ['Օգնություն', 'Помощь', 'Help'],
  buy: ['Ինչպես գնել', 'Как купить', 'How to buy'], order: ['Ինչպես պատվիրել', 'Как заказать', 'How to order'], pay: ['Ինչպես վճարել', 'Как оплатить', 'How to pay'],
  delivery: ['Առաքում', 'Доставка', 'Delivery'], warranty: ['Երաշխիք', 'Гарантия', 'Warranty'], exchange: ['Փոխանակում', 'Обмен и возврат', 'Exchange & returns'],
  contacts: ['Կոնտակտներ', 'Контакты', 'Contacts'], register: ['Գրանցում', 'Регистрация', 'Registration'], login: ['Մուտք', 'Вход', 'Log in'],
  account: ['Անձնական էջ', 'Личный кабинет', 'My account'], forgot: ['Գաղտնաբառի վերականգնում', 'Восстановление пароля', 'Password recovery'],
  track: ['Պատվերի կարգավիճակ', 'Отследить заказ', 'Track order'], home: ['Գլխավոր', 'Главная', 'Home'], info: ['Գնորդներին', 'Покупателям', 'Customers'],
  q: ['Հարցեր ունե՞ք', 'Остались вопросы?', 'Have a question?'], qd: ['Երկ–Շբթ 10:30–19:30', 'Пн–Сб 10:30–19:30', 'Mon–Sat 10:30–19:30'],
};
const IC: Record<InfoKey, string> = { credit: 'card', about: 'store', buy: 'cart', order: 'ix-box', pay: 'ix-wallet', delivery: 'truck', warranty: 'shield',
  exchange: 'ix-ref', contacts: 'pin', register: 'user', login: 'shield', account: 'user', forgot: 'shield', track: 'truck' };
const HELP: InfoKey[] = ['buy', 'order', 'track', 'pay', 'delivery', 'warranty', 'exchange'];
const LI: Record<Lang, number> = { hy: 0, ru: 1, en: 2 };
export const label = (k: string, lang: Lang) => T[k][LI[lang]];

/** Page metadata: title from the template block; personal pages (login, account…) are never indexed. */
export async function infoMeta(k: InfoKey, lang: Lang, index = false): Promise<Metadata> {
  const b = await block(k, lang);
  const path = NEXT[k]!;
  const langs = Object.fromEntries((['hy', 'ru', 'en'] as Lang[]).map((x) => [x, href(x, path)]));
  return {
    title: b.title, description: b.lead,
    alternates: { canonical: href(lang, path), languages: { ...langs, 'x-default': langs.hy } },
    robots: index && process.env.SITE_INDEX === '1' ? undefined : { index: false, follow: true },
  };
}

export async function InfoPage({ k, lang, nav, children }: { k: InfoKey; lang: Lang; nav?: React.ReactNode; children?: React.ReactNode }) {
  const b = await block(k, lang);
  const item = (x: InfoKey) => (
    <a key={x} href={pageUrl(lang, x)} className={x === k ? 'on' : undefined} aria-current={x === k ? 'page' : undefined}>
      <Icon name={IC[x]} /><span>{label(x, lang)}</span>
    </a>
  );
  return (
    <main className="wrap info">
      <nav className="crumbs" aria-label="breadcrumb">
        <a href={href(lang, '/')}>{label('home', lang)}</a><span>/</span>
        {HELP.includes(k) ? <><a href={pageUrl(lang, 'buy')}>{label('help', lang)}</a><span>/</span></> : null}
        <b>{label(k, lang)}</b>
      </nav>
      <div className="ip">
        <aside className={`ip-nav${nav ? ' ac-nav' : ''}`}>
          {nav ?? (
            <>
              <div className="ip-menu">
                <h6>{label('info', lang)}</h6>{(['credit', 'about'] as InfoKey[]).map(item)}<hr />
                <h6>{label('help', lang)}</h6>{HELP.map(item)}<hr />
                {(['contacts', 'login', 'register'] as InfoKey[]).map(item)}
              </div>
              <div className="ip-call">
                <b>{label('q', lang)}</b>
                <a href="tel:+37410502802"><Icon name="call" />010 502‑802</a>
                <a href="tel:+37499502802"><Icon name="call" />099 502‑802</a>
                <small>{label('qd', lang)}</small>
              </div>
            </>
          )}
        </aside>
        <div className="ip-main">
          <div className="ip-hero"><span className="ic"><Icon name={b.icon} /></span><div><h1>{b.h1}</h1><p>{b.lead}</p></div></div>
          {children ?? <div dangerouslySetInnerHTML={{ __html: fixLinks(b.html, lang) }} style={{ display: 'contents' }} />}
        </div>
      </div>
    </main>
  );
}
