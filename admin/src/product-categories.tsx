import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type AiSuggestion, type Paged, type SiteCatLink } from './api';
import { useData, useT } from './pages';
import type { SiteCat } from './site-categories';

/**
 * Products → site categories (backend product-categories.ts): review page, category picker, source badges and the
 * block on the product card. Order of power: manual > rules > AI (≥ 90 % applied by itself, lower waits here).
 */

// ------------------------------------------------------------------ site category index

export interface CatIndex {
  ready: boolean; byId: Map<number, SiteCat>; path: (id: number) => string; isLeaf: (id: number) => boolean;
  ordered: { c: SiteCat; depth: number }[];
}
export function catIndex(list: SiteCat[]): CatIndex {
  const byId = new Map(list.map((c) => [c.id, c]));
  const kids = new Map<number | null, SiteCat[]>();
  for (const c of list) kids.set(c.parentId, [...(kids.get(c.parentId) || []), c]);
  for (const a of kids.values()) a.sort((x, y) => x.sort - y.sort || x.id - y.id);
  const name = (c: SiteCat) => c.nameRu || c.nameEn || c.nameHy || '—';
  const path = (id: number): string => {
    const c = byId.get(id);
    if (!c) return `#${id}`;
    return c.parentId === null ? name(c) : `${path(c.parentId)} › ${name(c)}`;
  };
  const ordered: { c: SiteCat; depth: number }[] = [];
  const walk = (p: number | null, d: number) => { for (const c of kids.get(p) || []) { ordered.push({ c, depth: d }); walk(c.id, d + 1); } };
  walk(null, 0);
  return { ready: list.length > 0, byId, path, isLeaf: (id) => !kids.get(id)?.length, ordered };
}
export function useSiteCats() {
  const { data } = useData<SiteCat[]>('/admin/site-categories');
  return useMemo(() => catIndex(data || []), [data]);
}

// ------------------------------------------------------------------ small pieces

export function SourceTag({ l }: { l: Pick<SiteCatLink, 'source' | 'conf'> }) {
  const { t } = useT();
  if (l.source === 'manual') return <span className="src man" title={t('pc.src.manualTip')}>{t('pc.src.manual')}</span>;
  if (l.source === 'ai') return <span className="src ai" title={t('pc.src.aiTip')}>AI{l.conf ? ` ${l.conf}%` : ''}</span>;
  return <span className="src rule" title={t('pc.src.ruleTip')}>{t('pc.src.rule')}</span>;
}

/** Chip with the category path; a group (not an exact subcategory) is marked. */
export function CatChip({ idx, l, short }: { idx: CatIndex; l: SiteCatLink; short?: boolean }) {
  const { t } = useT();
  const full = idx.path(l.id);
  const text = short ? full.split(' › ').slice(-2).join(' › ') : full;
  const leaf = idx.isLeaf(l.id);
  return (
    <span className={`pc-cat${leaf ? '' : ' grp'}`} title={leaf ? full : `${full} — ${t('pc.groupTip')}`}>
      <span>{text}</span><SourceTag l={l} />
    </span>
  );
}

