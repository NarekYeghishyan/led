'use client';
/**
 * Account page (port of Design/site-src/account_content.html, same markup / classes, styles/info.css). Data from
 * /api/shop/me and /api/shop/me/orders. Sections (#ov #orders #profile #adr #pwd): overview with counts, orders (status
 * filter, expandable items, progress), profile edit, address book (add / edit / default / delete), password change,
 * "log out on all devices". Admin "view as customer" shows a yellow banner with Exit (→ /admin/customers).
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { href, type Lang } from '@/lib/i18n';
import { api, ApiError, cache, errHtml, logout, regionName, REGIONS, type Address, type Me } from '@/lib/auth';
import { get, type StoreKey } from '@/lib/store';
import { Icon } from '../Icon';

const LI: Record<Lang, number> = { ru: 0, hy: 1, en: 2 };
/** [ru, hy, en] — same strings as the template */
const T = {
  ov: ['Обзор', 'Ընդհանուր', 'Overview'], orders: ['Мои заказы', 'Իմ պատվերները', 'My orders'], profile: ['Личные данные', 'Անձնական տվյալներ', 'Personal data'],
  adr: ['Адреса доставки', 'Առաքման հասցեներ', 'Delivery addresses'], pwd: ['Пароль и вход', 'Գաղտնաբառ և մուտք', 'Password and sign-in'], out: ['Выйти', 'Դուրս գալ', 'Log out'],
  fav: ['Избранное', 'Ընտրյալներ', 'Favourites'], cmp: ['Сравнение', 'Համեմատում', 'Compare'], cart: ['Корзина', 'Զամբյուղ', 'Cart'],
  hi: ['Здравствуйте', 'Բարև', 'Hello'], recent: ['Последние заказы', 'Վերջին պատվերները', 'Recent orders'], all: ['Все заказы →', 'Բոլոր պատվերները →', 'All orders →'],
  order: ['Заказ', 'Պատվեր', 'Order'], items: ['шт.', 'հատ', 'pcs'], stAll: ['Все', 'Բոլորը', 'All'],
  pay: ['Оплата', 'Վճարում', 'Payment'], dlv: ['Получение', 'Ստացում', 'Delivery'], none: ['Заказов пока нет', 'Պատվերներ դեռ չկան', 'No orders yet'],
  fname: ['Имя и фамилия', 'Անուն, ազգանուն', 'Full name'], email: ['Электронная почта', 'Էլ. հասցե', 'Email'], phone: ['Телефон', 'Հեռախոս', 'Phone'],
  emailH: ['Нужна для восстановления пароля и писем о заказах', 'Անհրաժեշտ է գաղտնաբառի վերականգնման և պատվերների նամակների համար', 'Used for password recovery and order emails'],
  loc: ['Местоположение', 'Բնակավայր', 'Location'], street: ['Адрес', 'Հասցե', 'Address'], type: ['Тип клиента', 'Հաճախորդի տեսակ', 'Customer type'],
  typeH: ['Чтобы сменить тип, позвоните нам', 'Տեսակը փոխելու համար զանգահարեք մեզ', 'Call us to change the type'],
  company: ['Компания', 'Ընկերություն', 'Company'], tax: ['ИНН (ՀՎՀՀ)', 'ՀՎՀՀ', 'Tax code (TIN)'], lawAdr: ['Юридический адрес', 'Իրավաբանական հասցե', 'Legal address'],
  factAdr: ['Фактический адрес', 'Փաստացի հասցե', 'Actual address'], bank: ['Банковский счёт', 'Բանկային հաշիվ', 'Bank account'],
  save: ['Сохранить', 'Պահպանել', 'Save'], saved: ['Сохранено', 'Պահպանված է', 'Saved'], req: ['* Обязательное поле', '* Պարտադիր դաշտ', '* Required field'],
  oldp: ['Текущий пароль', 'Ընթացիկ գաղտնաբառ', 'Current password'], newp: ['Новый пароль', 'Նոր գաղտնաբառ', 'New password'], rep: ['Повторите пароль', 'Կրկնեք գաղտնաբառը', 'Repeat password'],
  pwdOk: ['Пароль изменён', 'Գաղտնաբառը փոխված է', 'Password changed'], mis: ['Не совпадает', 'Չի համընկնում', 'Does not match'],
  sess: ['Выйти на всех устройствах', 'Դուրս գալ բոլոր սարքերից', 'Log out on all devices'],
  sessP: ['Если вы входили с чужого компьютера или телефона — завершите все сеансы.', 'Եթե մուտք եք գործել ուրիշի համակարգչից կամ հեռախոսից, ավարտեք բոլոր սեանսները։', "If you logged in on someone else's computer or phone, end all sessions."],
  def: ['Основной', 'Հիմնական', 'Default'], mkdef: ['Сделать основным', 'Դարձնել հիմնական', 'Make default'], edit: ['Изменить', 'Փոխել', 'Edit'], del: ['Удалить', 'Ջնջել', 'Delete'],
  add: ['+ Добавить адрес', '+ Ավելացնել հասցե', '+ Add address'], aname: ['Название (Дом, Офис…)', 'Անվանում (Տուն, Գրասենյակ…)', 'Label (Home, Office…)'],
  city: ['Город', 'Քաղաք', 'City'], cancel: ['Отмена', 'Չեղարկել', 'Cancel'], noAdr: ['Адресов пока нет', 'Հասցեներ դեռ չկան', 'No addresses yet'],
  gate: ['Войдите в аккаунт', 'Մուտք գործեք', 'Please log in'], gated: ['Личный кабинет доступен после входа.', 'Անձնական էջը հասանելի է մուտք գործելուց հետո։', 'Your account is available after you log in.'],
  login: ['Войти', 'Մուտք', 'Log in'], reg: ['Регистрация', 'Գրանցում', 'Register'], load: ['Загрузка…', 'Բեռնվում է…', 'Loading…'],
  imp: ['Вы вошли как этот покупатель (администратор)', 'Դուք մուտք եք գործել որպես այս հաճախորդը (ադմինիստրատոր)', 'You are viewing as this customer (admin)'], impX: ['Выйти', 'Դուրս գալ', 'Exit'],
  since: ['Клиент с', 'Հաճախորդ է՝', 'Customer since'], pick: ['Самовывоз', 'Ինքնատարում', 'Pick-up'], cour: ['Доставка', 'Առաքում', 'Courier'], ship: ['доставка', 'առաքում', 'delivery'],
  paid: ['Оплачен', 'Վճարված է', 'Paid'],
  fill: ['Заполните профиль: имя и e-mail помогут при заказе и восстановлении пароля.', 'Լրացրեք պրոֆիլը․ անունը և էլ. հասցեն կօգնեն պատվերի և գաղտնաբառի վերականգնման ժամանակ։', 'Complete your profile: a name and email help with orders and password recovery.'],
} satisfies Record<string, [string, string, string]>;
const ST: [string, string, string][] = [['Принят', 'Ընդունված', 'Received'], ['В обработке', 'Մշակվում է', 'In progress'], ['Выполнен', 'Կատարված', 'Completed']];
const TYPES: [string, string, string][] = [['Частное лицо', 'Ֆիզիկական անձ', 'Private person'], ['Дилер', 'Դիլեր', 'Dealer'], ['Юридическое лицо', 'Իրավաբանական անձ', 'Corporation']];
const PAY: Record<string, [string, string, string]> = { cash: ['Наличными', 'Կանխիկ', 'Cash'], card: ['Картой', 'Քարտով', 'Card'], bank: ['Перечислением', 'Փոխանցումով', 'Bank transfer'], credit: ['Рассрочка', 'Ապառիկ', 'Instalments'] };
const STATUS: Record<string, number> = { received: 0, process: 1, resolved: 2 };
const HYM = ['հունվարի', 'փետրվարի', 'մարտի', 'ապրիլի', 'մայիսի', 'հունիսի', 'հուլիսի', 'օգոստոսի', 'սեպտեմբերի', 'հոկտեմբերի', 'նոյեմբերի', 'դեկտեմբերի'];
type Sec = 'ov' | 'orders' | 'profile' | 'adr' | 'pwd';
const SECS: [Sec, string][] = [['ov', 'grid'], ['orders', 'ix-box'], ['profile', 'user'], ['adr', 'pin'], ['pwd', 'shield']];

