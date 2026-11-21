import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type Paged } from './api';
import type { TKey } from './i18n';
import { useData, useT } from './pages';

interface CustomerRow {
  id: number; legacyId: number | null; name: string; email: string | null; login: string | null; phone: string | null;
  city: string | null; type: string; company: string | null; confirmed: boolean; blocked: boolean; registeredAt: string | null;
  orderCount: number; totalSpent: number; lastOrderAt: string | null;
}
interface CustomerStats {
  total: number; blocked: number; unconfirmed: number; needReset: number; orders: number;
  imports: { id: number; at: string; file: string | null; stats: Record<string, unknown>; error: string | null }[];
}
interface OrderItem {
  id: number; article: string | null; name: string | null; price: number | null; qty: number; total: number | null;
  currency: string | null; productId: number | null; productName: string | null; productDeleted: boolean;
}
interface Order {
  id: number; legacyId: number | null; source: string; orderedAt: string | null; contactPerson: string | null;
  contactPhone: string | null; contactEmail: string | null; country: string | null; city: string | null; address: string | null;
  addressExtra: string | null; total: number | null; shipping: boolean; shippingCost: number | null; currency: string | null;
  paymentType: string | null; shopAddress: string | null; status: string | null; paid: boolean; paidAt: string | null;
  items: OrderItem[];
}
interface Customer {
  id: number; legacyId: number | null; name: string; email: string | null; login: string | null; phone: string | null;
  address: string | null; postalCode: string | null; city: string | null; country: string | null; type: string;
  company: string | null; lawName: string | null; lawAddress: string | null; factualAddress: string | null;
  taxcode: string | null; bankinfo: string | null; passwordScheme: string; confirmed: boolean; blocked: boolean;
  blockedReason: string | null; adminNote: string | null; registeredAt: string | null; lastVisitAt: string | null;
  lastLoginAt: string | null; editedAt: string | null;
  orders: Order[];
  favorites: { article: string | null; name: string | null; productId: number | null; productName: string | null }[];
  history: { id: string; at: string; action: string; changes: Record<string, [unknown, unknown]> }[];
}

const TYPES = ['consumer', 'dealer', 'corporate'] as const;
const typeKey = (t: string) => (`cu.t.${TYPES.includes(t as never) ? t : 'consumer'}`) as TKey;
const statusKey = (s: string | null) => (s && ['received', 'process', 'resolved'].includes(s) ? `cu.o.status.${s}` : null) as TKey | null;

// ------------------------------------------------------------------ list

const COLS: { key: string; label: TKey; sort?: string; num?: boolean }[] = [
  { key: 'name', label: 'cu.col.name', sort: 'name' },
  { key: 'contacts', label: 'cu.col.contacts' },
  { key: 'type', label: 'cu.col.type' },
  { key: 'registered', label: 'cu.col.registered', sort: 'registered' },
  { key: 'orders', label: 'cu.col.orders', sort: 'orders', num: true },
  { key: 'spent', label: 'cu.col.spent', sort: 'spent', num: true },
  { key: 'lastOrder', label: 'cu.col.lastOrder', sort: 'lastOrder' },
];

/** Opens the storefront account as this customer (admin only; the API sets the site session cookie in this browser). */
async function loginAs(id: number, onError: (m: string) => void) {
  const w = window.open('about:blank', '_blank');   // open now, before await, so popup blockers allow it
  try {
    const r = await api<{ url: string }>(`/admin/customers/${id}/login-as`, { method: 'POST' });
    if (w) w.location.href = r.url; else window.location.assign(r.url);
  } catch (e) { w?.close(); onError((e as Error).message); }
}

