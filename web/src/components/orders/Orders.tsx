'use client';
/**
 * Real orders (plan step 10): checkout page, 1-click modal, order tracking. Orders go to POST /api/shop/orders, which re-prices
 * every line from the DB (the browser's cart prices are only shown). Layout and classes = the templates (shop_pages.html
 * checkout → styles/shop.css .co-*, oneclick.html .oc-*, track_content.html .tr-* → styles/orders.css), minus demo parts:
 * no delivery fees (the manager confirms them — open client question), no promo code, no instalment maths, no online payment
 * (no payment gateway yet: card = at pick-up / to the courier).
 * Numbers of the visitor's own orders are kept in localStorage `led-my-orders` ([{ n, phone }], last 10) for quick tracking.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { href, money, type Lang } from '@/lib/i18n';
import { get, set, codeOf, type StoreItem } from '@/lib/store';
import { api, ApiError, REGIONS } from '@/lib/auth';
import { pageUrl } from '@/lib/pages';
import { Icon } from '../Icon';

const LI: Record<Lang, number> = { hy: 0, ru: 1, en: 2 };
type L3 = [string, string, string];
const PHONE = '+37410502802';

/* [hy, ru, en] */
const T = {
  h: ['Պատվերի ձևակերպում', 'Оформление заказа', 'Checkout'],
  cart: ['Զամբյուղ', 'Корзина', 'Cart'], step2: ['Ձևակերպում', 'Оформление', 'Checkout'], step3: ['Պատրաստ է', 'Готово', 'Done'],
  items: ['ապրանք', 'товара', 'items'],
  c1: ['Կոնտակտային տվյալներ', 'Контактные данные', 'Contact details'], have: ['Արդեն գնե՞լ եք մեզանից', 'Уже покупали у нас?', 'Bought from us before?'],
  in: ['Մուտք', 'Войти', 'Log in'], hello: ['Դուք մուտք եք գործել որպես', 'Вы вошли как', 'Logged in as'],
  per: ['Ֆիզիկական անձ', 'Частное лицо', 'Private person'], com: ['Ընկերություն', 'Компания', 'Company'],
  name: ['Անուն, ազգանուն', 'Имя и фамилия', 'Full name'], phone: ['Հեռախոս', 'Телефон', 'Phone'], email: ['Էլ. հասցե', 'E‑mail', 'Email'],
  cname: ['Ընկերության անվանում', 'Название компании', 'Company name'], tax: ['ՀՎՀՀ', 'ИНН (ՀՎՀՀ)', 'Tax code (TIN)'],
  c2: ['Ստանալու եղանակը', 'Способ получения', 'Delivery'],
  pick: ['Վերցնել խանութից', 'Самовывоз', 'Pick-up'], pickS: ['Կիևյան 11‑34', 'Киевяна 11‑34', '11‑34 Kievyan St'],
  cour: ['Առաքիչ Երևանում', 'Курьер по Еревану', 'Courier, Yerevan'], courS: ['Ընտրեք օրը և ժամը', 'Выберите день и время', 'Choose day and time'],
  reg: ['Առաքում մարզեր', 'Доставка по Армении', 'Delivery in Armenia'], regS: ['Մարզեր և քաղաքներ', 'Области и города', 'Provinces and towns'],
  fee: ['արժեքը կհաստատի մենեջերը', 'стоимость подтвердит менеджер', 'cost confirmed by the manager'], free: ['անվճար', 'бесплатно', 'free'],
  city: ['Քաղաք / գյուղ', 'Город / село', 'Town / village'], marz: ['Մարզ', 'Область', 'Province'], adr: ['Փողոց, շենք, բնակարան', 'Улица, дом, квартира', 'Street, building, flat'],
  date: ['Ամսաթիվ', 'Дата', 'Date'], time: ['Ժամ', 'Время', 'Time'], saved: ['Իմ հասցեները', 'Мои адреса', 'My addresses'],
  store: ['LED Computers ցուցասրահ', 'Шоурум LED Computers', 'LED Computers showroom'],
  storeA: ['Կիևյան 11‑34, Երևան · Երկ–Շբթ 10:30–19:30', 'Киевян 11‑34, Ереван · Пн–Сб 10:30–19:30', '11‑34 Kievyan St, Yerevan · Mon–Sat 10:30–19:30'],
  storeR: ['Մենեջերը կզանգի, երբ պատվերը պատրաստ լինի։', 'Менеджер позвонит, когда заказ будет готов.', 'A manager will call you when the order is ready.'],
  c3: ['Վճարման եղանակը', 'Способ оплаты', 'Payment'],
  cash: ['Կանխիկ', 'Наличными', 'Cash'], cashS: ['Ստանալիս՝ խանութում կամ առաքիչին', 'При получении: в магазине или курьеру', 'On receipt: in store or to the courier'],
  card: ['Քարտով ստանալիս', 'Картой при получении', 'Card on receipt'], cardS: ['ArCa, Visa, Mastercard', 'ArCa, Visa, Mastercard', 'ArCa, Visa, Mastercard'],
  inst: ['Ապառիկ', 'Рассрочка', 'Instalments'], instS: ['Պայմանները կներկայացնի մենեջերը', 'Условия сообщит менеджер', 'The manager explains the terms'],
  bank: ['Անկանխիկ փոխանցում', 'Безналичный расчёт', 'Bank transfer'], bankS: ['Հաշիվ-ապրանքագիր ԱԱՀ-ով', 'Счёт для юр. лиц с НДС', 'VAT invoice for companies'],
  c4: ['Մեկնաբանություն', 'Комментарий к заказу', 'Order comment'],
  cmt: ['Օրինակ՝ զանգահարեք առաքումից մեկ ժամ առաջ', 'Например: позвоните за час до доставки', 'E.g. call an hour before delivery'],
  call: ['Զանգահարեք ինձ հաստատելու համար', 'Перезвоните мне для подтверждения', 'Call me to confirm'],
  agree: ['Համաձայն եմ', 'Я согласен с', 'I agree to the'], terms: ['գնման և վերադարձի պայմաններին', 'условиями покупки и возврата', 'purchase and return terms'],
  place: ['Հաստատել պատվերը', 'Подтвердить заказ', 'Place order'], sending: ['Ուղարկվում է…', 'Отправляем…', 'Sending…'],
  inOrder: ['Պատվերի ապրանքները', 'Товары в заказе', 'Items in order'], edit: ['Փոխել', 'Изменить', 'Edit'],
  goods: ['Ապրանքներ', 'Товары', 'Goods'], ship: ['Առաքում', 'Доставка', 'Delivery'], total: ['Ընդամենը', 'Итого', 'Total'],
  req: ['Լրացրեք պարտադիր դաշտերը', 'Заполните обязательные поля', 'Please fill in the required fields'],
  agreeReq: ['Հաստատեք պայմանների համաձայնությունը', 'Подтвердите согласие с условиями', 'Please accept the terms'],
  gone: ['Որոշ ապրանքներ այլևս վաճառքում չեն և հանվել են զամբյուղից։ Ստուգեք պատվերը։', 'Некоторых товаров больше нет в продаже, они убраны из корзины. Проверьте заказ.', 'Some items are no longer on sale and were removed from the cart. Please check the order.'],
  err: ['Չհաջողվեց ուղարկել։ Փորձեք կրկին կամ զանգահարեք 010 502-802։', 'Не удалось отправить. Попробуйте ещё раз или позвоните 010 502-802.', 'Could not send. Try again or call 010 502-802.'],
  many: ['Չափազանց շատ փորձեր։ Զանգահարեք 010 502-802։', 'Слишком много попыток. Позвоните 010 502-802.', 'Too many attempts. Please call 010 502-802.'],
  ok: ['Շնորհակալություն։ Պատվերն ընդունված է', 'Спасибо! Заказ принят', 'Thank you! Your order is placed'], num: ['Պատվերի համար', 'Номер заказа', 'Order number'],
  next: ['Ինչ է լինելու հետո', 'Что дальше', 'What happens next'],
  n1: ['Մենեջերը կզանգի՝ հաստատելու պատվերը և առաքման արժեքը', 'Менеджер позвонит, чтобы подтвердить заказ и стоимость доставки', 'A manager calls to confirm the order and the delivery cost'],
  n2: ['Կհավաքենք և կստուգենք պատվերը', 'Мы соберём и проверим заказ', 'We pack and check your order'],
  n3: ['Կառաքենք կամ կպատրաստենք ինքնատարման համար', 'Доставим или подготовим к самовывозу', 'We deliver it or get it ready for pick-up'],
  track: ['Հետևել պատվերին', 'Отследить заказ', 'Track order'], toAcc: ['Իմ պատվերները', 'Мои заказы', 'My orders'], cont: ['Շարունակել գնումները', 'Продолжить покупки', 'Continue shopping'],
  empty: ['Զամբյուղը դատարկ է', 'Корзина пуста', 'Your cart is empty'], toCat: ['Անցնել կատալոգ', 'В каталог', 'Go to catalog'],
  tomorrow: ['Վաղը', 'Завтра', 'Tomorrow'],
  // 1-click
  ocH: ['Գնել 1 քայլով', 'Купить в 1 клик', 'Buy in 1 click'],
  ocP: ['Թողեք հեռախոսահամարը․ մենեջերը կզանգի և կձևակերպի պատվերը։', 'Оставьте телефон — менеджер перезвонит и оформит заказ.', 'Leave your phone — a manager will call back and place the order.'],
  ocName: ['Անուն', 'Имя', 'Name'], ocCmt: ['Մեկնաբանություն', 'Комментарий', 'Comment'], ocGo: ['Սպասում եմ զանգի', 'Жду звонка', 'Call me back'],
  ocAgree: ['Սեղմելով կոճակը՝ համաձայնում եք', 'Нажимая кнопку, вы соглашаетесь с', 'By clicking you agree to the'],
  ocOk: ['Հայտն ընդունված է։', 'Заявка принята!', 'Request received!'], ocOkP: ['Մենեջերը կզանգի', 'Менеджер перезвонит на', 'A manager will call'],
  ocOkT: ['աշխատանքային ժամերին (Երկ–Շբթ 10:30–19:30)։', 'в рабочее время (Пн–Сб 10:30–19:30).', 'during working hours (Mon–Sat 10:30–19:30).'],
  close: ['Փակել', 'Закрыть', 'Close'], badPhone: ['Մուտքագրեք ճիշտ հեռախոսահամար', 'Введите правильный номер телефона', 'Enter a valid phone number'],
  // tracking
  tn: ['Պատվերի համար', 'Номер заказа', 'Order number'], tgo: ['Հետևել', 'Отследить', 'Track'],
  thint: ['Համարը կա պատվերից հետո բացված էջում և նամակում։ Հեռախոսը՝ այն, որը նշել եք պատվերում։', 'Номер — на странице после заказа и в письме. Телефон — тот, что указан в заказе.', 'The number is on the page after ordering and in the e-mail. The phone is the one given in the order.'],
  tmine: ['Իմ վերջին պատվերները՝', 'Мои последние заказы:', 'My recent orders:'],
  tnf: ['Պատվերը չի գտնվել։ Ստուգեք համարը և հեռախոսը կամ զանգահարեք՝ 010 502-802։', 'Заказ не найден. Проверьте номер и телефон или позвоните: 010 502-802.', 'Order not found. Check the number and phone or call 010 502-802.'],
  order: ['Պատվեր', 'Заказ', 'Order'], hist: ['Պատմություն', 'История', 'History'], det: ['Մանրամասներ', 'Детали', 'Details'],
  dl: ['Ստացում', 'Получение', 'Delivery'], pay: ['Վճարում', 'Оплата', 'Payment'], when: ['Օր և ժամ', 'День и время', 'Day and time'],
  callMgr: ['Զանգահարել մենեջերին', 'Позвонить менеджеру', 'Call the manager'], oc: ['1 քայլով հայտ', 'Заявка в 1 клик', '1-click request'],
} satisfies Record<string, L3>;
const S: Record<string, L3> = {
  new: ['Ընդունված', 'Принят', 'Received'], confirmed: ['Հաստատված', 'Подтверждён', 'Confirmed'], shipped: ['Ճանապարհին / պատրաստ', 'В пути / готов', 'On the way / ready'],
  done: ['Ստացված', 'Получен', 'Completed'], cancelled: ['Չեղարկված', 'Отменён', 'Cancelled'],
};
const STEPS = ['new', 'confirmed', 'shipped', 'done'];
const PAYS = ['cash', 'card', 'inst', 'bank'] as const;
const SLOTS = ['10:00–13:00', '13:00–16:00', '16:00–19:00'];
const HYM = ['հնվ', 'փտվ', 'մրտ', 'ապր', 'մյս', 'հնս', 'հլս', 'օգս', 'սպտ', 'հկտ', 'նյմ', 'դկտ'];