type ApiOrder = { id: number; legacyId: number | null; orderedAt: string | null; total: number | null; shipping: boolean | null; shippingCost: number | null;
  currency: string | null; paymentType: string | null; shopAddress: string | null; city: string | null; address: string | null; status: string; paid: boolean | null;
  items: { article: string | null; name: string | null; price: number | null; qty: number | null; total: number | null }[] };

export function Account({ lang }: { lang: Lang }) {
  const tt = (a: readonly [string, string, string]) => a[LI[lang]];
  const t = (k: keyof typeof T) => tt(T[k]);
  const [state, setState] = useState<'load' | 'ok' | 'gate' | 'err'>('load');
  const [u, setU] = useState<Me | null>(null);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [sec, setSec] = useState<Sec>('ov');
  const [flt, setFlt] = useState(-1);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [adrEdit, setAdrEdit] = useState<number | null>(null);
  const [counts, setCounts] = useState({ fav: 0, cmp: 0, cart: 0 });
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const h = location.hash.slice(1);
    if (SECS.some(([k]) => k === h)) setSec(h as Sec);
    setNavEl(document.querySelector<HTMLElement>('.ip-nav'));
    const c = () => setCounts({ fav: get('fav').length, cmp: get('cmp').length, cart: get('cart').reduce((s, x) => s + (x.q || 1), 0) });
    c(); addEventListener('led:store', c);
    const hc = () => { const s = location.hash.slice(1); if (SECS.some(([k]) => k === s)) setSec(s as Sec); };
    addEventListener('hashchange', hc);
    (async () => {
      try {
        const me = await api<Me>('/me'); cache(me); setU(me); setState('ok');
        setOrders(await api<ApiOrder[]>('/me/orders'));
      } catch (e) { setState(e instanceof ApiError && e.status === 401 ? 'gate' : 'err'); }
    })();
    return () => { removeEventListener('led:store', c); removeEventListener('hashchange', hc); };
  }, []);
  // the side menu (template's #ipNav) is rendered here and placed into the frame's aside
  useEffect(() => { navEl?.classList.toggle('ac-nav', state === 'ok'); }, [navEl, state]);

  const go = useCallback((s: Sec) => { setSec(s); setAdrEdit(null); history.replaceState(null, '', `#${s}`); scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const fmt = (n: number | null | undefined, cur?: string | null) =>
    `${Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/[ ,]/g, ' ')}${!cur || /^(amd|֏|dram)$/i.test(cur) ? ' ֏' : ` ${cur}`}`;
  const dfmt = (d: string | null) => {
    if (!d) return '';
    const x = new Date(d);
    if (lang === 'hy') return `${x.getDate()} ${HYM[x.getMonth()]} ${x.getFullYear()} թ.`;
    return x.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const loginUrl = href(lang, '/login'), regUrl = href(lang, '/registration');

  if (state !== 'ok' || !u) {
    const menu = (
      <div className="ip-menu">
        <a href={loginUrl}><Icon name="user" /><span>{t('login')}</span></a>
        <a href={regUrl}><Icon name="doc" /><span>{t('reg')}</span></a>
      </div>
    );
    return (
      <>
        {navEl ? createPortal(menu, navEl) : null}
        {state === 'load' ? <div className="ip-card ac-gate"><p>{t('load')}</p></div> : (
          <div className="ip-card ac-gate">
            <span className="ic"><Icon name="shield" /></span>
            <h2 style={{ justifyContent: 'center' }}>{t('gate')}</h2>
            <p dangerouslySetInnerHTML={{ __html: state === 'err' ? errHtml('server', lang) : t('gated') }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a className="btn p" href={`${loginUrl}?next=${encodeURIComponent(href(lang, '/account'))}`}>{t('login')}</a>
              <a className="btn" href={regUrl}>{t('reg')}</a>
            </div>
          </div>
        )}
      </>
    );
  }

  const who = u.name || u.phone || u.email || u.login || '';
  const ini = (u.name || '').trim() ? u.name!.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : null;
  const ti = Math.max(0, ['consumer', 'dealer', 'corporate'].indexOf(u.type));
  const adrs: Address[] = Array.isArray(u.addresses) ? u.addresses : [];
  const statusOf = (o: ApiOrder) => STATUS[o.status] ?? 0;
  const shown = orders.filter((o) => flt < 0 || statusOf(o) === flt);
  const since = (u.registeredAt || u.createdAt || '').slice(0, 4);
  const out = (e: React.MouseEvent, to: string) => { e.preventDefault(); logout().finally(() => { location.href = to; }); };
  const store = (k: StoreKey) => href(lang, `/${k === 'fav' ? 'favorites' : k === 'cmp' ? 'compare' : 'cart'}`);

  const nav = (
    <div className="ip-menu">
      <div className="ac-who">
        <span className="ac-av">{ini ?? <Icon name="user" />}</span>
        <div><b>{who}</b><small>{u.name ? u.phone || u.email || '' : u.email || ''}</small>{ti > 0 ? <><br /><span className="ac-tag">{tt(TYPES[ti])}</span></> : null}</div>
      </div>
      <div className="ac-tabs">
        {SECS.map(([k, i]) => <a key={k} href={`#${k}`} className={k === sec ? 'on' : undefined} onClick={(e) => { e.preventDefault(); go(k); }}><Icon name={i} /><span>{t(k)}</span></a>)}
      </div>
      <hr />
      <a href={store('fav')}><Icon name="heart" /><span>{t('fav')}</span></a>
      <a href={store('cmp')}><Icon name="cmp" /><span>{t('cmp')}</span></a>
      <a href={store('cart')}><Icon name="cart" /><span>{t('cart')}</span></a>
      <hr />
      <a href={loginUrl} className="ac-out" onClick={(e) => out(e, loginUrl)}><Icon name="arrow" /><span>{t('out')}</span></a>
    </div>
  );

  const orderView = (o: ApiOrder) => {
    const s = statusOf(o);
    const items = o.items.map((x) => ({ nm: x.name || x.article || '—', art: x.article, q: x.qty || 1, p: x.price || 0, tot: x.total ?? (x.price || 0) * (x.qty || 1) }));
    const tot = o.total ?? items.reduce((a, x) => a + x.tot, 0);
    const dl = o.shipping ? [t('cour'), o.city, o.address].filter(Boolean).join(', ') : [t('pick'), o.shopAddress].filter(Boolean).join(', ');
    const isOpen = open.has(o.id);
    return (
      <div key={o.id} className={`ac-ord${isOpen ? ' open' : ''}`}>
        <button className="ac-oh" type="button" onClick={() => setOpen((v) => { const n = new Set(v); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })}>
          <div><b>{t('order')} № {o.legacyId || `S-${o.id}`}</b><small>{dfmt(o.orderedAt)}</small></div>
          <div className="sm"><small>{items.reduce((a, x) => a + x.q, 0)} {t('items')}</small></div>
          <span className={`ac-st s${s}`}>{tt(ST[s])}</span><b>{fmt(tot, o.currency)}</b>
          <svg className="chv" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div className="ac-ob">
          {items.map((x, i) => (
            <div className="ac-it" key={i}><span className="ac-noimg"><Icon name="ix-box" /></span>
              <div>{x.nm}<br /><small>{x.art ? `${x.art} · ` : ''}{x.q} × {fmt(x.p, o.currency)}</small></div><b>{fmt(x.tot, o.currency)}</b></div>
          ))}
          {o.shipping && o.shippingCost ? <div className="ac-it"><span className="ac-noimg"><Icon name="pin" /></span><div>{t('ship')}</div><b>{fmt(o.shippingCost, o.currency)}</b></div> : null}
          <div className="ac-tl">{ST.map((x, i) => <span key={i} className={i <= s ? 'on' : undefined}>{tt(x)}</span>)}</div>
          <small style={{ color: 'var(--muted)' }}>
            {o.paymentType ? `${t('pay')}: ${PAY[o.paymentType] ? tt(PAY[o.paymentType]) : o.paymentType}${o.paid ? ` (${t('paid')})` : ''} · ` : ''}{t('dlv')}: {dl}
          </small>
        </div>
      </div>
    );
  };

  const saveAdr = (list: Address[]) => api<Me>('/me', { method: 'PATCH', body: { addresses: list } }).then((x) => { setU(x); cache(x); setAdrEdit(null); });

  return (
    <>
      {navEl ? createPortal(nav, navEl) : null}
      {u.adminView ? (
        <div className="ac-imp"><Icon name="shield" /><span>{t('imp')} <b>{u.adminView}</b></span>
          <a href="/admin/customers" className="ac-imp-x" onClick={(e) => out(e, '/admin/customers')}>{t('impX')}</a></div>
      ) : null}

      <section className={`ac-sec${sec === 'ov' ? ' on' : ''}`}>
        <div className="ip-card">
          <h2><span className="ic"><Icon name="user" /></span>{t('hi')}{u.name ? `, ${u.name.split(' ')[0]}` : ''}!</h2>
          <p style={{ margin: 0, color: 'var(--muted)' }}>{since ? `${t('since')} ${since}` : ''}</p>
          {!u.name || !u.email ? <p className="ac-fill"><a href="#profile" onClick={(e) => { e.preventDefault(); go('profile'); }}>{t('fill')}</a></p> : null}
        </div>
        <div className="ac-stats" style={{ marginTop: 18 }}>
          <a href="#orders" onClick={(e) => { e.preventDefault(); go('orders'); }}><span className="ic"><Icon name="ix-box" /></span><b>{orders.length || u.orderCount || 0}</b><small>{t('orders')}</small></a>
          <a href={store('fav')}><span className="ic"><Icon name="heart" /></span><b>{counts.fav}</b><small>{t('fav')}</small></a>
          <a href={store('cmp')}><span className="ic"><Icon name="cmp" /></span><b>{counts.cmp}</b><small>{t('cmp')}</small></a>
          <a href={store('cart')}><span className="ic"><Icon name="cart" /></span><b>{counts.cart}</b><small>{t('cart')}</small></a>
        </div>
        <div className="ip-card" style={{ marginTop: 18 }}>
          <h2 style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="ic"><Icon name="ix-box" /></span>{t('recent')}</span>
            {orders.length > 2 ? <a href="#orders" onClick={(e) => { e.preventDefault(); go('orders'); }} style={{ fontSize: 14, color: 'var(--blue-600)' }}>{t('all')}</a> : null}
          </h2>
          {orders.length ? orders.slice(0, 2).map(orderView) : <div className="ac-empty">{t('none')}</div>}
        </div>
      </section>

      <section className={`ac-sec${sec === 'orders' ? ' on' : ''}`}>
        <div className="ip-card"><h2><span className="ic"><Icon name="ix-box" /></span>{t('orders')}</h2>
          <div className="ac-flt">{[-1, 0, 1, 2].map((i) => <button key={i} type="button" className={i === flt ? 'on' : undefined} onClick={() => setFlt(i)}>{i < 0 ? t('stAll') : tt(ST[i])}</button>)}</div>
          {shown.length ? shown.map(orderView) : <div className="ac-empty">{t('none')}</div>}
        </div>
      </section>

      <section className={`ac-sec${sec === 'profile' ? ' on' : ''}`}>
        <div className="ip-card"><h2><span className="ic"><Icon name="user" /></span>{t('profile')}</h2>
          <ProfileForm lang={lang} u={u} ti={ti} t={t} tt={tt} onSaved={(x) => setU(x)} />
        </div>
      </section>

      <section className={`ac-sec${sec === 'adr' ? ' on' : ''}`}>
        <div className="ip-card"><h2><span className="ic"><Icon name="pin" /></span>{t('adr')}</h2>
          {adrEdit !== null ? (
            <AddressForm lang={lang} t={t} a={adrs[adrEdit]} city={regionName(u.city, lang)} onCancel={() => setAdrEdit(null)}
              onSave={(d) => { const list = adrs.slice(); list[adrEdit] = { ...(list[adrEdit] || { def: list.length ? 0 : 1 }), ...d }; return saveAdr(list); }} />
          ) : (
            <div className="ac-adr">
              {adrs.map((a, i) => (
                <div key={i} className={a.def ? 'def' : undefined}>
                  <b>{a.l}{a.def ? <> <span className="ac-tag">{t('def')}</span></> : null}</b><p>{a.city}, {a.a}</p>
                  <div className="acts">
                    <a onClick={() => setAdrEdit(i)}>{t('edit')}</a>
                    {a.def ? null : <a onClick={() => saveAdr(adrs.map((x, k) => ({ ...x, def: k === i ? 1 : 0 })))}>{t('mkdef')}</a>}
                    <a className="del" onClick={() => saveAdr(adrs.filter((_, k) => k !== i))}>{t('del')}</a>
                  </div>
                </div>
              ))}
              <div className="new" onClick={() => setAdrEdit(adrs.length)}>{t('add')}</div>
            </div>
          )}
        </div>
      </section>

      <section className={`ac-sec${sec === 'pwd' ? ' on' : ''}`}>
        <div className="ip-card"><h2><span className="ic"><Icon name="shield" /></span>{t('pwd')}</h2>
          <PasswordForm lang={lang} t={t} />
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '22px 0 16px' }} />
          <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 14 }}>{t('sessP')}</p>
          <button className="btn ac-all" type="button" style={{ font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => api('/logout-all', { method: 'POST' }).catch(() => {}).finally(() => { cache(null); location.href = loginUrl; })}>{t('sess')}</button>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- forms

type TFn = (k: keyof typeof T) => string;
function Err({ e, lang }: { e: unknown; lang: Lang }) {
  if (!e) return null;
  return <div className="au-err w" dangerouslySetInnerHTML={{ __html: errHtml(e instanceof ApiError ? e.code : 'server', lang) }} />;
}
function useFlash() {
  const [on, setOn] = useState(false);
  return [on, () => { setOn(true); setTimeout(() => setOn(false), 4000); }] as const;
}
const btn: React.CSSProperties = { border: 0, font: 'inherit', fontWeight: 600, cursor: 'pointer' };

function ProfileForm({ lang, u, ti, t, tt, onSaved }: { lang: Lang; u: Me; ti: number; t: TFn; tt: (a: readonly [string, string, string]) => string; onSaved: (u: Me) => void }) {
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ok, flash] = useFlash();
  const [bad, setBad] = useState<Set<string>>(new Set());
  const has = REGIONS.some((r) => r[0] === u.city);
  const F = (n: string, l: string, v: string | null, o: { w?: boolean; ty?: string; req?: boolean; min?: number; ac?: string; hint?: string } = {}) => (
    <label className={o.w ? 'w' : undefined}>{l}{o.req ? ' *' : ''}
      <input name={n} type={o.ty || 'text'} defaultValue={v || ''} required={o.req} minLength={o.req ? o.min || 2 : undefined}
        inputMode={o.ty === 'tel' ? 'tel' : undefined} autoComplete={o.ty === 'tel' ? 'tel' : o.ac} className={bad.has(n) ? 'bad' : undefined} />
      {o.hint ? <small className="ac-hint">{o.hint}</small> : null}
    </label>
  );
  return (
    <form className="ip-form ac-prof" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (e.defaultPrevented && e.currentTarget.querySelector('.tel-bad')) return;
      const f = e.currentTarget;
      const d = Object.fromEntries(new FormData(f) as unknown as Iterable<[string, string]>);
      const b = new Set<string>();
      if ((d.phone || '').replace(/\D/g, '').length < 8) b.add('phone');
      if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) b.add('email');
      setBad(b); if (b.size) return;
      setErr(null); setBusy(true);
      try { const x = await api<Me>('/me', { method: 'PATCH', body: d }); cache(x); flash(); setTimeout(() => onSaved(x), 1200); }
      catch (x) { setErr(x); } finally { setBusy(false); }
    }}>
      {F('name', t('fname'), u.name, { w: true, ac: 'name' })}
      {F('phone', t('phone'), u.phone, { ty: 'tel', req: true, min: 8 })}
      {F('email', t('email'), u.email, { ty: 'email', ac: 'email', hint: t('emailH') })}
      <label>{t('loc')}
        <select name="city" defaultValue={u.city || 'Yerevan'}>
          {has || !u.city ? null : <option value={u.city}>{u.city}</option>}
          {REGIONS.map((r) => <option key={r[0]} value={r[0]}>{regionName(r[0], lang)}</option>)}
        </select>
      </label>
      {F('address', t('street'), u.address, { ac: 'street-address' })}
      <label className="w">{t('type')}<input value={tt(TYPES[ti])} disabled readOnly /><small className="ac-hint">{t('typeH')}</small></label>
      {ti === 1 ? F('company', t('company'), u.company, { w: true, ac: 'organization' }) : null}
      {ti === 2 ? <>
        {F('lawName', t('company'), u.lawName || u.company, { w: true, ac: 'organization' })}{F('taxcode', t('tax'), u.taxcode)}{F('bankinfo', t('bank'), u.bankinfo)}
        {F('lawAddress', t('lawAdr'), u.lawAddress, { w: true })}{F('factualAddress', t('factAdr'), u.factualAddress, { w: true })}
      </> : null}
      <Err e={err} lang={lang} />
      <div className="row"><small>{t('req')}</small><span className={`ip-ok${ok ? ' on' : ''}`}><Icon name="check" />{t('saved')}</span>
        <button className="btn p" type="submit" disabled={busy} style={btn}>{t('save')}</button></div>
    </form>
  );
}

