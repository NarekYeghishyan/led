import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  api, auth, makeFmt, type Category, type ChangeRow, type MirrorPage, type MirrorTable, type Paged, type ProductRow, type Stats, type SyncLogRow,
} from './api';
import { useI18n, type TKey } from './i18n';
import { ProductPhotos } from './photos';

/** Loads data and reloads it every `refreshMs` (live view of the store). */
export function useData<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => api<T>(path).then((d) => alive && (setData(d), setError(''))).catch((e) => alive && setError(e.message));
    load();
    const t = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [path, refreshMs]);
  return { data, error };
}

/** Translations + locale-aware formatters. */
export function useT() {
  const { t, locale } = useI18n();
  return { t, fmt: makeFmt(locale, t) };
}

function FromAccess() {
  const { t } = useT();
  return <span className="badge">{t('common.fromAccess')}</span>;
}

function SyncBadge({ s }: { s: Stats }) {
  const { t, fmt } = useT();
  // Age is measured on the server clock, so a wrong clock on this computer does not matter.
  const skew = Date.now() - new Date(s.serverNow).getTime();
  const local = (d: string | null) => (d ? new Date(new Date(d).getTime() + skew).toISOString() : null);
  const seen = local(s.agentSeenAt);
  const sec = s.agentSeenAt ? (new Date(s.serverNow).getTime() - new Date(s.agentSeenAt).getTime()) / 1000 : Infinity;
  const agent = !s.agentSeenAt
    ? <span className="dot bad">{t('agent.never')}</span>
    : sec > 180
      ? <span className="dot bad">{t('agent.offline', { ago: fmt.ago(seen) })}</span>
      : s.agentError
        ? <span className="dot warn" title={s.agentError}>{t('agent.error')}</span>
        : <span className="dot ok" title={s.agentVersion ? `v${s.agentVersion}` : undefined}>{t('agent.online')}</span>;
  return <span className="sync-badge">{agent}<span className="muted small">{t('sync.last', { ago: fmt.ago(local(s.lastSyncAt)) })}</span></span>;
}

// ------------------------------------------------------------------ Dashboard

const TILE_ICONS = {
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
};

function Tile({ to, icon, tone, value, label }: { to: string; icon: keyof typeof TILE_ICONS; tone?: 'ok' | 'warn' | 'bad'; value: string; label: string }) {
  return (
    <Link to={to} className={`tile${tone ? ` tile-${tone}` : ''}`}>
      <span className="tile-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{TILE_ICONS[icon]}</svg>
      </span>
      <span className="tile-body"><b>{value}</b><span>{label}</span></span>
    </Link>
  );
}

export function DashboardPage() {
  const { t, fmt } = useT();
  const { data: s, error } = useData<Stats>('/admin/stats', 10000);
  return (
    <>
      <header className="page-head"><h1>{t('dash.title')}</h1>{s && <SyncBadge s={s} />}</header>
      {error && <div className="error">{error}</div>}
      {s && (
        <div className="tiles">
          <Tile to="/products?stock=in" icon="box" value={fmt.num(s.products, 0)} label={t('dash.products')} />
          <Tile to="/products?stock=in" icon="check" tone="ok" value={fmt.num(s.inStock, 0)} label={t('dash.inStock')} />
          <Tile to="/products?stock=out" icon="alert" tone="warn" value={fmt.num(s.outOfStock, 0)} label={t('dash.outOfStock')} />
          <Tile to="/categories" icon="grid" value={fmt.num(s.categories, 0)} label={t('dash.categories')} />
          <Tile to="/products?deleted=1" icon="trash" tone="bad" value={fmt.num(s.deleted, 0)} label={t('dash.deleted')} />
        </div>
      )}
      <p className="muted">{t('dash.note')}</p>
    </>
  );
}

// ------------------------------------------------------------------ Products