const tr = (lang: Lang) => (k: keyof typeof T) => T[k][LI[lang]];
const digits = (s: string) => s.replace(/\D/g, '');
const phoneOk = (s: string) => { const d = digits(s); return d.length === 11 && d.startsWith('374') || d.length === 9 && d.startsWith('0') || d.length === 8; };
const user = () => { try { return JSON.parse(localStorage.getItem('led-user') || 'null'); } catch { return null; } };
function dateL(lang: Lang, iso: string | Date, time = false) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const hm = time ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  if (lang === 'hy') return `${d.getDate()} ${HYM[d.getMonth()]} ${d.getFullYear()}${hm}`;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + hm;
}
function remember(n: string, phone: string) {
  try {
    const l: { n: string; phone: string }[] = JSON.parse(localStorage.getItem('led-my-orders') || '[]');
    localStorage.setItem('led-my-orders', JSON.stringify([{ n, phone }, ...l.filter((x) => x.n !== n)].slice(0, 10)));
  } catch { /* private mode */ }
}
const errText = (lang: Lang, e: unknown) => {
  const L = tr(lang);
  if (e instanceof ApiError) {
    if (e.code === 'too_many') return L('many');
    if (e.code === 'bad_phone') return L('badPhone');
    if (e.code === 'required') return L('req');
  }
  return L('err');
};
/** Remove sold-out lines named by the API ('gone') from the cart. */
async function dropGone(codes?: number[]) {
  if (!codes?.length) return;
  set('cart', get('cart').filter((x) => !codes.includes(codeOf(x.id) ?? -1)));
}
async function sendOrder(body: Record<string, unknown>) {
  try {
    return await api<{ number: string; total: number; items: { code: number; name: string; price: number; qty: number }[] }>('/orders', { method: 'POST', body });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'gone') {
      // the API lists the codes in `gone`; re-read them via by-ids would be another round trip — StoreSync removes them on reload
      const r = await fetch('/api/shop/products/by-ids?codes=' + (body.items as { code: number }[]).map((x) => x.code).join(','), { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      await dropGone(r?.gone);
    }
    throw e;
  }
}

// ---------------------------------------------------------------- checkout

type Co = { who: 'person' | 'company'; name: string; phone: string; email: string; company: string; tax: string; ship: 'pick' | 'cour' | 'reg';
  region: string; city: string; address: string; day: string; slot: string; pay: (typeof PAYS)[number]; comment: string; call: boolean; agree: boolean };
const CO0: Co = { who: 'person', name: '', phone: '', email: '', company: '', tax: '', ship: 'pick', region: REGIONS[1][0], city: '', address: '', day: '', slot: SLOTS[0],
  pay: 'cash', comment: '', call: true, agree: false };

export function CheckoutPage({ lang }: { lang: Lang }) {
  const L = tr(lang);
  const [cart, setCart] = useState<StoreItem[] | null>(null);
  const [co, setCo] = useState<Co>(CO0);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ number: string; total: number; items: { name: string; price: number; qty: number }[]; email: string } | null>(null);
  const [u, setU] = useState<{ fname?: string; login?: string } | null>(null);
  const [adrs, setAdrs] = useState<{ l: string; city: string; a: string }[]>([]);

  useEffect(() => {
    const r = () => setCart(get('cart').filter((x) => codeOf(x.id) !== null));
    r(); addEventListener('led:store', r); addEventListener('storage', r);
    let saved: Partial<Co> & { ship?: string } = {};
    try { saved = JSON.parse(sessionStorage.getItem('led-co') || '{}'); } catch { /* */ }
    const me = user();
    setU(me);
    try { setAdrs(JSON.parse(localStorage.getItem('led-adr') || '[]') || []); } catch { /* */ }
    const pre: Partial<Co> = me ? { name: me.fname || '', phone: me.phone || '', email: me.email || '',
      ...(me.type === 'dealer' || me.type === 'corporate' ? { who: 'company' as const, company: me.company || '', tax: me.taxcode || '' } : {}),
      address: me.address || '' } : {};
    const ship = ['pick', 'cour', 'reg'].includes(String(saved.ship)) ? saved.ship as Co['ship'] : 'pick';
    setCo({ ...CO0, ...pre, ...Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== '' && v !== undefined)), ship, agree: false });
    return () => { removeEventListener('led:store', r); removeEventListener('storage', r); };
  }, []);
  const upd = (p: Partial<Co>) => setCo((c) => {
    const n = { ...c, ...p };
    if (n.who === 'person' && n.pay === 'bank') n.pay = 'cash';
    try { const { agree: _a, ...keep } = n; sessionStorage.setItem('led-co', JSON.stringify(keep)); } catch { /* */ }
    return n;
  });
  const field = (k: keyof Co) => ({ name: k, value: String(co[k] ?? ''), className: bad.has(k) ? 'bad' : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { upd({ [k]: e.target.value } as Partial<Co>); setBad((b) => { const n = new Set(b); n.delete(k); return n; }); } });
  const days = useMemo(() => [1, 2, 3, 4, 5].map((i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const dayVal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (done) {
    return (
      <>
        <nav className="crumbs" aria-label="breadcrumb"><a href={href(lang, '/')}>LED</a><span>/</span><b>{L('h')}</b></nav>
        <div className="sp-card co-done">
          <div className="art"><Icon name="check" /></div>
          <h1>{L('ok')}</h1>
          <div className="co-num"><small>{L('num')}</small><b>№ {done.number}</b></div>
          <div className="co-next"><h3>{L('next')}</h3><ol>
            <li><Icon name="call" /><span>{L('n1')}</span></li><li><Icon name="ix-box" /><span>{L('n2')}</span></li><li><Icon name="truck" /><span>{L('n3')}</span></li>
          </ol></div>
          <div className="co-sum2">
            {done.items.map((x, i) => <div key={i}><span>{x.name} × {x.qty}</span><b>{money(x.price * x.qty)}</b></div>)}
            <div className="tt"><span>{L('total')}</span><b>{money(done.total)}</b></div>
          </div>
          <div className="co-btns">
            <a className="sp-b" href={`${href(lang, '/track-order')}?n=${done.number}`}>{L('track')}</a>
            {u ? <a className="sp-b p" href={`${pageUrl(lang, 'account')}#orders`}>{L('toAcc')}</a> : null}
            <a className={`sp-b${u ? '' : ' p'}`} href={href(lang, '/catalog')}>{L('cont')}</a>
          </div>
        </div>
      </>
    );
  }
  if (!cart) return <div style={{ minHeight: 400 }} />;
  if (!cart.length) {
    return (
      <div className="sp-card sp-empty" style={{ marginTop: 20 }}>
        <div className="art"><Icon name="cart" /></div><h2>{L('empty')}</h2>
        <a className="sp-b p" href={href(lang, '/catalog')}>{L('toCat')}</a>
      </div>
    );
  }
  const n = cart.reduce((s, x) => s + (x.q || 1), 0);
  const goods = cart.reduce((s, x) => s + x.p * (x.q || 1), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const b = new Set<string>();
    if (co.name.trim().length < 2) b.add('name');
    if (!phoneOk(co.phone)) b.add('phone');
    if (co.email && !/^\S+@\S+\.\S+$/.test(co.email)) b.add('email');
    if (co.who === 'company') { if (!co.company.trim()) b.add('company'); if (digits(co.tax).length !== 8) b.add('tax'); }
    if (co.ship !== 'pick' && co.address.trim().length < 3) b.add('address');
    if (co.ship === 'reg' && !co.city.trim()) b.add('city');
    setBad(b);
    if (b.size || !co.agree) {
      setErr(b.size ? L('req') : L('agreeReq'));
      setTimeout(() => document.querySelector('.co .bad')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }
    setErr(''); setBusy(true);
    try {
      const r = await sendOrder({ kind: 'checkout', lang, items: cart.map((x) => ({ code: codeOf(x.id), q: x.q || 1 })), name: co.name, phone: co.phone,
        email: co.email, who: co.who, company: co.company, tax: co.tax, ship: co.ship, region: co.ship === 'reg' ? co.region : '', city: co.city,
        address: co.address, day: co.ship === 'cour' ? co.day || dayVal(days[0]) : '', slot: co.slot, pay: co.pay, comment: co.comment, call: co.call });
      remember(r.number, co.phone);
      set('cart', []);
      try { sessionStorage.removeItem('led-co'); } catch { /* */ }
      setDone({ ...r, email: co.email });
      scrollTo({ top: 0 });
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.code === 'gone' ? L('gone') : errText(lang, e2));
    } finally { setBusy(false); }
  };

  const opt = (name: string, val: string, on: boolean, ic: string, b: string, s: string, onPick: () => void) => (
    <label key={val} className={`sp-opt${on ? ' on' : ''}`}>
      <input type="radio" name={name} value={val} checked={on} onChange={onPick} /><Icon name={ic} /><span><b>{b}</b><small>{s}</small></span>
    </label>
  );
  return (
    <>
      <nav className="crumbs" aria-label="breadcrumb"><a href={href(lang, '/')}>LED</a><span>/</span><a href={href(lang, '/cart')}>{L('cart')}</a><span>/</span><b>{L('h')}</b></nav>
      <div className="sp-head">
        <div><h1><span className="ic"><Icon name="ix-box" /></span>{L('h')}</h1><p>{n} {L('items')} · {money(goods)}</p></div>
        <div className="sp-tools"><div className="sp-steps">
          <a href={href(lang, '/cart')} className="on" style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}><i>✓</i>{L('cart')}</a><b />
          <span className="on"><i>2</i>{L('step2')}</span><b /><span><i>3</i>{L('step3')}</span>
        </div></div>
      </div>
      <form className="sp-cart co" noValidate onSubmit={submit}>
        <div>
          <div className="sp-card co-s"><h3><i>1</i>{L('c1')}</h3>
            {u ? <p className="co-hint"><Icon name="user" />{L('hello')} <b>{u.fname || u.login}</b></p>
              : <p className="co-hint"><Icon name="user" />{L('have')} <a href={pageUrl(lang, 'login')}>{L('in')}</a></p>}
            <div className="co-seg">
              {(['person', 'company'] as const).map((k) => (
                <label key={k} className={co.who === k ? 'on' : undefined}><input type="radio" name="who" value={k} checked={co.who === k} onChange={() => upd({ who: k })} />{L(k === 'person' ? 'per' : 'com')}</label>
              ))}
            </div>
            <div className="co-g">
              <label className="w">{L('name')} *<input {...field('name')} autoComplete="name" required /></label>
              <label>{L('phone')} *<input {...field('phone')} type="tel" inputMode="tel" autoComplete="tel" required /></label>
              <label>{L('email')}<input {...field('email')} type="email" autoComplete="email" /></label>
              {co.who === 'company' ? <>
                <label>{L('cname')} *<input {...field('company')} autoComplete="organization" required /></label>
                <label>{L('tax')} *<input {...field('tax')} inputMode="numeric" maxLength={8} required /></label>
              </> : null}
            </div>
          </div>

          <div className="sp-card co-s"><h3><i>2</i>{L('c2')}</h3>
            <div className="sp-opts">
              {opt('ship', 'pick', co.ship === 'pick', 'sp-store', L('pick'), `${L('pickS')} · ${L('free')}`, () => upd({ ship: 'pick' }))}
              {opt('ship', 'cour', co.ship === 'cour', 'sp-truck', L('cour'), `${L('courS')} · ${L('fee')}`, () => upd({ ship: 'cour' }))}
              {opt('ship', 'reg', co.ship === 'reg', 'sp-map', L('reg'), `${L('regS')} · ${L('fee')}`, () => upd({ ship: 'reg' }))}
            </div>
            {co.ship === 'pick' ? (
              <div className="co-store"><Icon name="pin" /><div><b>{L('store')}</b><small>{L('storeA')}</small><small>{L('storeR')}</small></div>
                <a href={pageUrl(lang, 'contacts')} target="_blank" rel="noopener" aria-label={L('store')}><Icon name="arrow" /></a></div>
            ) : (
              <>
                {adrs.length ? <div className="co-chips"><small>{L('saved')}:</small>
                  {adrs.map((a, i) => <button type="button" key={i} onClick={() => upd({ address: a.a, ...(co.ship === 'reg' ? { city: a.city } : {}) })}>{a.l}</button>)}</div> : null}
                <div className="co-g">
                  {co.ship === 'reg' ? <>
                    <label>{L('marz')} *<select {...field('region')}>{REGIONS.slice(1).map((r) => <option key={r[0]} value={r[0]}>{r[1 + LI[lang]]}</option>)}</select></label>
                    <label>{L('city')} *<input {...field('city')} required /></label>
                  </> : null}
                  <label className="w">{L('adr')} *<input {...field('address')} autoComplete="street-address" required /></label>
                  {co.ship === 'cour' ? <>
                    <label>{L('date')}<select {...field('day')} value={co.day || dayVal(days[0])}>
                      {days.map((d, i) => <option key={i} value={dayVal(d)}>{i === 0 ? L('tomorrow') : dateL(lang, d).replace(/ \d{4}$/, '')}</option>)}</select></label>
                    <label>{L('time')}<select {...field('slot')}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
                  </> : null}
                </div>
              </>
            )}
          </div>

          <div className="sp-card co-s"><h3><i>3</i>{L('c3')}</h3>
            <div className="co-pay">
              {PAYS.filter((k) => k !== 'bank' || co.who === 'company').map((k) =>
                opt('pay', k, co.pay === k, { cash: 'ix-wallet', card: 'card', inst: 'doc', bank: 'store' }[k], L(k), L(`${k}S` as keyof typeof T), () => upd({ pay: k })))}
            </div>
          </div>

          <div className="sp-card co-s"><h3><i>4</i>{L('c4')}</h3>
            <textarea name="comment" placeholder={L('cmt')} value={co.comment} maxLength={1000} onChange={(e) => upd({ comment: e.target.value })} />
            <label className="co-chk"><input type="checkbox" checked={co.call} onChange={(e) => upd({ call: e.target.checked })} />{L('call')}</label>
          </div>
        </div>

        <aside className="sp-card sp-side">
          <h3 style={{ display: 'flex', justifyContent: 'space-between' }}>{L('inOrder')} <a href={href(lang, '/cart')} style={{ fontSize: 13.5, color: 'var(--blue-600)' }}>{L('edit')}</a></h3>
          <div className="co-its">
            {cart.map((x) => <div key={x.id}><span className="im"><img src={x.img || '/img/placeholder/default.svg'} alt="" /><i>{x.q || 1}</i></span><span className="nm">{x.t}</span><b>{money(x.p * (x.q || 1))}</b></div>)}
          </div>
          <div className="sp-ln"><span>{L('goods')} ({n})</span><b>{money(goods)}</b></div>
          <div className="sp-ln"><span>{L('ship')}</span><b>{co.ship === 'pick' ? L('free') : L('fee')}</b></div>
          <div className="sp-tot"><span>{L('total')}</span><b>{money(goods)}</b></div>
          <label className={`co-chk${err === L('agreeReq') && !co.agree ? ' bad' : ''}`}>
            <input type="checkbox" checked={co.agree} onChange={(e) => { upd({ agree: e.target.checked }); if (e.target.checked && err === L('agreeReq')) setErr(''); }} />
            <span>{L('agree')} <a href={pageUrl(lang, 'exchange')} target="_blank" rel="noopener">{L('terms')}</a></span>
          </label>
          <button className="sp-b p big" type="submit" disabled={busy}>{busy ? L('sending') : L('place')}</button>
          <small className="co-err" role="alert">{err}</small>
          <div className="sp-safe"><Icon name="sp-shield" />LED Computers · 010 502-802</div>
        </aside>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- 1-click

/** Opens the 1-click modal (mounted once in the layout). `clear`: empty the cart after a successful request (cart's button). */
export function openOneClick(items: StoreItem[], clear = false) {
  dispatchEvent(new CustomEvent('led:oneclick', { detail: { items, clear } }));
}

export function OneClick({ lang }: { lang: Lang }) {
  const L = tr(lang);
  const [st, setSt] = useState<{ items: StoreItem[]; clear: boolean } | null>(null);
  const [f, setF] = useState({ name: '', phone: '', comment: '' });
  const [bad, setBad] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  useEffect(() => {
    const o = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const me = user();
      setSt({ items: d.items.map((x: StoreItem) => ({ ...x, q: x.q || 1 })), clear: !!d.clear });
      setF((v) => ({ ...v, name: v.name || me?.fname || '', phone: v.phone || me?.phone || '' }));
      setDone(''); setErr(''); setBad(false);
    };
    addEventListener('led:oneclick', o);
    return () => removeEventListener('led:oneclick', o);
  }, []);
  useEffect(() => {
    if (!st) return;
    document.body.classList.add('oc-lock');
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSt(null); };
    addEventListener('keydown', k);
    return () => { document.body.classList.remove('oc-lock'); removeEventListener('keydown', k); };
  }, [st]);
  if (!st) return null;
  const tot = st.items.reduce((s, x) => s + x.p * (x.q || 1), 0);
  const q = (i: number, d: number) => setSt((s) => s && { ...s, items: s.items.map((x, j) => (j === i ? { ...x, q: Math.max(1, Math.min(99, (x.q || 1) + d)) } : x)) });
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!phoneOk(f.phone)) { setBad(true); setErr(L('badPhone')); return; }
    setBusy(true); setErr('');
    try {
      const r = await sendOrder({ kind: 'oneclick', lang, items: st.items.map((x) => ({ code: codeOf(x.id), q: x.q || 1 })), name: f.name, phone: f.phone, comment: f.comment });
      remember(r.number, f.phone);
      if (st.clear) set('cart', []);
      setDone(r.number);
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.code === 'gone' ? L('gone') : errText(lang, e2));
    } finally { setBusy(false); }
  };
  const box = (
    <div className="oc open" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setSt(null); }}>
      <div className="oc-box">
        <button className="oc-x" type="button" aria-label={L('close')} onClick={() => setSt(null)}>✕</button>
        {done ? (
          <div className="oc-ok">
            <div className="art"><Icon name="check" /></div>
            <h3>{L('ocOk')}</h3><p>{L('ocOkP')} <b>{f.phone}</b> {L('ocOkT')}</p>
            <div className="n">№ {done}</div>
            <div className="bt">
              <a href={`${href(lang, '/track-order')}?n=${done}`}>{L('tgo')}</a>
              <button type="button" className="p" onClick={() => setSt(null)}>{L('close')}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="oc-hd"><h3><span className="ic"><Icon name="call" /></span>{L('ocH')}</h3><p>{L('ocP')}</p></div>
            <div className="oc-its">
              {st.items.map((x, i) => (
                <div className="oc-it" key={x.id}><img src={x.img || '/img/placeholder/default.svg'} alt="" />
                  <div><span className="nm">{x.t}</span><small>{money(x.p)}</small><br />
                    <span className="oc-q"><button type="button" onClick={() => q(i, -1)}>−</button><span>{x.q || 1}</span><button type="button" onClick={() => q(i, 1)}>+</button></span></div>
                  <b>{money(x.p * (x.q || 1))}</b></div>
              ))}
            </div>
            <div className="oc-tot"><span>{L('total')}</span><b>{money(tot)}</b></div>
            <form className="oc-f" noValidate onSubmit={go}>
              <label>{L('ocName')}<input value={f.name} autoComplete="name" maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label>{L('phone')} *<input type="tel" inputMode="tel" autoComplete="tel" className={bad ? 'bad' : undefined} value={f.phone}
                onChange={(e) => { setF({ ...f, phone: e.target.value }); setBad(false); }} required /></label>
              <label>{L('ocCmt')}<textarea value={f.comment} maxLength={1000} onChange={(e) => setF({ ...f, comment: e.target.value })} /></label>
              <button className="oc-go" type="submit" disabled={busy}><Icon name="call" />{busy ? L('sending') : L('ocGo')}</button>
              {err ? <span className="oc-err" role="alert">{err}</span> : null}
              <small>{L('ocAgree')} <a href={pageUrl(lang, 'exchange')} target="_blank" rel="noopener">{L('terms')}</a></small>
            </form>
          </>
        )}
      </div>
    </div>
  );
  return createPortal(box, document.body);
}

