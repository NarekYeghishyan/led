import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ago, api, auth, fmtDate, fmtNum, type Category, type Paged, type ProductRow, type Stats, type SyncLogRow,
} from './api';

/** Loads data and reloads it every `refreshMs` (live view of the store). */
function useData<T>(path: string, refreshMs = 0) {
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

const FromAccess = () => <span className="badge">from Access</span>;

function SyncBadge({ at }: { at: string | null }) {
  const sec = at ? (Date.now() - new Date(at).getTime()) / 1000 : Infinity;
  const cls = sec < 600 ? 'ok' : sec < 3600 ? 'warn' : 'bad';
  return <span className={`dot ${cls}`}>Last sync: {ago(at)}</span>;
}

// ------------------------------------------------------------------ Dashboard

export function DashboardPage() {
  const { data: s, error } = useData<Stats>('/admin/stats', 10000);
  return (
    <>
      <header className="page-head"><h1>Dashboard</h1>{s && <SyncBadge at={s.lastSyncAt} />}</header>
      {error && <div className="error">{error}</div>}
      {s && (
        <div className="tiles">
          <Link to="/products" className="tile"><b>{fmtNum(s.products, 0)}</b><span>Products</span></Link>
          <Link to="/products?stock=in" className="tile"><b>{fmtNum(s.inStock, 0)}</b><span>In stock</span></Link>
          <Link to="/products?stock=out" className="tile"><b>{fmtNum(s.outOfStock, 0)}</b><span>Out of stock</span></Link>
          <Link to="/categories" className="tile"><b>{fmtNum(s.categories, 0)}</b><span>Categories</span></Link>
          <Link to="/products?deleted=1" className="tile"><b>{fmtNum(s.deleted, 0)}</b><span>Removed in Access</span></Link>
        </div>
      )}
      <p className="muted">Data comes from the store's Microsoft Access database through the sync agent and refreshes automatically.</p>
    </>
  );
}

// ------------------------------------------------------------------ Products

const COLS: { key: string; label: string; sort?: string; num?: boolean }[] = [
  { key: 'externalId', label: 'Code', sort: 'externalId', num: true },
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'categoryName', label: 'Category' },
  { key: 'brand', label: 'Brand' },
  { key: 'price', label: 'Price', sort: 'price', num: true },
  { key: 'quantity', label: 'Stock', sort: 'quantity', num: true },
  { key: 'syncedAt', label: 'Updated', sort: 'syncedAt' },
];