export function CustomersPage() {
  const { t, fmt } = useT();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const q = new URLSearchParams(params);
  if (!q.get('limit')) q.set('limit', '50');
  const { data, error } = useData<Paged<CustomerRow>>(`/admin/customers?${q}`);
  const { data: st } = useData<CustomerStats>('/admin/customers/stats');

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  useEffect(() => {
    const tm = setTimeout(() => { if (search !== (params.get('search') || '')) set({ search }); }, 350);
    return () => clearTimeout(tm);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const sort = params.get('sort') || 'orders';
  const dir = params.get('dir') || 'desc';
  const page = Number(params.get('page') || 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const lastImport = st?.imports.find((i) => !i.error);

  return (
    <>
      <header className="page-head">
        <h1>{t('cu.title')} {data && <small>{fmt.num(data.total, 0)}</small>}</h1>
      </header>
      <p className="muted small">{t('cu.note')}</p>
      {st && (
        <p className="muted small">
          {t('cu.stats', { total: fmt.num(st.total, 0), blocked: st.blocked, needReset: st.needReset, orders: fmt.num(st.orders, 0) })}
          {' · '}{lastImport ? t('cu.lastImport', { date: fmt.date(lastImport.at) }) : t('cu.noImport')}
        </p>
      )}
      <div className="filters">
        <input placeholder={t('cu.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={params.get('type') || ''} onChange={(e) => set({ type: e.target.value })}>
          <option value="">{t('cu.allTypes')}</option>
          {TYPES.map((ty) => <option key={ty} value={ty}>{t(typeKey(ty))}</option>)}
        </select>
        <select value={params.get('status') || ''} onChange={(e) => set({ status: e.target.value })}>
          <option value="">{t('cu.allStatus')}</option>
          <option value="active">{t('cu.st.active')}</option>
          <option value="blocked">{t('cu.st.blocked')}</option>
          <option value="unconfirmed">{t('cu.st.unconfirmed')}</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={params.get('orders') === '1'} onChange={(e) => set({ orders: e.target.checked ? '1' : '' })} />
          {t('cu.withOrders')}
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap responsive">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}`}
                  onClick={() => c.sort && set({ sort: c.sort, dir: sort === c.sort && dir === 'desc' ? 'asc' : 'desc' })}>
                  {t(c.label)}{sort === c.sort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id} className={c.blocked ? 'cu-blocked' : ''}>
                <td data-label={t('cu.col.name')} className="title">
                  <Link to={`/customers/${c.id}`}>{c.name || c.login || c.email || `#${c.id}`}</Link>
                  {c.company && <div className="muted small">{c.company}</div>}
                  {c.blocked && <span className="tag bad">{t('cu.blocked')}</span>}
                  {!c.confirmed && <span className="tag">{t('cu.unconfirmed')}</span>}
                  {!c.blocked && <div><button type="button" className="link-btn small" title={t('cu.loginAsHint')}
                    onClick={() => loginAs(c.id, (m) => alert(m))}>{t('cu.loginAs')} ↗</button></div>}
                </td>
                <td data-label={t('cu.col.contacts')}>
                  <div>{c.email || '—'}</div><div className="muted small">{[c.phone, c.city].filter(Boolean).join(' · ')}</div>
                </td>
                <td data-label={t('cu.col.type')}>{t(typeKey(c.type))}</td>
                <td data-label={t('cu.col.registered')} className="muted">{c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : '—'}</td>
                <td data-label={t('cu.col.orders')} className="num">{c.orderCount || '—'}</td>
                <td data-label={t('cu.col.spent')} className="num">{c.totalSpent ? fmt.num(c.totalSpent, 0) : '—'}</td>
                <td data-label={t('cu.col.lastOrder')} className="muted">{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={COLS.length} className="empty">{t('common.nothing')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>{t('common.prev')}</button>
        <span>{t('common.page', { page, pages })}</span>
        <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>{t('common.next')}</button>
        <select value={params.get('limit') || '50'} onChange={(e) => set({ limit: e.target.value })}>
          {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{t('common.perPage', { n })}</option>)}
        </select>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ detail

const FIELDS: { k: string; api: keyof Customer; label: TKey; multi?: boolean }[] = [
  { k: 'name', api: 'name', label: 'cu.f.name' },
  { k: 'email', api: 'email', label: 'cu.f.email' },
  { k: 'login', api: 'login', label: 'cu.f.login' },
  { k: 'phone', api: 'phone', label: 'cu.f.phone' },
  { k: 'country', api: 'country', label: 'cu.f.country' },
  { k: 'city', api: 'city', label: 'cu.f.city' },
  { k: 'address', api: 'address', label: 'cu.f.address' },
  { k: 'postal_code', api: 'postalCode', label: 'cu.f.postal' },
];
const COMPANY: typeof FIELDS = [
  { k: 'company', api: 'company', label: 'cu.f.dealerCompany' },
  { k: 'law_name', api: 'lawName', label: 'cu.f.lawName' },
  { k: 'law_address', api: 'lawAddress', label: 'cu.f.lawAddress' },
  { k: 'factual_address', api: 'factualAddress', label: 'cu.f.factAddress' },
  { k: 'taxcode', api: 'taxcode', label: 'cu.f.taxcode' },
  { k: 'bankinfo', api: 'bankinfo', label: 'cu.f.bank', multi: true },
];

function OrderCard({ o }: { o: Order }) {
  const { t, fmt } = useT();
  const sk = statusKey(o.status);
  const money = (n: number | null) => (n === null ? '—' : `${fmt.num(n, 0)} ${o.currency === 'AMD' || !o.currency ? '֏' : o.currency}`);
  return (
    <details className="cu-order">
      <summary>
        <b>{t('cu.order', { n: o.legacyId ?? o.id })}</b>
        <span className="muted">{fmt.date(o.orderedAt)}</span>
        <span className={`tag ${o.status === 'resolved' ? 'ok' : ''}`}>{sk ? t(sk) : (o.status || '—')}</span>
        <span className={`tag ${o.paid ? 'ok' : ''}`}>{o.paid ? t('cu.o.paid', { date: o.paidAt ? new Date(o.paidAt).toLocaleDateString() : '' }) : t('cu.o.unpaid')}</span>
        <span className="cu-sum">{money(o.total)}</span>
      </summary>
      <p className="muted small">
        {[o.contactPerson, o.contactPhone, o.contactEmail].filter(Boolean).join(' · ')}<br />
        {o.shipping
          ? <>{t('cu.o.delivery', { cost: money(o.shippingCost) })} — {[o.country, o.city, o.address, o.addressExtra].filter(Boolean).join(', ')}</>
          : t('cu.o.pickup', { shop: o.shopAddress || '—' })}
        {o.paymentType && <> · {t('cu.o.payment', { type: o.paymentType })}</>}
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('cu.o.article')}</th><th>{t('cu.o.product')}</th><th className="num">{t('cu.o.price')}</th><th className="num">{t('cu.o.qty')}</th><th className="num">{t('cu.o.sum')}</th></tr></thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.article || '—'}</td>
                <td>
                  {i.productId ? <Link to={`/products/${i.productId}`}>{i.name || i.productName}</Link> : (i.name || '—')}
                  {i.productId && i.productName && i.name && i.productName !== i.name && <div className="muted small">{i.productName}</div>}
                  {!i.productId && <span className="tag">{t('cu.o.notInStore')}</span>}
                  {i.productDeleted && <span className="tag">{t('cu.o.removed')}</span>}
                </td>
                <td className="num">{money(i.price)}</td>
                <td className="num">{i.qty}</td>
                <td className="num">{money(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function CustomerPage() {
  const { t, fmt } = useT();
  const { id } = useParams();
  const [c, setC] = useState<Customer | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');

  const fill = (d: Customer) => {
    setC(d);
    const f: Record<string, string | boolean> = { type: d.type, confirmed: d.confirmed, admin_note: d.adminNote || '', blocked_reason: d.blockedReason || '' };
    for (const x of [...FIELDS, ...COMPANY]) f[x.k] = (d[x.api] as string | null) ?? '';
    setForm(f);
  };
  useEffect(() => { api<Customer>(`/admin/customers/${id}`).then(fill).catch((e) => setError(e.message)); }, [id]);

  async function save(patch: Record<string, unknown>, done: string) {
    setBusy(true); setError(''); setMsg('');
    try {
      fill(await api<Customer>(`/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }));
      setMsg(done);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function setPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setMsg('');
    try {
      await api(`/admin/customers/${id}/password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
      setPw('');
      fill(await api<Customer>(`/admin/customers/${id}`));
      setMsg(t('cu.pw.done'));
    } catch (e2) { setError((e2 as Error).message); } finally { setBusy(false); }
  }

  if (!c) return error ? <div className="error">{error}</div> : <p className="muted">{t('common.loading')}</p>;
  const input = (x: (typeof FIELDS)[number]) => (
    <label key={x.k}>{t(x.label)}
      {x.multi
        ? <textarea rows={3} value={String(form[x.k] ?? '')} onChange={(e) => setForm({ ...form, [x.k]: e.target.value })} />
        : <input value={String(form[x.k] ?? '')} onChange={(e) => setForm({ ...form, [x.k]: e.target.value })} />}
    </label>
  );
  const spent = c.orders.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <>
      <p><Link to="/customers">{t('cu.back')}</Link></p>
      <header className="page-head">
        <h1>{c.name || c.login || `#${c.id}`} {c.blocked && <span className="tag bad">{t('cu.blocked')}</span>}</h1>
        {!c.blocked && <button type="button" title={t('cu.loginAsHint')} onClick={() => loginAs(c.id, setError)}>{t('cu.loginAs')} ↗</button>}
        <span className="muted small">{t('cu.col.orders')}: {c.orders.length} · {t('cu.col.spent')}: {fmt.num(spent, 0)} ֏</span>
      </header>
      <p className="muted small">
        {t('cu.dates', { reg: fmt.date(c.registeredAt), visit: fmt.date(c.lastVisitAt), login: fmt.date(c.lastLoginAt) })}
        {c.legacyId !== null && <> · {t('cu.oldId', { id: c.legacyId })}</>}
      </p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      <div className="grid2">
        <form className="card cu-form" onSubmit={(e) => { e.preventDefault(); save(form, t('cu.saved')); }}>
          <h2>{t('cu.profile')}</h2>
          <div className="cu-grid">
            {FIELDS.map(input)}
            <label>{t('cu.f.type')}
              <select value={String(form.type)} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((ty) => <option key={ty} value={ty}>{t(typeKey(ty))}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={!!form.confirmed} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} /> {t('cu.f.confirmed')}</label>
          </div>
          {(form.type !== 'consumer' || COMPANY.some((x) => form[x.k])) && (
            <><h2>{t('cu.company')}</h2><div className="cu-grid">{COMPANY.map(input)}</div></>
          )}
          <label>{t('cu.f.note')}<textarea rows={3} value={String(form.admin_note ?? '')} onChange={(e) => setForm({ ...form, admin_note: e.target.value })} /></label>
          <button disabled={busy}>{busy ? t('cu.saving') : t('cu.save')}</button>
        </form>

        <div className="cu-side">
          <section className="card">
            <h2>{t('cu.access')}</h2>
            {c.blocked ? (
              <>
                <p className="error">{t('cu.blockedNote')}{c.blockedReason && <><br /><b>{c.blockedReason}</b></>}</p>
                <button type="button" disabled={busy} onClick={() => save({ blocked: false }, t('cu.saved'))}>{t('cu.unblock')}</button>
              </>
            ) : (
              <div className="cu-block">
                <input placeholder={t('cu.blockReason')} value={String(form.blocked_reason ?? '')} onChange={(e) => setForm({ ...form, blocked_reason: e.target.value })} />
                <button type="button" className="danger" disabled={busy} onClick={() => save({ blocked: true, blocked_reason: form.blocked_reason }, t('cu.saved'))}>{t('cu.block')}</button>
              </div>
            )}
            <h2>{t('cu.pw')}</h2>
            <p className="muted small">{t(`cu.pw.${c.passwordScheme}` as TKey)}</p>
            <form className="cu-block" onSubmit={setPassword}>
              <input type="password" autoComplete="new-password" minLength={6} placeholder={t('cu.pw.new')} value={pw} onChange={(e) => setPw(e.target.value)} />
              <button disabled={busy || pw.length < 6}>{t('cu.pw.set')}</button>
            </form>
          </section>
          {c.favorites.length > 0 && (
            <section className="card">
              <h2>{t('cu.favorites', { n: c.favorites.length })}</h2>
              <ul className="cu-favs">
                {c.favorites.map((f, i) => (
                  <li key={i}>{f.productId ? <Link to={`/products/${f.productId}`}>{f.name || f.productName}</Link> : (f.name || f.article || '—')}
                    {f.article && <span className="muted small"> · {f.article}</span>}</li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <h2>{t('cu.history')}</h2>
            {!c.history.length ? <p className="muted small">{t('cu.noHistory')}</p> : (
              <ul className="cu-hist">
                {c.history.map((h) => (
                  <li key={h.id}><span className="muted small">{fmt.date(h.at)} · {String(h.changes.by?.[1] ?? '')}</span>
                    {h.action === 'login_as' && <div className="small"><b>{t('cu.h.login_as')}</b></div>}
                    {Object.entries(h.changes).filter(([k]) => k !== 'by').map(([k, [a, b]]) => (
                      <div key={k} className="small"><b>{k}</b>: {String(a ?? '—')} → {String(b ?? '—')}</div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <h2 className="cu-h">{t('cu.orders')} <small className="muted">{c.orders.length}</small></h2>
      {!c.orders.length && <p className="muted">{t('cu.noOrders')}</p>}
      <div className="cu-orders">{c.orders.map((o) => <OrderCard key={o.id} o={o} />)}</div>
    </>
  );
}
