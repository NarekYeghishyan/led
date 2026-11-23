import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { useT } from './pages';
import type { TKey } from './i18n';
import { CandidatePicker, MAX_PHOTOS, ResultInfo, type SearchResult } from './photos';

/** Batch AI photo search (backend photo-batch.ts): start for N products, progress, review the results. */

type Status = 'queued' | 'running' | 'saved' | 'review' | 'none' | 'error' | 'accepted' | 'skipped';
interface Stats {
  paused: string | null; running: boolean; current: { jobId: number; productId: number; name: string; since: string } | null;
  counts: Record<Status, number>; eligible: number; inStock: number; withPhotos: number;
}
interface Job {
  id: number; productId: number; status: Status; auto: boolean; url: string | null; result: SearchResult | null; saved: string[];
  error: string | null; ms: number | null; finishedAt: string | null; decidedBy: string | null;
  name: string; externalId: number; barcode: string | null; images: string[]; quantity: number;
}
const VIEWS: Status[] = ['review', 'saved', 'accepted', 'none', 'error', 'skipped', 'queued'];
const TONE: Record<Status, string> = { review: 'warn', saved: 'ok', accepted: 'ok', none: 'bad', error: 'bad', skipped: 'info', queued: 'info', running: 'info' };

export function PhotoBatchPage() {
  const { t, fmt } = useT();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS as string[]).includes(params.get('v') || '') ? (params.get('v') as Status) : 'review';
  const page = Number(params.get('page') || 1);
  const [st, setSt] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<{ items: Job[]; total: number; size: number } | null>(null);
  const [limit, setLimit] = useState(10);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const reload = () => setTick((x) => x + 1);

  useEffect(() => {
    let alive = true;
    Promise.all([api<Stats>('/admin/photo-batch/stats'), api<{ items: Job[]; total: number; size: number }>(`/admin/photo-batch/jobs?status=${view}&page=${page}`)])
      .then(([s, j]) => { if (alive) { setSt(s); setJobs(j); setErr(''); } })
      .catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [view, page, tick]);
  // while the worker runs, refresh the numbers (and the list, except on the review tab — not to disturb a choice)
  useEffect(() => {
    if (!st?.running && (!st?.counts.queued || st.paused)) return;
    const h = setInterval(async () => {
      try {
        const s = await api<Stats>('/admin/photo-batch/stats');
        setSt(s);
        if (view !== 'review' || !s.running) reload();
      } catch { /* next time */ }
    }, 4000);
    return () => clearInterval(h);
  }, [st?.running, st?.counts.queued, view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(f: () => Promise<unknown>, ok = '') {
    setBusy(true); setErr(''); setMsg('');
    try { await f(); if (ok) setMsg(ok); reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const post = (path: string, body: unknown = {}) => api(`/admin/photo-batch/${path}`, { method: 'POST', body: JSON.stringify(body) });
  const set = (v: Status) => setParams({ v });
  const c = st?.counts;
  const pending = (c?.queued || 0) + (c?.running || 0);
  const pages = jobs ? Math.max(1, Math.ceil(jobs.total / jobs.size)) : 1;

  return (
    <>
      <header className="page-head"><h1>{t('pb.title')}</h1></header>
      <p className="muted">{t('pb.note')}</p>

      <div className="pc-tiles">
        <div className="pc-tile info"><b>{st ? fmt.num(st.inStock, 0) : '…'}</b><span>{t('pb.t.inStock')}</span></div>
        <div className="pc-tile ok"><b>{st ? fmt.num(st.withPhotos, 0) : '…'}</b><span>{t('pb.t.withPhotos')}</span></div>
        <div className="pc-tile info"><b>{st ? fmt.num(st.eligible, 0) : '…'}</b><span>{t('pb.t.eligible')}</span></div>
        {VIEWS.slice(0, 5).map((v) => (
          <button key={v} type="button" className={`pc-tile ${TONE[v]}${view === v ? ' on' : ''}`} onClick={() => set(v)}>
            <b>{c ? fmt.num(c[v], 0) : '…'}</b><span>{t(`pb.s.${v}` as TKey)}</span>
          </button>
        ))}
      </div>

      <section className="card pc-run pb-run">
        <div>
          <b>{t('pb.start')}</b>
          <input type="number" min={1} max={300} value={limit} disabled={busy} onChange={(e) => setLimit(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} />
          <span className="muted">{t('pb.products')}</span>
          <label className="check small"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('pb.auto')}</label>
          <button type="button" disabled={busy || !st?.eligible}
            onClick={() => run(async () => { const r = await post('start', { limit, auto }) as { queued: number }; setMsg(t('pb.queued', { n: r.queued })); })}>
            ▶ {t('pb.run')}
          </button>
          {pending > 0 && <button type="button" className="secondary" disabled={busy} onClick={() => run(() => post('stop'), t('pb.stopped'))}>■ {t('pb.stop')}</button>}
        </div>
        {st?.paused && <div className="error small">⏸ {t('pb.paused')}: {st.paused}</div>}
        <div className="muted small">
          {st?.running && st.current
            ? <>⏳ {t('pb.now')}: <Link to={`/products/${st.current.productId}`}>{st.current.name}</Link> · {t('pb.left', { n: pending })}</>
            : pending ? t('pb.waiting', { n: pending }) : t('pb.idle')}
        </div>
      </section>

      <div className="pc-views">
        {VIEWS.map((v) => <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => set(v)}>{t(`pb.s.${v}` as TKey)} {c ? `(${c[v]})` : ''}</button>)}
      </div>
      {err && <div className="error">{err}</div>}
      {msg && !err && <div className="success">{msg}</div>}

      <div className="pb-list">
        {jobs?.items.map((j) => <JobCard key={`${j.id}-${j.status}-${j.finishedAt}`} j={j} busy={busy} run={run} post={post} />)}
        {jobs && !jobs.items.length && <p className="muted">{t('common.nothing')}</p>}
      </div>
      {jobs && jobs.total > jobs.size && (
        <div className="pager">
          <button disabled={page <= 1} onClick={() => setParams({ v: view, page: String(page - 1) })}>{t('common.prev')}</button>
          <span>{t('common.page', { page, pages })}</span>
          <button disabled={page >= pages} onClick={() => setParams({ v: view, page: String(page + 1) })}>{t('common.next')}</button>
        </div>
      )}
    </>
  );
}

function JobCard({ j, busy, run, post }: {
  j: Job; busy: boolean; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; post: (p: string, b?: unknown) => Promise<unknown>;
}) {
  const { t, fmt } = useT();
  const [link, setLink] = useState('');
  const [open, setOpen] = useState(j.status === 'review');
  const res = j.result;
  return (
    <section className={`card pb-job ${j.status}`}>
      <div className="pb-head">
        <span className={`tag ${TONE[j.status]}`}>{t(`pb.s.${j.status}` as TKey)}</span>
        <Link to={`/products/${j.productId}`} className="pb-name">{j.name}</Link>
        <span className="muted small">#{j.externalId}{j.barcode ? ` · ${j.barcode}` : ''}{j.ms ? ` · ${Math.round(j.ms / 1000)} s` : ''}
          {j.finishedAt ? ` · ${fmt.ago(j.finishedAt)}` : ''}{j.decidedBy ? ` · ${j.decidedBy}` : ''}</span>
      </div>

      {j.images.length > 0 && (
        <div className="pb-cur">
          <span className="muted small">{t('pb.onProduct')}:</span>
          {j.images.map((src, i) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className={i === 0 ? 'main' : ''} /></a>)}
        </div>
      )}
      {j.url && <p className="small muted">{t('pb.byLink')}: <a href={j.url} target="_blank" rel="noreferrer">{j.url}</a></p>}
      {j.error && <p className="small error">{j.error}</p>}

      {res && (
        <>
          {j.status !== 'review' && (
            <button type="button" className="ghost small" onClick={() => setOpen((o) => !o)}>
              {open ? '▲' : '▼'} {t('pb.found', { n: res.candidates.length })}
            </button>
          )}
          {open && (
            <div className="ph-res">
              <ResultInfo res={res} />
              <CandidatePicker res={res} room={MAX_PHOTOS - j.images.length} disabled={busy} saved={j.saved}
                onSave={(urls, main) => run(() => post(`jobs/${j.id}/accept`, { urls, main }), t('pb.savedMsg'))} />
            </div>
          )}
        </>
      )}

      <div className="pb-actions">
        {['saved', 'accepted'].includes(j.status) && j.saved.length > 0 && (
          <button type="button" className="secondary" disabled={busy}
            onClick={() => confirm(t('pb.undoConfirm')) && run(() => post(`jobs/${j.id}/undo`), t('pb.undone'))}>↶ {t('pb.undo')}</button>
        )}
        {!['queued', 'running'].includes(j.status) && (
          <>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('photo.urlPh')} disabled={busy} />
            <button type="button" className="secondary" disabled={busy}
              onClick={() => run(() => post(`jobs/${j.id}/retry`, { url: link.trim() || undefined }), t('pb.retried'))}>
              ↻ {link.trim() ? t('pb.retryLink') : t('pb.retry')}
            </button>
          </>
        )}
        {['review', 'none', 'error'].includes(j.status) && (
          <button type="button" className="ghost" disabled={busy} onClick={() => run(() => post(`jobs/${j.id}/skip`))}>{t('pb.skip')}</button>
        )}
      </div>
    </section>
  );
}