/** Searchable list of the whole tree; returns the chosen ids through one of the action buttons. */
export function CatPicker({ idx, title, initial = [], multi = true, actions, onClose }: {
  idx: CatIndex; title: string; initial?: number[]; multi?: boolean; onClose: () => void;
  actions: { label: string; primary?: boolean; run: (ids: number[]) => void }[];
}) {
  const { t } = useT();
  const [sel, setSel] = useState<Set<number>>(new Set(initial));
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = idx.ordered.filter(({ c }) => !needle || idx.path(c.id).toLowerCase().includes(needle));
  const toggle = (id: number) => setSel((s) => {
    const n = new Set(multi ? s : []);
    if (s.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card pc-pick" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="ghost" aria-label={t('nav.close')} onClick={onClose}>✕</button>
        </div>
        <input autoFocus placeholder={t('pc.pickSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="pc-tree">
          {rows.map(({ c, depth }) => (
            <li key={c.id} style={{ paddingLeft: needle ? 4 : 4 + depth * 18 }}>
              <label className={`check${idx.isLeaf(c.id) ? '' : ' grp'}${c.isVisible ? '' : ' off'}`}>
                <input type={multi ? 'checkbox' : 'radio'} checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
                <span>{needle ? idx.path(c.id) : (c.nameRu || c.nameEn || c.nameHy)}</span>
                {c.inStockCount > 0 && <small className="muted">{c.inStockCount}</small>}
              </label>
            </li>
          ))}
          {!rows.length && <li className="muted">{t('common.nothing')}</li>}
        </ul>
        <div className="pc-pick-foot">
          <span className="muted small">{sel.size ? [...sel].map(idx.path).join('; ') : t('pc.pickNone')}</span>
          <span className="pc-btns">
            {actions.map((a) => (
              <button key={a.label} type="button" className={a.primary ? '' : 'secondary'} onClick={() => a.run([...sel])}>{a.label}</button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

interface AiState {
  running: boolean; by: string | null; startedAt: string | null; finishedAt: string | null; total: number; done: number;
  applied: number; pending: number; none: number; error: string | null; provider: string | null;
}
interface Stats {
  all: number; allAny: number; inStock: number; leaf: number; group: number; none: number; manual: number; aiCount: number; rule: number;
  pending: number; waitingAi: number; aiLastAt: string | null; provider: string | null; autoMin: number; auto: boolean; ai: AiState;
  rules: { at: string | null; ms: number; pairs: number; products: number; error: string | null };
}
interface Row {
  id: number; externalId: number; name: string; brand: string | null; quantity: number; manual: boolean; accessName: string | null;
  cats: SiteCatLink[]; ai: AiSuggestion | null;
}

/** Waits for a running AI job (polls the stats) and then calls done(). */
function useAiWatch(done: () => void) {
  const [watch, setWatch] = useState(false);
  useEffect(() => {
    if (!watch) return;
    const tm = setInterval(async () => {
      try {
        const s = await api<Stats>('/admin/product-categories/stats');
        if (!s.ai.running) { setWatch(false); done(); }
      } catch { setWatch(false); }
    }, 3000);
    return () => clearInterval(tm);
  }, [watch]); // eslint-disable-line react-hooks/exhaustive-deps
  return { watching: watch, watch: () => setWatch(true) };
}

// ------------------------------------------------------------------ product card block

export function ProductSiteCats({ id }: { id: number }) {
  const { t, fmt } = useT();
  const idx = useSiteCats();
  const [rev, setRev] = useState(0);
  const { data, error } = useData<{ manual: boolean; cats: SiteCatLink[]; ai: AiSuggestion | null }>(`/admin/product-categories/product/${id}?r=${rev}`);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const ai = useAiWatch(() => { setMsg(''); setRev((r) => r + 1); });
  async function run(f: () => Promise<unknown>, ok = '') {
    setBusy(true); setErr(''); setMsg('');
    try { await f(); setMsg(ok); setRev((r) => r + 1); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const post = (path: string, body: unknown) => api(`/admin/product-categories/${path}`, { method: 'POST', body: JSON.stringify(body) });
  if (error) return <div className="error">{error}</div>;
  if (!data) return null;
  const sug = data.ai;
  const showSug = sug && sug.cat !== null && ['pending', 'rejected'].includes(sug.status) && !data.manual;
  return (
    <section className="card pc-prod">
      <h2>{t('pc.cardTitle')} {data.manual && <span className="src man">{t('pc.src.manual')}</span>}</h2>
      <p className="muted small">{t('pc.cardNote')}</p>
      <div className="pc-cats">
        {data.cats.map((l) => <CatChip key={l.id} idx={idx} l={l} />)}
        {!data.cats.length && <span className="muted">{t('pc.noCats')}</span>}
      </div>
      {showSug && (
        <div className="pc-sug">
          <span>{t('pc.aiSuggests')} <b>{idx.path(sug.cat!)}</b> <span className="src ai">AI {sug.conf}%</span>
            {sug.why && <span className="muted"> — {sug.why}</span>}
            {sug.status === 'rejected' && <span className="tag bad">{t('pc.rejected')}</span>}</span>
          <span className="pc-btns">
            <button type="button" disabled={busy} onClick={() => run(() => post('accept', { ids: [id] }), t('pc.done'))}>✓ {t('pc.accept')}</button>
            {sug.status !== 'rejected' && <button type="button" className="secondary" disabled={busy} onClick={() => run(() => post('reject', { ids: [id] }), t('pc.done'))}>✕ {t('pc.reject')}</button>}
          </span>
        </div>
      )}
      {sug && sug.status === 'none' && !data.manual && <p className="muted small">{t('pc.aiNone')}{sug.why ? ` — ${sug.why}` : ''} ({fmt.date(sug.at)})</p>}
      <div className="pc-btns">
        <button type="button" disabled={busy || !idx.ready} onClick={() => setPick(true)}>{t('pc.change')}</button>
        {data.manual && <button type="button" className="secondary" disabled={busy} onClick={() => run(() => post('auto', { ids: [id] }), t('pc.done'))}>{t('pc.toAuto')}</button>}
        {!data.manual && <button type="button" className="secondary" disabled={busy || ai.watching}
          onClick={() => run(async () => { await post('ai-run', { ids: [id] }); setMsg(t('pc.aiWorking')); ai.watch(); }, t('pc.aiWorking'))}>
          {ai.watching ? t('pc.aiWorking') : t('pc.askAi')}</button>}
      </div>
      {err && <div className="error">{err}</div>}
      {msg && !err && <div className="success">{msg}</div>}
      {pick && (
        <CatPicker idx={idx} title={t('pc.change')} initial={data.cats.map((c) => c.id)} onClose={() => setPick(false)}
          actions={[{ label: t('pc.save'), primary: true, run: (cats) => { setPick(false); run(() => post('assign', { ids: [id], cats, mode: 'set' }), t('pc.done')); } }]} />
      )}
    </section>
  );
}

// ------------------------------------------------------------------ review page

const VIEWS = ['pending', 'none', 'group', 'ai', 'manual', 'all'] as const;
type View = (typeof VIEWS)[number];

export function ProductCategoriesPage() {
  const { t, fmt } = useT();
  const idx = useSiteCats();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS as readonly string[]).includes(params.get('view') || '') ? params.get('view') as View : 'pending';
  const [rev, setRev] = useState(0);
  const reload = () => setRev((r) => r + 1);
  const [search, setSearch] = useState(params.get('search') || '');
  const { data: st } = useData<Stats>(`/admin/product-categories/stats?r=${rev}`, 15000);
  const q = new URLSearchParams(params);
  q.set('view', view);
  if (!q.get('limit')) q.set('limit', '50');
  q.set('r', String(rev));
  const { data, error } = useData<Paged<Row>>(`/admin/product-categories/products?${q}`);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const ai = useAiWatch(reload);

  useEffect(() => { if (st?.ai.running && !ai.watching) ai.watch(); }, [st?.ai.running]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSel(new Set()), [params.toString()]);
  useEffect(() => {
    const tm = setTimeout(() => { if (search !== (params.get('search') || '')) set({ search }); }, 350);
    return () => clearTimeout(tm);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  }
  async function run(f: () => Promise<unknown>, ok: string) {
    setBusy(true); setErr(''); setMsg('');
    try { await f(); setMsg(ok); setSel(new Set()); reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const post = (path: string, body: unknown) => api(`/admin/product-categories/${path}`, { method: 'POST', body: JSON.stringify(body) });
  const ids = [...sel];
  const items = data?.items || [];
  const allSel = items.length > 0 && items.every((r) => sel.has(r.id));
  const page = Number(params.get('page') || 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const a = st?.ai;
  const tile = (v: View, value: number | undefined, label: string, tone: string) => (
    <button type="button" className={`pc-tile ${tone}${view === v ? ' on' : ''}`} onClick={() => set({ view: v })}>
      <b>{value === undefined ? '…' : fmt.num(value, 0)}</b><span>{label}</span>
    </button>
  );

  return (
    <>
      <header className="page-head"><h1>{t('pc.title')}</h1></header>
      <p className="muted">{t('pc.note', { min: st?.autoMin ?? 90 })}</p>

      <div className="pc-tiles">
        <div className="pc-tile info"><b>{st ? fmt.num(st.inStock, 0) : '…'}</b><span>{t('pc.t.inStock')}</span></div>
        {tile('all', st?.leaf, t('pc.t.leaf'), 'ok')}
        {tile('group', st?.group, t('pc.t.group'), 'warn')}
        {tile('none', st?.none, t('pc.t.none'), 'bad')}
        {tile('pending', st?.pending, t('pc.t.pending'), 'warn')}
        {tile('ai', st?.aiCount, t('pc.t.ai'), 'info')}
        {tile('manual', st?.manual, t('pc.t.manual'), 'info')}
      </div>

      <section className="card pc-run">
        <div>
          <b>{t('pc.rules')}</b>{' '}
          <span className="muted">{st?.rules.at ? t('pc.rulesInfo', { ago: fmt.ago(st.rules.at), n: fmt.num(st.rules.products, 0), all: fmt.num(st.all, 0) }) : '…'}</span>
          {st?.rules.error && <span className="tag bad">{st.rules.error}</span>}
          <button type="button" className="secondary" disabled={busy} onClick={() => run(() => post('rules-run', {}), t('pc.rulesDone'))}>{t('pc.rulesRun')}</button>
          <Link to="/site-categories">{t('pc.editRules')} →</Link>
        </div>
        <div>
          <b>AI</b>{' '}
          {!st ? '…' : !st.provider ? <span className="tag bad">{t('pc.aiOff')}</span> : (
            <span className="muted">
              {st.provider}{st.auto ? ` · ${t('pc.aiAuto')}` : ''}{' · '}
              {a?.running
                ? t('pc.aiRunning', { done: a.done, total: a.total, applied: a.applied, pending: a.pending, none: a.none })
                : a?.finishedAt ? t('pc.aiLast', { ago: fmt.ago(a.finishedAt), total: a.total, applied: a.applied, pending: a.pending, none: a.none })
                  : st.aiLastAt ? t('pc.aiLastAnswer', { ago: fmt.ago(st.aiLastAt) }) : t('pc.aiNever')}
            </span>
          )}
          {a?.error && <span className="tag bad">{a.error}</span>}
          {st?.provider && (
            <button type="button" disabled={busy || !!a?.running || !st.waitingAi}
              onClick={() => run(async () => { await post('ai-run', {}); ai.watch(); }, t('pc.aiStarted'))}>
              {t('pc.aiRun', { n: st.waitingAi })}
            </button>
          )}
        </div>
      </section>

      <div className="pc-views">
        {VIEWS.map((v) => <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => set({ view: v })}>{t(`pc.v.${v}`)}</button>)}
      </div>
      <div className="filters">
        <input placeholder={t('products.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={params.get('stock') || ''} onChange={(e) => set({ stock: e.target.value })}>
          <option value="">{t('products.inStock')}</option>
          <option value="all">{t('pc.allStock')}</option>
        </select>
        <select value={params.get('cat') || ''} onChange={(e) => set({ cat: e.target.value })}>
          <option value="">{t('pc.anyCat')}</option>
          {idx.ordered.map(({ c, depth }) => <option key={c.id} value={c.id}>{'\u00a0'.repeat(depth * 3)}{c.nameRu || c.nameEn}</option>)}
        </select>
      </div>

      {sel.size > 0 && (
        <div className="pc-bulk">
          <b>{t('pc.selected', { n: sel.size })}</b>
          {(view === 'pending' || items.some((r) => sel.has(r.id) && r.ai?.status === 'pending')) && <>
            <button type="button" disabled={busy} onClick={() => run(() => post('accept', { ids }), t('pc.done'))}>✓ {t('pc.acceptAi')}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => run(() => post('reject', { ids }), t('pc.done'))}>✕ {t('pc.rejectAi')}</button>
          </>}
          <button type="button" className="secondary" disabled={busy || !idx.ready} onClick={() => setPick(true)}>{t('pc.assign')}</button>
          <button type="button" className="secondary" disabled={busy || !!a?.running || !st?.provider}
            onClick={() => run(async () => { await post('ai-run', { ids }); ai.watch(); }, t('pc.aiStarted'))}>{t('pc.askAi')}</button>
          {items.some((r) => sel.has(r.id) && r.manual) && (
            <button type="button" className="secondary" disabled={busy} onClick={() => run(() => post('auto', { ids }), t('pc.done'))}>{t('pc.toAuto')}</button>
          )}
          <button type="button" className="ghost" onClick={() => setSel(new Set())}>{t('pc.clearSel')}</button>
        </div>
      )}
      {err && <div className="error">{err}</div>}
      {msg && !err && <div className="success">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="table-wrap responsive">
        <table className="pc-table">
          <thead>
            <tr>
              <th className="pc-ck"><input type="checkbox" aria-label={t('pc.selectAll')} checked={allSel}
                onChange={() => setSel(allSel ? new Set() : new Set(items.map((r) => r.id)))} /></th>
              <th>{t('col.name')}</th>
              <th>{t('pc.colSite')}</th>
              <th>{t('pc.colAi')}</th>
              <th className="num">{t('col.stock')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const s = r.ai;
              const pending = s && s.cat !== null && s.status === 'pending';
              return (
                <tr key={r.id} className={sel.has(r.id) ? 'sel' : ''}>
                  <td className="pc-ck"><input type="checkbox" aria-label={r.name} checked={sel.has(r.id)}
                    onChange={() => setSel((x) => { const n = new Set(x); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
                  <td data-label={t('col.name')} className="title">
                    <Link to={`/products/${r.id}`}>{r.name || '—'}</Link>
                    <div className="muted small">#{r.externalId}{r.brand ? ` · ${r.brand}` : ''}{r.accessName ? ` · Access: ${r.accessName}` : ''}</div>
                  </td>
                  <td data-label={t('pc.colSite')}>
                    <div className="pc-cats">
                      {r.cats.map((l) => <CatChip key={l.id} idx={idx} l={l} short />)}
                      {!r.cats.length && <span className="muted">—</span>}
                      {r.manual && !r.cats.length && <span className="src man">{t('pc.src.manual')}</span>}
                    </div>
                  </td>
                  <td data-label={t('pc.colAi')}>
                    {!s ? <span className="muted">—</span> : (
                      <div className="pc-ai">
                        {s.cat !== null
                          ? <span title={idx.path(s.cat)}>{idx.path(s.cat).split(' › ').slice(-2).join(' › ')} <span className="src ai">{s.conf}%</span></span>
                          : <span className="muted">{t('pc.aiNoneShort')}</span>}
                        <span className={`pc-st ${s.status}`}>{t(`pc.st.${s.status}`)}</span>
                        {s.why && <div className="muted small">{s.why}</div>}
                        {pending && (
                          <span className="pc-btns">
                            <button type="button" className="ghost" disabled={busy} onClick={() => run(() => post('accept', { ids: [r.id] }), t('pc.done'))}>✓ {t('pc.accept')}</button>
                            <button type="button" className="ghost bad" disabled={busy} onClick={() => run(() => post('reject', { ids: [r.id] }), t('pc.done'))}>✕ {t('pc.reject')}</button>
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td data-label={t('col.stock')} className={`num ${r.quantity > 0 ? 'in' : 'out'}`}>{fmt.num(r.quantity, 0)}</td>
                </tr>
              );
            })}
            {data && !items.length && <tr><td colSpan={5} className="empty">{t(view === 'pending' ? 'pc.emptyPending' : 'common.nothing')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>{t('common.prev')}</button>
        <span>{t('common.page', { page, pages })} · {data ? fmt.num(data.total, 0) : '…'}</span>
        <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>{t('common.next')}</button>
        <select value={params.get('limit') || '50'} onChange={(e) => set({ limit: e.target.value })}>
          {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{t('common.perPage', { n })}</option>)}
        </select>
      </div>

      {pick && (
        <CatPicker idx={idx} title={t('pc.assignTitle', { n: sel.size })} onClose={() => setPick(false)}
          actions={[
            { label: t('pc.add'), run: (cats) => { setPick(false); if (cats.length) run(() => post('assign', { ids, cats, mode: 'add' }), t('pc.done')); } },
            { label: t('pc.replace'), primary: true, run: (cats) => { setPick(false); if (cats.length) run(() => post('assign', { ids, cats, mode: 'set' }), t('pc.done')); } },
          ]} />
      )}
    </>
  );
}