// ---------------------------------------------------------------- tracking

type Tracked = { number: string; status: string; orderedAt: string; updatedAt: string; kind: string; delivery: string | null; pay: string | null;
  day: string | null; slot: string | null; total: number; items: { code: number; name: string; price: number; qty: number }[]; history: { status: string; at: string }[] };

export function TrackOrder({ lang }: { lang: Lang }) {
  const L = tr(lang);
  const [n, setN] = useState('');
  const [ph, setPh] = useState('');
  const [mine, setMine] = useState<{ n: string; phone: string }[]>([]);
  const [o, setO] = useState<Tracked | null>(null);
  const [state, setState] = useState<'' | 'load' | 'nf' | 'err'>('');
  const [bad, setBad] = useState<Set<string>>(new Set());
  const find = async (num: string, phone: string) => {
    const b = new Set<string>();
    if (!/\d{4,}/.test(num)) b.add('n');
    if (!phoneOk(phone)) b.add('ph');
    setBad(b);
    if (b.size) return;
    setState('load'); setO(null);
    try {
      const r = await api<Tracked>(`/orders/track?n=${encodeURIComponent(num)}&phone=${encodeURIComponent(phone)}`);
      setO(r); setState('');
      history.replaceState(null, '', `?n=${r.number}`);
    } catch (e) { setState(e instanceof ApiError && (e.status === 404 || e.status === 400) ? 'nf' : 'err'); }
  };
  useEffect(() => {
    let l: { n: string; phone: string }[] = [];
    try { l = JSON.parse(localStorage.getItem('led-my-orders') || '[]'); } catch { /* */ }
    setMine(l);
    const qn = new URLSearchParams(location.search).get('n') || '';
    const me = user();
    const known = l.find((x) => x.n === qn.toUpperCase());
    const phone = known?.phone || me?.phone || '';
    setN(qn); setPh(phone);
    if (qn && phone) find(qn, phone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sIdx = o ? (o.status === 'cancelled' ? -1 : STEPS.indexOf(o.status)) : 0;
  const sCls = o ? (o.status === 'cancelled' ? 4 : o.status === 'done' ? 2 : o.status === 'new' ? 0 : 1) : 0;
  const dl = o ? (o.kind === 'oneclick' ? L('oc') : o.delivery === 'cour' ? L('cour') : o.delivery === 'reg' ? L('reg') : L('pick')) : '';
  const payL = o?.pay && (PAYS as readonly string[]).includes(o.pay) ? L(o.pay as 'cash') : '';
  return (
    <div className="tr-app">
      <div className="ip-card tr-qc">
        <form className="tr-q" noValidate onSubmit={(e) => { e.preventDefault(); find(n, ph); }}>
          <label>{L('tn')}<input value={n} placeholder="LED-105001" className={bad.has('n') ? 'bad' : undefined} onChange={(e) => setN(e.target.value)} /></label>
          <label>{L('phone')}<input type="tel" inputMode="tel" value={ph} className={bad.has('ph') ? 'bad' : undefined} onChange={(e) => setPh(e.target.value)} /></label>
          <button className="btn p" type="submit" disabled={state === 'load'}>{L('tgo')}</button>
        </form>
        <p className="tr-hint">{L('thint')}</p>
        {mine.length ? <div className="tr-mine"><small style={{ color: 'var(--muted)', alignSelf: 'center' }}>{L('tmine')}</small>
          {mine.map((x) => <button key={x.n} type="button" onClick={() => { setN(x.n); setPh(x.phone); find(x.n, x.phone); }}>{x.n}</button>)}</div> : null}
        {state === 'nf' || state === 'err' ? <div className="tr-nf"><Icon name="ix-box" /><span>{state === 'nf' ? L('tnf') : L('err')}</span></div> : null}
      </div>
      {o ? (
        <div className="tr-res">
          <div className="ip-card">
            <div className="tr-top">
              <div><h2>{L('order')} № {o.number}</h2><small>{dateL(lang, o.orderedAt, true)}</small></div>
              <span className={`tr-st s${sCls}`}>{S[o.status]?.[LI[lang]] || o.status}</span>
            </div>
            {o.status !== 'cancelled' ? <>
              <div className="tr-bar"><i style={{ width: `${(Math.max(0, sIdx) / (STEPS.length - 1)) * 100}%` }} /></div>
              <div className="tr-steps" style={{ gridTemplateColumns: `repeat(${STEPS.length},minmax(0,1fr))` }}>
                {STEPS.map((s, i) => {
                  const at = o.history.find((h) => h.status === s)?.at;
                  return <div key={s} className={i < sIdx ? 'dn' : i === sIdx ? 'dn cur' : undefined}>
                    <span className="dot">{i <= sIdx ? <Icon name="check" /> : null}</span><b>{S[s][LI[lang]]}</b>{at ? <small>{dateL(lang, at)}</small> : null}</div>;
                })}
              </div>
            </> : null}
            <div className="tr-cols">
              <div>
                <h3>{L('hist')}</h3>
                <ul className="tr-log">{[...o.history].reverse().map((h, i) => <li key={i}>{S[h.status]?.[LI[lang]] || h.status}<small>{dateL(lang, h.at, true)}</small></li>)}</ul>
              </div>
              <div>
                <h3>{L('det')}</h3>
                <div className="tr-info">
                  <span>{L('dl')}</span><b>{dl}</b>
                  {o.day ? <><span>{L('when')}</span><b>{dateL(lang, o.day)}{o.slot ? `, ${o.slot}` : ''}</b></> : null}
                  {payL ? <><span>{L('pay')}</span><b>{payL}</b></> : null}
                </div>
                <div className="tr-cour"><span className="av"><Icon name="call" /></span><div><b>LED Computers</b><small>010 502-802</small></div>
                  <a href={`tel:${PHONE}`} aria-label={L('callMgr')}><Icon name="call" /></a></div>
              </div>
            </div>
          </div>
          <div className="ip-card">
            {o.items.map((x, i) => <div className="tr-it" key={i}><span className="ac-noimg" style={{ width: 52, height: 52 }}><Icon name="ix-box" /></span>
              <div>{x.name}<br /><small>{x.code} · {x.qty} × {money(x.price)}</small></div><b>{money(x.price * x.qty)}</b></div>)}
            <div className="tr-tot"><span>{L('total')}</span><b>{money(o.total)}</b></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