// Currency names from Access → symbols.
const curSym = (n?: string | null): string => {
  const s = (n || '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('дол') || s.startsWith('usd') || s === '$') return '$';
  if (s.startsWith('евр') || s.startsWith('eur')) return '€';
  if (s.startsWith('руб') || s.startsWith('rub')) return '₽';
  if (s.startsWith('драм') || s.startsWith('amd') || s.startsWith('дрм')) return '֏';
  return n || '';
};

const COLS: { key: string; label: TKey; sort?: string; num?: boolean }[] = [
  { key: 'externalId', label: 'col.code', sort: 'externalId', num: true },
  { key: 'name', label: 'col.name', sort: 'name' },
  { key: 'barcode', label: 'col.barcode' },
  { key: 'categoryName', label: 'col.category' },
  { key: 'brand', label: 'col.brand' },
  { key: 'price', label: 'col.price', sort: 'price', num: true },
  { key: 'priceList', label: 'f.priceListPrice', sort: 'priceList', num: true },
  { key: 'dealerPrice1', label: 'f.dealerPrice1', sort: 'dealerPrice1', num: true },
  { key: 'quantity', label: 'col.stock', sort: 'quantity', num: true },
  { key: 'syncedAt', label: 'col.updated', sort: 'syncedAt' },
];

export function ProductsPage() {
  const { t, fmt } = useT();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const { data: cats } = useData<Category[]>('/admin/categories');
  const q = new URLSearchParams(params);
  if (!q.get('limit')) q.set('limit', '50');
  const { data, error } = useData<Paged<ProductRow>>(`/admin/products?${q}`, 15000);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  // debounce search
  useEffect(() => {
    const tm = setTimeout(() => { if (search !== (params.get('search') || '')) set({ search }); }, 350);
    return () => clearTimeout(tm);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const sort = params.get('sort') || 'name';
  const dir = params.get('dir') || 'asc';
  const page = Number(params.get('page') || 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <header className="page-head">
        <h1>{t('products.title')} {data && <small>{fmt.num(data.total, 0)}</small>}</h1>
      </header>
      <div className="filters">
        <input placeholder={t('products.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={params.get('categoryId') || ''} onChange={(e) => set({ categoryId: e.target.value })}>
          <option value="">{t('products.allCategories')}</option>
          {cats?.map((c) => <option key={c.id} value={c.externalId}>{c.name || `#${c.externalId}`} ({c.productCount})</option>)}
        </select>
        <select value={params.get('stock') || ''} onChange={(e) => set({ stock: e.target.value })}>
          <option value="">{t('products.anyStock')}</option>
          <option value="in">{t('products.inStock')}</option>
          <option value="out">{t('products.outOfStock')}</option>
        </select>
        <select value={params.get('discontinued') || ''} onChange={(e) => set({ discontinued: e.target.value })}>
          <option value="">{t('products.allActive')}</option>
          <option value="0">{t('products.activeOnly')}</option>
          <option value="1">{t('products.discOnly')}</option>
        </select>
        <select className="mobile-only" aria-label={t('products.sortBy')} value={`${sort}:${dir}`}
          onChange={(e) => { const [s2, d2] = e.target.value.split(':'); set({ sort: s2, dir: d2 }); }}>
          {COLS.filter((c) => c.sort).flatMap((c) => (['asc', 'desc'] as const).map((d) => (
            <option key={`${c.sort}:${d}`} value={`${c.sort}:${d}`}>{t('products.sortBy')}: {t(c.label)} — {t(`products.${d}`)}</option>
          )))}
        </select>
        <label className="check">
          <input type="checkbox" checked={params.get('deleted') === '1'} onChange={(e) => set({ deleted: e.target.checked ? '1' : '' })} />
          {t('products.showRemoved')}
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap responsive">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}`}
                  onClick={() => c.sort && set({ sort: c.sort, dir: sort === c.sort && dir === 'asc' ? 'desc' : 'asc' })}>
                  {t(c.label)}{sort === c.sort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className={p.deletedAt ? 'removed' : ''}>
                <td data-label={t('col.code')} className="num">{p.externalId}</td>
                <td data-label={t('col.name')} className="title"><Link to={`/products/${p.id}`}>{p.name || '—'}</Link>{p.discontinued && <span className="tag">{t('products.discontinued')}</span>}</td>
                <td data-label={t('col.barcode')} className="mono">{p.barcode || '—'}</td>
                <td data-label={t('col.category')}>{p.categoryName || (p.categoryExternalId ?? '—')}</td>
                <td data-label={t('col.brand')}>{p.brand || '—'}</td>
                <td data-label={t('col.price')} className="num">{fmt.num(p.price)} <span className="muted">{curSym(p.currencyName)}</span></td>
                <td data-label={t('f.priceListPrice')} className="num">{p.priceList === null ? '—' : fmt.num(p.priceList)}</td>
                <td data-label={t('f.dealerPrice1')} className="num">{p.dealerPrice1 === null ? '—' : fmt.num(p.dealerPrice1)}</td>
                <td data-label={t('col.stock')} className={`num ${p.quantity > 0 ? 'in' : 'out'}`}>{fmt.num(p.quantity, 3)}</td>
                <td data-label={t('col.updated')} className="muted">{fmt.ago(p.syncedAt)}</td>
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

// ------------------------------------------------------------------ Product detail

interface ProductFull {
  id: number; externalId: number; barcode: string | null; name: string; brand: string | null; unit: string | null;
  price: number | null; quantity: number; inPriceList: boolean; discontinued: boolean; note: string | null;
  weight: number | null; volume: number | null; raw: Record<string, unknown>; deletedAt: string | null;
  syncedAt: string | null; createdAt: string; categoryExternalId: number | null; currencyExternalId: number | null;
  category: { name: string } | null; currency: { name: string } | null;
  slug: string | null; isVisible: boolean; images: string[]; webDescription: string | null;
  priceList: number | null; dealerPrice1: number | null; dealerPrice2: number | null;
}

export function ProductPage() {
  const { t, fmt } = useT();
  const { id } = useParams();
  const { data: p, error } = useData<ProductFull>(`/admin/products/${id}`, 15000);
  if (error) return <div className="error">{error}</div>;
  if (!p) return <p className="muted">{t('common.loading')}</p>;
  const yn = (b: boolean) => t(b ? 'common.yes' : 'common.no');
  const rows: [string, ReactNode][] = [
    [t('f.code'), p.externalId],
    [t('f.name'), p.name],
    [t('f.barcode'), p.barcode || '—'],
    [t('f.category'), p.category?.name ?? p.categoryExternalId ?? '—'],
    [t('f.brand'), p.brand || '—'],
    [t('f.unit'), p.unit || '—'],
    [t('f.priceListPrice'), p.priceList === null ? '—' : num2(p.priceList)],
    [t('f.price'), `${fmt.num(p.price)} ${curSym(p.currency?.name)}`],
    [t('f.dealerPrice1'), p.dealerPrice1 === null ? '—' : num2(p.dealerPrice1)],
    [t('f.dealerPrice2'), p.dealerPrice2 === null ? '—' : num2(p.dealerPrice2)],
    [t('f.stock'), fmt.num(p.quantity, 3)],
    [t('f.priceList'), yn(p.inPriceList)],
    [t('f.discontinued'), yn(p.discontinued)],
    [t('f.weight'), fmt.num(p.weight, 3)],
    [t('f.volume'), fmt.num(p.volume, 3)],
    [t('f.note'), p.note || '—'],
    ...Object.entries(p.raw || {}).filter(([k]) => k !== 'ЦенаПрайса').map(([k, v]) => [k, v === null || v === '' ? '—' : num2(v)] as [string, ReactNode]),
  ];
  return (
    <>
      <p><Link to="/products?stock=in">{t('product.back')}</Link></p>
      <header className="page-head">
        <h1>{p.name || `#${p.externalId}`}</h1>
        {p.deletedAt && <span className="tag">{t('product.removed', { date: fmt.date(p.deletedAt) })}</span>}
      </header>
      <div className="grid2">
        <section className="card">
          <h2>{t('product.store')} <FromAccess /></h2>
          <p className="muted small">{t('product.storeNote')}</p>
          <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className="muted small">{t('product.lastSynced', { synced: fmt.date(p.syncedAt), created: fmt.date(p.createdAt) })}</p>
        </section>
        <section className="card">
          <h2>{t('product.web')}</h2>
          <p className="muted small">{t('product.webNote')}</p>
          <dl>
            <div><dt>{t('product.visible')}</dt><dd>{yn(p.isVisible)}</dd></div>
            <div><dt>{t('product.slug')}</dt><dd>{p.slug || '—'}</dd></div>
            <div><dt>{t('product.images')}</dt><dd>{p.images?.length || 0}</dd></div>
            <div><dt>{t('product.description')}</dt><dd>{p.webDescription || '—'}</dd></div>
          </dl>
        </section>
      </div>
      <ProductPhotos id={p.id} images={p.images || []} />
    </>
  );
}

// ------------------------------------------------------------------ Categories

export function CategoriesPage() {
  const { t } = useT();
  const { data, error } = useData<Category[]>('/admin/categories', 30000);
  return (
    <>
      <header className="page-head"><h1>{t('cat.title')} {data && <small>{data.length}</small>} <FromAccess /></h1></header>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap responsive">
        <table>
          <thead><tr><th className="num">{t('col.code')}</th><th>{t('col.name')}</th><th className="num">{t('col.products')}</th></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className={c.deletedAt ? 'removed' : ''}>
                <td data-label={t('col.code')} className="num">{c.externalId}</td>
                <td data-label={t('col.name')}><Link to={`/products?categoryId=${c.externalId}`}>{c.name || '—'}</Link></td>
                <td data-label={t('col.products')} className="num">{c.productCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Import

const IMPORTS: { kind: string; file: string; label: TKey }[] = [
  { kind: 'categories', file: 'Типы.csv', label: 'imp.categories' },
  { kind: 'currencies', file: 'Валюты.csv', label: 'imp.currencies' },
  { kind: 'products', file: 'products.csv', label: 'imp.products' },
];

function ImportRow({ kind, file, label }: { kind: string; file: string; label: TKey }) {
  const { t } = useT();
  const [f, setF] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  async function upload() {
    if (!f) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const body = new FormData();
      body.append('file', f);
      const res = await fetch(`/api/admin/import/${kind}`, { method: 'POST', body, headers: { Authorization: `Bearer ${auth.token}` } });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || res.statusText);
      setResult(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card import-row">
      <div>
        <h2>{t(label)}</h2>
        <p className="muted small">{t('imp.file')} <b>{file}</b></p>
      </div>
      <input type="file" accept=".csv,text/csv" onChange={(e) => { setF(e.target.files?.[0] || null); setResult(null); setError(''); }} />
      <button disabled={!f || busy} onClick={upload}>{busy ? t('imp.busy') : t('imp.import')}</button>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="success">
          {t('imp.done', { imported: String(result.imported), rows: String(result.rows) })}
          {'nameColumn' in result && <> {t('imp.columns', { name: String(result.nameColumn ?? '—'), id: String(result.idColumn) })}</>}
          {Array.isArray(result.ignored) && result.ignored.length > 0 && <> {t('imp.ignored', { cols: (result.ignored as string[]).join(', ') })}</>}
        </div>
      )}
    </section>
  );
}

export function ImportPage() {
  const { t } = useT();
  const [before, after] = t('imp.note').split('{cmd}');
  return (
    <>
      <header className="page-head"><h1>{t('imp.title')}</h1></header>
      <p className="muted">{before}<code>python export_access_to_csv.py --site</code>{after}</p>
      <div className="import-list">
        {IMPORTS.map((i) => <ImportRow key={i.kind} {...i} />)}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Sync

export function SyncPage() {
  const { t, fmt } = useT();
  const [page, setPage] = useState(1);
  const { data: s } = useData<Stats>('/admin/stats', 5000);
  const { data, error } = useData<Paged<SyncLogRow>>(`/admin/sync-log?page=${page}`, 5000);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const entity = (e: string) => (['products', 'categories', 'currencies'].includes(e) ? t(`entity.${e}` as TKey) : e);
  return (
    <>
      <header className="page-head"><h1>{t('syncp.title')}</h1>{s && <SyncBadge s={s} />}</header>
      <p className="muted">{t('syncp.note')}</p>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap responsive">
        <table>
          <thead>
            <tr>
              <th>{t('syncp.time')}</th><th>{t('syncp.table')}</th><th className="num">{t('syncp.updated')}</th>
              <th className="num">{t('syncp.removed')}</th><th>{t('syncp.agent')}</th><th>{t('syncp.batch')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td data-label={t('syncp.time')}>{fmt.date(r.receivedAt)}</td>
                <td data-label={t('syncp.table')}>{entity(r.entity)}</td>
                <td data-label={t('syncp.updated')} className="num">{r.upserts}</td>
                <td data-label={t('syncp.removed')} className="num">{r.deletes}</td>
                <td data-label={t('syncp.agent')} className="muted">{r.agentVersion || '—'}</td>
                <td data-label={t('syncp.batch')} className="mono muted">{r.batchId || '—'}</td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={6} className="empty">{t('syncp.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('syncp.newer')}</button>
        <span>{t('common.page', { page, pages })}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('syncp.older')}</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Change log

const FIELD_LABEL: Record<string, TKey> = {
  name: 'col.name', barcode: 'col.barcode', categoryExternalId: 'col.category', brand: 'col.brand',
  unit: 'f.unit', price: 'col.price', currencyExternalId: 'f.currency', quantity: 'col.stock',
  inPriceList: 'f.priceList', discontinued: 'f.discontinued', note: 'f.note', weight: 'f.weight', volume: 'f.volume',
};

export function LogsPage() {
  const { t, fmt } = useT();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const { data, error } = useData<Paged<ChangeRow>>(`/admin/changes?${params}`, 5000);
  const { data: s } = useData<Stats>('/admin/stats', 10000);
  const { data: tables } = useData<MirrorTable[]>('/admin/tables', 60000);
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
  const page = Number(params.get('page') || 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const val = (v: unknown) => (v === null || v === undefined ? '—' : v === true ? t('common.yes') : v === false ? t('common.no') : num2(v));

  return (
    <>
      <header className="page-head"><h1>{t('logs.title')} {data && <small>{fmt.num(data.total, 0)}</small>}</h1>{s && <SyncBadge s={s} />}</header>
      <p className="muted">{t('logs.note')}</p>
      <div className="filters">
        <input placeholder={t('logs.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={params.get('entity') || ''} onChange={(e) => set({ entity: e.target.value })}>
          <option value="">{t('logs.allEntities')}</option>
          {['products', 'categories', 'currencies', 'site_category', 'site_icon'].map((e) => <option key={e} value={e}>{t(`entity.${e}` as TKey)}</option>)}
          {tables && tables.length > 0 && <option value="tables">{t('logs.allTables')}</option>}
          {tables?.map((tb) => <option key={tb.name} value={`t:${tb.name}`}>{tb.name}</option>)}
        </select>
        <select value={params.get('action') || ''} onChange={(e) => set({ action: e.target.value })}>
          <option value="">{t('logs.allActions')}</option>
          {['created', 'updated', 'restored', 'deleted'].map((a) => <option key={a} value={a}>{t(`act.${a}` as TKey)}</option>)}
        </select>
        <label className="check">{t('logs.from')}<input type="date" value={params.get('from') || ''} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="check">{t('logs.to')}<input type="date" value={params.get('to') || ''} onChange={(e) => set({ to: e.target.value })} /></label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap responsive">
        <table>
          <thead>
            <tr><th>{t('logs.time')}</th><th>{t('logs.table')}</th><th>{t('logs.action')}</th><th>{t('logs.item')}</th><th>{t('logs.changes')}</th></tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td data-label={t('logs.time')} className="nowrap">{fmt.date(r.at)}</td>
                <td data-label={t('logs.table')}>{entityLabel(r.entity, t)}</td>
                <td data-label={t('logs.action')}><span className={`act act-${r.action}`}>{t(`act.${r.action}` as TKey)}</span></td>
                <td data-label={t('logs.item')}>
                  {r.entity.startsWith('t:')
                    ? <Link to={`/tables/${encodeURIComponent(r.entity.slice(2))}?key=${encodeURIComponent(r.rowKey ?? '')}`}>#{r.rowKey}</Link>
                    : r.entity === 'products' ? <Link to={`/products?search=${r.externalId}`}>#{r.externalId}</Link> : `#${r.externalId}`}{' '}
                  {r.name}
                </td>
                <td data-label={t('logs.changes')} className="wide">
                  {Object.entries(r.changes || {}).map(([f, [a, b]]) => (
                    <div key={f} className="chg">
                      <span className="muted">{!r.entity.startsWith('t:') && FIELD_LABEL[f] ? t(FIELD_LABEL[f]) : f}:</span>{' '}
                      <s>{val(a)}</s> → <b>{val(b)}</b>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={5} className="empty">{t('logs.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>{t('syncp.newer')}</button>
        <span>{t('common.page', { page, pages })}</span>
        <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>{t('syncp.older')}</button>
      </div>
    </>
  );
}

const entityLabel = (e: string, t: (k: TKey) => string) => (e.startsWith('t:') ? e.slice(2) : t(`entity.${e}` as TKey));

// Fractional numbers (prices, sums) are shown with two decimals: 252.88777 → 252.89.
const num2 = (v: unknown): string =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2))
    : typeof v === 'string' && /^-?\d+\.\d+$/.test(v) ? Number(v).toFixed(2) : String(v);

// Access dates arrive as ISO text: 2026-11-21T00:00:00 → 21.11.2026 (time kept only when it is set).
const isoDate = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
  if (!m) return null;
  const d = `${m[3]}.${m[2]}.${m[1]}`;
  return m[4] === '00' && m[5] === '00' && (m[6] ?? '00') === '00' ? d : `${d} ${m[4]}:${m[5]}`;
};

const cell = (v: unknown, t: (k: TKey) => string) =>
  v === null || v === undefined || v === '' ? <span className="muted">—</span>
    : v === true ? t('common.yes') : v === false ? t('common.no') : isoDate(v) ?? num2(v);

// ------------------------------------------------------------------ Access tables (full copy)

export function TablesPage() {
  const { t, fmt } = useT();
  const { data, error } = useData<MirrorTable[]>('/admin/tables', 15000);
  const { data: s } = useData<Stats>('/admin/stats', 10000);
  return (
    <>
      <header className="page-head"><h1>{t('tbl.title')} {data && <small>{data.length}</small>}</h1>{s && <SyncBadge s={s} />}</header>
      <p className="muted">{t('tbl.note')}</p>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap responsive">
        <table>
          <thead><tr><th>{t('tbl.name')}</th><th className="num">{t('tbl.rows')}</th><th className="num">{t('tbl.changes')}</th><th>{t('tbl.lastChange')}</th></tr></thead>
          <tbody>
            {data?.map((tb) => (
              <tr key={tb.name}>
                <td data-label={t('tbl.name')}>
                  <Link to={`/tables/${encodeURIComponent(tb.name)}`}><b>{tb.name}</b></Link>{' '}
                  <span className="muted small">{tb.columns.length} col.</span>
                  {!tb.loaded && <span className="muted small"> · {t('tbl.loading')}</span>}
                </td>
                <td data-label={t('tbl.rows')} className="num">{fmt.num(tb.rows, 0)}</td>
                <td data-label={t('tbl.changes')} className="num">
                  {tb.changes ? <Link to={`/logs?entity=${encodeURIComponent(`t:${tb.name}`)}`}>{fmt.num(tb.changes, 0)}</Link> : '0'}
                </td>
                <td data-label={t('tbl.lastChange')} className="nowrap">{tb.lastChangeAt ? fmt.date(tb.lastChangeAt) : '—'}</td>
              </tr>
            ))}
            {data && !data.length && <tr><td colSpan={4} className="empty">{t('tbl.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RowHistory({ table, rowKey }: { table: string; rowKey: string }) {
  const { t, fmt } = useT();
  const { data } = useData<Paged<ChangeRow>>(`/admin/changes?entity=${encodeURIComponent(`t:${table}`)}&key=${encodeURIComponent(rowKey)}`, 10000);
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  if (!data.items.length) return <p className="muted">{t('tbl.noHistory')}</p>;
  return (
    <div className="history">
      {data.items.map((r) => (
        <div key={r.id} className="history-item">
          <span className="nowrap muted small">{fmt.date(r.at)}</span>{' '}
          <span className={`act act-${r.action}`}>{t(`act.${r.action}` as TKey)}</span>
          {Object.entries(r.changes || {}).map(([f, [a, b]]) => (
            <div key={f} className="chg"><span className="muted">{f}:</span> <s>{cell(a, t)}</s> → <b>{cell(b, t)}</b></div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TablePage() {
  const { t, fmt } = useT();
  const { name = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [open, setOpen] = useState<string | null>(params.get('key'));
  const qs = new URLSearchParams(params);
  qs.delete('key');
  if (params.get('key')) qs.set('key', params.get('key')!);
  const { data, error } = useData<MirrorPage>(`/admin/tables/${encodeURIComponent(name)}?${qs}`, 15000);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  useEffect(() => {
    const tm = setTimeout(() => { if (search !== (params.get('search') || '')) set({ search, key: '' }); }, 350);
    return () => clearTimeout(tm);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = Number(params.get('page') || 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const sort = params.get('sort') || '';
  const dir = params.get('dir') || 'asc';
  const sortBy = (c: string) => set({ sort: c, dir: sort === c && dir === 'asc' ? 'desc' : 'asc' });
  const cols = data?.columns || [];
  // Default: newest rows first (first key column, descending).
  useEffect(() => {
    if (!sort && data?.keyColumns.length) {
      const next = new URLSearchParams(params);
      next.set('sort', data.keyColumns[0]);
      next.set('dir', 'desc');
      setParams(next, { replace: true });
    }
  }, [sort, data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <p><Link to="/tables">{t('tbl.back')}</Link></p>
      <header className="page-head"><h1>{name} {data && <small>{fmt.num(data.total, 0)}</small>}</h1></header>
      {data && <p className="muted small">{data.keyColumns.length ? t('tbl.key', { cols: data.keyColumns.join(', ') }) : t('tbl.noKey')}</p>}
      <div className="filters">
        <input placeholder={t('tbl.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="check"><input type="checkbox" checked={params.get('deleted') === '1'} onChange={(e) => set({ deleted: e.target.checked ? '1' : '' })} /> {t('tbl.deleted')}</label>
        {params.get('key') && <button onClick={() => set({ key: '' })}>× #{params.get('key')}</button>}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap mirror">
        <table>
          <thead>
            <tr>{cols.map((c) => (
              <th key={c} className="sortable nowrap" onClick={() => sortBy(c)}>{c}{sort === c ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
            ))}</tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <Fragment key={r.key}>
                <tr className={`clickable${r.deletedAt ? ' deleted' : ''}${open === r.key ? ' open' : ''}`} onClick={() => setOpen(open === r.key ? null : r.key)}>
                  {cols.map((c) => <td key={c} title={r.data[c] == null ? '' : String(r.data[c])}>{cell(r.data[c], t)}</td>)}
                </tr>
                {open === r.key && (
                  <tr className="history-row"><td colSpan={cols.length || 1}>
                    <b>{t('tbl.history')} #{r.key}</b>
                    <RowHistory table={name} rowKey={r.key} />
                  </td></tr>
                )}
              </Fragment>
            ))}
            {data && !data.items.length && <tr><td colSpan={cols.length || 1} className="empty">{t('common.nothing')}</td></tr>}
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