function AddressForm({ lang, t, a, city, onCancel, onSave }: { lang: Lang; t: TFn; a?: Address; city: string; onCancel: () => void; onSave: (d: Address) => Promise<unknown> }) {
  const [err, setErr] = useState<unknown>(null);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const F = (n: 'l' | 'city' | 'a', l: string, v: string, w?: boolean) => (
    <label className={w ? 'w' : undefined}>{l} *<input name={n} defaultValue={v} required minLength={2} className={bad.has(n) ? 'bad' : undefined} /></label>
  );
  return (
    <form className="ip-form ac-af" noValidate onSubmit={(e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget) as unknown as Iterable<[string, string]>) as unknown as Address;
      const b = new Set((['l', 'city', 'a'] as const).filter((k) => String(d[k] || '').trim().length < 2));
      setBad(b); if (b.size) return;
      setErr(null); onSave(d).catch(setErr);
    }}>
      {F('l', t('aname'), a?.l || '', true)}{F('city', t('city'), a?.city || city)}{F('a', t('street'), a?.a || '')}
      <Err e={err} lang={lang} />
      <div className="row"><a href="#" className="ac-ac lg-sw" onClick={(e) => { e.preventDefault(); onCancel(); }}>{t('cancel')}</a>
        <button className="btn p" type="submit" style={btn}>{t('save')}</button></div>
    </form>
  );
}