export function ProductsPage() {
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
    const t = setTimeout(() => { if (search !== (params.get('search') || '')) set({ search }); }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const sort = params.get('sort') || 'name';
  const dir = params.get('dir') || 'asc';
  const page = Number(params.get('page') || 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <header className="page-head">
        <h1>Products {data && <small>{fmtNum(data.total, 0)}</small>}</h1>
      </header>
      <div className="filters">
        <input placeholder="Search name, barcode, brand or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={params.get('categoryId') || ''} onChange={(e) => set({ categoryId: e.target.value })}>
          <option value="">All categories</option>
          {cats?.map((c) => <option key={c.id} value={c.externalId}>{c.name || `#${c.externalId}`} ({c.productCount})</option>)}
        </select>
        <select value={params.get('stock') || ''} onChange={(e) => set({ stock: e.target.value })}>
          <option value="">Any stock</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select value={params.get('discontinued') || ''} onChange={(e) => set({ discontinued: e.target.value })}>
          <option value="">Active + discontinued</option>
          <option value="0">Active only</option>
          <option value="1">Discontinued only</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={params.get('deleted') === '1'} onChange={(e) => set({ deleted: e.target.checked ? '1' : '' })} />
          Show removed
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}`}
                  onClick={() => c.sort && set({ sort: c.sort, dir: sort === c.sort && dir === 'asc' ? 'desc' : 'asc' })}>
                  {c.label}{sort === c.sort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className={p.deletedAt ? 'removed' : ''}>
                <td className="num">{p.externalId}</td>
                <td><Link to={`/products/${p.id}`}>{p.name || '—'}</Link>{p.discontinued && <span className="tag">discontinued</span>}</td>
                <td className="mono">{p.barcode || '—'}</td>
                <td>{p.categoryName || (p.categoryExternalId ?? '—')}</td>
                <td>{p.brand || '—'}</td>
                <td className="num">{fmtNum(p.price)} <span className="muted">{p.currencyName || ''}</span></td>
                <td className={`num ${p.quantity > 0 ? 'in' : 'out'}`}>{fmtNum(p.quantity, 3)}</td>
                <td className="muted">{ago(p.syncedAt)}</td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={COLS.length} className="empty">Nothing found</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>← Prev</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next →</button>
        <select value={params.get('limit') || '50'} onChange={(e) => set({ limit: e.target.value })}>
          {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / page</option>)}
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
}

export function ProductPage() {
  const { id } = useParams();
  const { data: p, error } = useData<ProductFull>(`/admin/products/${id}`, 15000);
  if (error) return <div className="error">{error}</div>;
  if (!p) return <p className="muted">Loading…</p>;
  const rows: [string, React.ReactNode][] = [
    ['Code (КодТовара)', p.externalId],
    ['Name (Марка)', p.name],
    ['Barcode (ШтрихКод)', p.barcode || '—'],
    ['Category (КодТипа)', p.category?.name ?? p.categoryExternalId ?? '—'],
    ['Brand (Производитель)', p.brand || '—'],
    ['Unit (ЕдиницаИзмерения)', p.unit || '—'],
    ['Price (Цена)', `${fmtNum(p.price)} ${p.currency?.name ?? ''}`],
    ['Stock (НаСкладе)', fmtNum(p.quantity, 3)],
    ['In price list (Прайс-Лист)', p.inPriceList ? 'Yes' : 'No'],
    ['Discontinued (ПоставкиПрекращены)', p.discontinued ? 'Yes' : 'No'],
    ['Weight (Вес)', fmtNum(p.weight, 3)],
    ['Volume (Объем)', fmtNum(p.volume, 3)],
    ['Note (Примечание)', p.note || '—'],
    ...Object.entries(p.raw || {}).map(([k, v]) => [k, v === null || v === '' ? '—' : String(v)] as [string, React.ReactNode]),
  ];
  return (
    <>
      <p><Link to="/products">← Products</Link></p>
      <header className="page-head">
        <h1>{p.name || `Product #${p.externalId}`}</h1>
        {p.deletedAt && <span className="tag">removed in Access {fmtDate(p.deletedAt)}</span>}
      </header>
      <div className="grid2">
        <section className="card">
          <h2>Store data <FromAccess /></h2>
          <p className="muted small">Read-only. Change these in the store program; the website updates within seconds.</p>
          <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className="muted small">Last synced: {fmtDate(p.syncedAt)} · first seen: {fmtDate(p.createdAt)}</p>
        </section>
        <section className="card">
          <h2>Website data</h2>
          <p className="muted small">Images, description, SEO and visibility will be editable here (CMS, next step).</p>
          <dl>
            <div><dt>Visible on site</dt><dd>{p.isVisible ? 'Yes' : 'No'}</dd></div>
            <div><dt>Slug</dt><dd>{p.slug || '—'}</dd></div>
            <div><dt>Images</dt><dd>{p.images?.length || 0}</dd></div>
            <div><dt>Description</dt><dd>{p.webDescription || '—'}</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Categories

export function CategoriesPage() {
  const { data, error } = useData<Category[]>('/admin/categories', 30000);
  return (
    <>
      <header className="page-head"><h1>Categories {data && <small>{data.length}</small>} <FromAccess /></h1></header>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">Code</th><th>Name</th><th className="num">Products</th></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className={c.deletedAt ? 'removed' : ''}>
                <td className="num">{c.externalId}</td>
                <td><Link to={`/products?categoryId=${c.externalId}`}>{c.name || '—'}</Link></td>
                <td className="num">{c.productCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Import

const IMPORTS = [
  { kind: 'categories', file: 'Типы.csv', label: 'Categories' },
  { kind: 'currencies', file: 'Валюты.csv', label: 'Currencies' },
  { kind: 'products', file: 'products.csv', label: 'Products' },
];

function ImportRow({ kind, file, label }: { kind: string; file: string; label: string }) {
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
        <h2>{label}</h2>
        <p className="muted small">File: <b>{file}</b></p>
      </div>
      <input type="file" accept=".csv,text/csv" onChange={(e) => { setF(e.target.files?.[0] || null); setResult(null); setError(''); }} />
      <button disabled={!f || busy} onClick={upload}>{busy ? 'Importing…' : 'Import'}</button>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="success">
          Imported {String(result.imported)} of {String(result.rows)} rows.
          {'nameColumn' in result && <> Name column: <b>{String(result.nameColumn ?? '—')}</b>, code column: <b>{String(result.idColumn)}</b>.</>}
          {Array.isArray(result.ignored) && result.ignored.length > 0 && <> Ignored columns: {(result.ignored as string[]).join(', ')}.</>}
        </div>
      )}
    </section>
  );
}

export function ImportPage() {
  return (
    <>
      <header className="page-head"><h1>Import from CSV</h1></header>
      <p className="muted">
        First load of the Access data. On the store server run <code>python export_access_to_csv.py --site</code>,
        then upload the three files below in this order. Importing again updates rows by their code and never creates duplicates.
        After this, the sync agent keeps everything up to date automatically.
      </p>
      <div className="import-list">
        {IMPORTS.map((i) => <ImportRow key={i.kind} {...i} />)}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Sync

export function SyncPage() {
  const [page, setPage] = useState(1);
  const { data: s } = useData<Stats>('/admin/stats', 5000);
  const { data, error } = useData<Paged<SyncLogRow>>(`/admin/sync-log?page=${page}`, 5000);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <>
      <header className="page-head"><h1>Sync</h1>{s && <SyncBadge at={s.lastSyncAt} />}</header>
      <p className="muted">Every batch the store agent sent. The agent only sends rows that changed, so a quiet store means few entries.</p>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Table</th><th className="num">Updated</th><th className="num">Removed</th><th>Agent</th><th>Batch</th></tr></thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.receivedAt)}</td>
                <td>{r.entity}</td>
                <td className="num">{r.upserts}</td>
                <td className="num">{r.deletes}</td>
                <td className="muted">{r.agentVersion || '—'}</td>
                <td className="mono muted">{r.batchId || '—'}</td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={6} className="empty">No sync yet. Start the agent on the store server.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Older →</button>
      </div>
    </>
  );
}
