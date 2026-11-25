/**
 * Admin "Заказы" (/admin/orders, plan step 10; backend orders.ts): orders placed on the storefront (checkout and 1-click).
 * List with status tabs and search (number, name, phone, e-mail, company); card with contact, delivery, payment, items
 * (link to the product card, current stock), history; status change with a note for the history, internal staff note.
 * Old led.am orders stay on the customer cards (Покупатели).
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { useI18n } from './i18n';

type St = 'new' | 'confirmed' | 'shipped' | 'done' | 'cancelled';
interface Row { id: number; number: string; status: St; kind: string; orderedAt: string; name: string | null; phone: string; company: string | null;
  total: number; delivery: string | null; pay: string | null; customerId: number | null; qty: number }
interface Order extends Row {
  lang: string; updatedAt: string | null; customerName: string | null; email: string | null; customerType: string | null; tax: string | null;
  region: string | null; city: string | null; address: string | null; day: string | null; slot: string | null; comment: string | null; callMe: boolean;
  staffNote: string | null;
  items: { code: number; name: string; price: number; qty: number; total: number; productId: number | null; stock: number | null }[];
  history: { status: St; at: string; note: string | null; by: string | null }[];
}

const TX = {
  title: ['Заказы', 'Orders'],
  note: ['Заказы с сайта: оформление и «купить в 1 клик». Цены — на момент заказа. Старые заказы led.am — в карточках покупателей.',
    'Orders from the website: checkout and "buy in 1 click". Prices as at the time of the order. Old led.am orders are on the customer cards.'],
  all: ['Все', 'All'], search: ['Номер, имя, телефон, e-mail, компания', 'Number, name, phone, e-mail, company'],
  num: ['Номер', 'Number'], date: ['Дата', 'Date'], client: ['Покупатель', 'Customer'], items: ['Шт.', 'Qty'], sum: ['Сумма', 'Total'],
  dl: ['Получение', 'Delivery'], pay: ['Оплата', 'Payment'], status: ['Статус', 'Status'], none: ['Заказов нет', 'No orders'],
  back: ['← Все заказы', '← All orders'], contact: ['Контакт', 'Contact'], company: ['Компания', 'Company'], tax: ['ИНН', 'Tax code'],
  account: ['Аккаунт', 'Account'], guest: ['гость (без входа)', 'guest (not logged in)'], address: ['Адрес', 'Address'], when: ['День и время', 'Day and time'],
  comment: ['Комментарий покупателя', 'Customer comment'], callMe: ['Просит перезвонить', 'Asks for a call back'], lang: ['Язык сайта', 'Site language'],
  product: ['Товар', 'Product'], code: ['Код', 'Code'], price: ['Цена', 'Price'], stock: ['Остаток', 'Stock'],
  history: ['История', 'History'], change: ['Изменить статус', 'Change status'], noteH: ['Комментарий к смене (виден только в админке)', 'Note for the change (admin only)'],
  staff: ['Заметка менеджера (только для админки)', 'Staff note (admin only)'], save: ['Сохранить', 'Save'], saved: ['Сохранено', 'Saved'],
  kind_checkout: ['Оформление', 'Checkout'], kind_oneclick: ['1 клик', '1 click'],
  s_new: ['Новый', 'New'], s_confirmed: ['Подтверждён', 'Confirmed'], s_shipped: ['Отправлен / готов к выдаче', 'Shipped / ready'], s_done: ['Выполнен', 'Done'], s_cancelled: ['Отменён', 'Cancelled'],
  d_pick: ['Самовывоз', 'Pick-up'], d_cour: ['Курьер по Еревану', 'Courier, Yerevan'], d_reg: ['Доставка по Армении', 'Delivery in Armenia'],
  p_cash: ['Наличные', 'Cash'], p_card: ['Карта при получении', 'Card on receipt'], p_inst: ['Рассрочка', 'Instalments'], p_bank: ['Безнал (счёт)', 'Bank transfer'],
  shipNote: ['Стоимость доставки не рассчитана — сообщите покупателю по телефону.', 'Delivery cost is not calculated — tell the customer by phone.'],
} as const;
const STS: St[] = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];
const tone = (s: St) => (s === 'done' ? 'ok' : s === 'cancelled' ? 'bad' : s === 'new' ? 'warn' : '');
const money = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('ru-RU')} ֏`);

function useTx() {
  const { lang } = useI18n() as { lang: 'ru' | 'en' };
  return (k: string) => (TX as Record<string, readonly [string, string]>)[k]?.[lang === 'ru' ? 0 : 1] ?? k;
}

export function OrdersPage() {
  const tx = useTx();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') || '', q = sp.get('q') || '', page = Number(sp.get('page')) || 1;
  const [data, setData] = useState<{ items: Row[]; total: number; per: number; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState('');
  const [qq, setQq] = useState(q);
  useEffect(() => {
    const load = () => api<typeof data>(`/admin/orders?status=${status}&q=${encodeURIComponent(q)}&page=${page}`).then(setData).catch((e) => setErr(e.message));
    load();
    const id = setInterval(load, 60_000); // new orders show up without reloading
    return () => clearInterval(id);
  }, [status, q, page]);
  const go = (p: Record<string, string>) => setSp(Object.fromEntries(Object.entries({ status, q, ...p }).filter(([, v]) => v)));
  const all = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <header className="page-head"><h1>{tx('title')}</h1></header>
      <p className="muted small">{tx('note')}</p>
      <div className="filters">
        <div className="seg">
          <button type="button" className={!status ? 'on' : ''} onClick={() => go({ status: '', page: '' })}>{tx('all')} {all ? `(${all})` : ''}</button>
          {STS.map((s) => <button type="button" key={s} className={status === s ? 'on' : ''} onClick={() => go({ status: s, page: '' })}>
            {tx(`s_${s}`)} {data?.counts[s] ? `(${data.counts[s]})` : ''}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go({ q: qq.trim(), page: '' }); }}>
          <input type="search" placeholder={tx('search')} value={qq} onChange={(e) => setQq(e.target.value)} style={{ minWidth: 280 }} />
        </form>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="table-wrap responsive">
        <table>
          <thead><tr><th>{tx('num')}</th><th>{tx('date')}</th><th>{tx('client')}</th><th className="num">{tx('items')}</th><th className="num">{tx('sum')}</th>
            <th>{tx('dl')}</th><th>{tx('pay')}</th><th>{tx('status')}</th></tr></thead>
          <tbody>
            {data?.items.map((o) => (
              <tr key={o.id}>
                <td data-label={tx('num')} className="title"><Link to={`/orders/${o.id}`}>{o.number}</Link><div className="muted small">{tx(`kind_${o.kind}`)}</div></td>
                <td data-label={tx('date')} className="muted">{new Date(o.orderedAt).toLocaleString()}</td>
                <td data-label={tx('client')}>{o.name || '—'}<div className="muted small">{[o.phone, o.company].filter(Boolean).join(' · ')}</div></td>
                <td data-label={tx('items')} className="num">{o.qty}</td>
                <td data-label={tx('sum')} className="num">{money(o.total)}</td>
                <td data-label={tx('dl')}>{o.delivery ? tx(`d_${o.delivery}`) : '—'}</td>
                <td data-label={tx('pay')}>{o.pay ? tx(`p_${o.pay}`) : '—'}</td>
                <td data-label={tx('status')}><span className={`tag ${tone(o.status)}`}>{tx(`s_${o.status}`)}</span></td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={8} className="empty">{tx('none')}</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > data.per && (
        <div className="pager">
          <button disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>‹</button>
          <span>{page} / {Math.ceil(data.total / data.per)}</span>
          <button disabled={page * data.per >= data.total} onClick={() => go({ page: String(page + 1) })}>›</button>
        </div>
      )}
    </>
  );
}

export function OrderPage() {
  const tx = useTx();
  const { id } = useParams();
  const [o, setO] = useState<Order | null>(null);
  const [err, setErr] = useState('');
  const [st, setSt] = useState<St>('new');
  const [note, setNote] = useState('');
  const [staff, setStaff] = useState('');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const take = (x: Order) => { setO(x); setSt(x.status); setStaff(x.staffNote || ''); setNote(''); };
  useEffect(() => { api<Order>(`/admin/orders/${id}`).then(take).catch((e) => setErr(e.message)); }, [id]);
  if (!o) return err ? <div className="error">{err}</div> : <p className="muted">…</p>;
  const save = async (body: Record<string, string>) => {
    setBusy(true); setErr(''); setMsg('');
    try { take(await api<Order>(`/admin/orders/${o.id}`, { method: 'PATCH', body: JSON.stringify(body) })); setMsg(tx('saved')); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const row = (k: string, v: React.ReactNode) => (v ? <><dt className="muted">{tx(k)}</dt><dd style={{ margin: 0 }}>{v}</dd></> : null);
  const dl = { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', margin: 0 } as const;
  return (
    <>
      <p><Link to="/orders">{tx('back')}</Link></p>
      <header className="page-head">
        <h1>{o.number} <span className={`tag ${tone(o.status)}`}>{tx(`s_${o.status}`)}</span></h1>
        <span className="muted small">{tx(`kind_${o.kind}`)} · {new Date(o.orderedAt).toLocaleString()} · {money(o.total)}</span>
      </header>
      {err && <div className="error">{err}</div>}
      <div className="grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{tx('contact')}</h3>
          <dl style={dl}>
            {row('client', o.name || '—')}
            {row('contact', <><a href={`tel:${o.phone}`}>{o.phone}</a>{o.email ? <> · <a href={`mailto:${o.email}`}>{o.email}</a></> : null}</>)}
            {row('company', o.company)}{row('tax', o.tax)}
            {row('account', o.customerId ? <Link to={`/customers/${o.customerId}`}>{o.customerName || `#${o.customerId}`}</Link> : <span className="muted">{tx('guest')}</span>)}
            {row('callMe', o.callMe ? '✓' : '')}
            {row('lang', o.lang?.toUpperCase())}
          </dl>
        </section>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{tx('dl')}</h3>
          <dl style={dl}>
            {row('dl', o.delivery ? tx(`d_${o.delivery}`) : '—')}
            {row('address', [o.region, o.city, o.address].filter(Boolean).join(', '))}
            {row('when', o.day ? `${new Date(o.day).toLocaleDateString()}${o.slot ? `, ${o.slot}` : ''}` : '')}
            {row('pay', o.pay ? tx(`p_${o.pay}`) : '')}
            {row('comment', o.comment ? <span style={{ whiteSpace: 'pre-wrap' }}>{o.comment}</span> : '')}
          </dl>
          {o.delivery && o.delivery !== 'pick' ? <p className="muted small">{tx('shipNote')}</p> : null}
        </section>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>{tx('code')}</th><th>{tx('product')}</th><th className="num">{tx('price')}</th><th className="num">{tx('items')}</th><th className="num">{tx('sum')}</th><th className="num">{tx('stock')}</th></tr></thead>
          <tbody>
            {o.items.map((i, k) => (
              <tr key={k}>
                <td className="mono">{i.code}</td>
                <td>{i.productId ? <Link to={`/products/${i.productId}`}>{i.name}</Link> : i.name}</td>
                <td className="num">{money(i.price)}</td><td className="num">{i.qty}</td><td className="num">{money(i.total)}</td>
                <td className="num">{i.stock == null ? '—' : <span className={i.stock < i.qty ? 'tag bad' : ''}>{i.stock}</span>}</td>
              </tr>
            ))}
            <tr><td colSpan={4} className="num"><b>{tx('sum')}</b></td><td className="num"><b>{money(o.total)}</b></td><td /></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginTop: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{tx('change')}</h3>
          <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            {STS.map((s) => <button type="button" key={s} className={st === s ? 'on' : ''} onClick={() => setSt(s)}>{tx(`s_${s}`)}</button>)}
          </div>
          <label className="muted small">{tx('noteH')}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: '100%' }} /></label>
          <button className="primary" disabled={busy || st === o.status} onClick={() => save({ status: st, note })}>{tx('save')}</button>
          <hr />
          <label className="muted small">{tx('staff')}<textarea value={staff} onChange={(e) => setStaff(e.target.value)} rows={3} style={{ width: '100%' }} /></label>
          <button disabled={busy || staff === (o.staffNote || '')} onClick={() => save({ staffNote: staff })}>{tx('save')}</button>
          {msg && <span className="muted small" style={{ marginLeft: 10 }}>{msg}</span>}
        </section>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{tx('history')}</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {[...o.history].reverse().map((h, i) => (
              <li key={i} style={{ marginBottom: 8 }}><span className={`tag ${tone(h.status)}`}>{tx(`s_${h.status}`)}</span>{' '}
                <span className="muted small">{new Date(h.at).toLocaleString()} · {h.by}</span>{h.note ? <div className="small">{h.note}</div> : null}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