function PasswordForm({ lang, t }: { lang: Lang; t: TFn }) {
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ok, flash] = useFlash();
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [mis, setMis] = useState(false);
  return (
    <form className="ip-form ac-pw" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const d = Object.fromEntries(new FormData(f) as unknown as Iterable<[string, string]>);
      const b = new Set<string>();
      if (!d.old) b.add('old');
      if ((d.password || '').length < 6) b.add('password');
      const m = !!d.re_password && d.re_password !== d.password;
      if (m || (d.re_password || '').length < 6) b.add('re_password');
      setBad(b); setMis(m); if (b.size) return;
      setErr(null); setBusy(true);
      try { await api('/me/password', { method: 'POST', body: { old: d.old, password: d.password } }); f.reset(); flash(); }
      catch (x) { setErr(x); } finally { setBusy(false); }
    }}>
      <label className="w">{t('oldp')} *<input name="old" type="password" required autoComplete="current-password" className={bad.has('old') ? 'bad' : undefined} /></label>
      <label>{t('newp')} *<input name="password" type="password" required minLength={6} autoComplete="new-password" className={bad.has('password') ? 'bad' : undefined} /></label>
      <label>{t('rep')} *<input name="re_password" type="password" required minLength={6} autoComplete="new-password" className={bad.has('re_password') ? 'bad' : undefined} /></label>
      <Err e={err} lang={lang} />
      <div className="row"><small>{t('req')}</small><span className={`ip-ok${ok ? ' on' : ''}`}><Icon name="check" />{t('pwdOk')}</span>
        <button className="btn p" type="submit" disabled={busy} style={btn}>{t('save')}</button></div>
      {mis ? <div className="row rg-mis">{t('mis')}</div> : null}
    </form>
  );
}
