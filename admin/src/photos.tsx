import { useEffect, useState } from 'react';
import { api } from './api';
import { useT } from './pages';
import type { TKey } from './i18n';

type Kind = 'product' | 'box' | 'infographic' | 'lifestyle' | 'logo' | 'other';
export interface Candidate {
  url: string; preview: string; page: string | null; source: string; width: number; height: number; bytes: number;
  match: number | null; quality: number | null; kind: Kind | null; reason: string | null; best: boolean; gallery: boolean; official?: boolean;
}
export interface SearchResult {
  query: string; candidates: Candidate[]; best: number; errors: string[]; ms: number; rankedBy?: string | null;
  ident?: { brand: string | null; model: string; code: string | null; gtin: string | null };
}

export const MAX_PHOTOS = 12;
const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };

/** Search summary line: brand, query, time, which AI rated. */
export function ResultInfo({ res }: { res: SearchResult }) {
  const { t } = useT();
  const bestC = res.best >= 0 ? res.candidates[res.best] : null;
  return (
    <>
      <p className="small muted">
        {res.ident?.brand && <>{t('photo.brand')}: <b>{res.ident.brand}</b> · </>}«{res.query}» · {(res.ms / 1000).toFixed(0)} s
        {res.rankedBy && <> · AI: {res.rankedBy}</>}
      </p>
      {res.errors.length > 0 && <p className="small muted">⚠ {res.errors.join('; ')}</p>}
      {!res.candidates.length && <p className="muted">{t('photo.nothing')}</p>}
      {res.candidates.length > 0 && (
        <p className="small">{bestC ? <><b>{t('photo.aiPick')}:</b> {bestC.reason}</> : <span className="tag">{t('photo.noExact')}</span>}</p>
      )}
    </>
  );
}

/**
 * Found photos as a grid: click to select (click order = order on the product, the first becomes main unless unticked),
 * "+ gallery photos", save. onSave gets the urls not yet saved.
 */
export function CandidatePicker({ res, room, disabled, saved = [], onSave }: {
  res: SearchResult; room: number; disabled?: boolean; saved?: string[];
  onSave: (urls: string[], main: boolean) => Promise<void>;
}) {
  const { t } = useT();
  const [sel, setSel] = useState<string[]>(() => (res.best >= 0 && !saved.includes(res.candidates[res.best].url) ? [res.candidates[res.best].url] : []));
  const [asMain, setAsMain] = useState(true);
  const [busy, setBusy] = useState(false);
  const toggle = (u: string) => setSel((s) => (s.includes(u) ? s.filter((x) => x !== u) : [...s, u]));
  const toSave = sel.filter((u) => !saved.includes(u));
  const galleryUrls = res.candidates.filter((c) => c.gallery && !saved.includes(c.url)).map((c) => c.url);
  const kindLabel = (k: Kind | null) => (k && k !== 'product' ? t(`photo.kind.${k}` as TKey) : '');
  const off = disabled || busy;

  async function save() {
    if (!toSave.length) return;
    setBusy(true);
    try { await onSave(toSave, asMain); setSel([]); } finally { setBusy(false); }
  }

  if (!res.candidates.length) return null;
  return (
    <>
      <div className="ph-grid">
        {res.candidates.map((c) => {
          const n = sel.indexOf(c.url);
          const done = saved.includes(c.url);
          return (
            <button type="button" key={c.url} disabled={done || off}
              className={`ph-c${n >= 0 ? ' sel' : ''}${c.best ? ' best' : ''}${done ? ' done' : ''}`}
              onClick={() => toggle(c.url)} title={c.reason || ''}>
              <img src={c.preview || c.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span className="ph-tags">
                {c.best && <span className="ph-ai">AI ★</span>}
                {c.gallery && <span className="ph-gal">{t('photo.forGallery')}</span>}
                {c.source === 'icecat' ? <span className="ph-src">Icecat</span> : c.official ? <span className="ph-src">{t('photo.official')}</span> : null}
              </span>
              <span className="ph-chk">{done ? '✓' : n >= 0 ? (n === 0 && asMain ? '★' : n + 1) : ''}</span>
              <span className="ph-meta">
                {c.match !== null ? <>{t('photo.match')} {c.match}% · {t('photo.quality')} {c.quality}%</> : t('photo.notRated')}
                {kindLabel(c.kind) && <> · <b className="ph-kind">{kindLabel(c.kind)}</b></>}
                <br /><span className={Math.min(c.width, c.height) < 600 ? 'ph-small' : 'muted'}>{c.width}×{c.height}</span>
                <span className="muted"> · {c.source === 'icecat' ? 'icecat.biz' : host(c.page || c.url)}</span>
                {c.reason && <><br /><span className="muted">{c.reason}</span></>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="ph-act">
        <button type="button" disabled={off || !toSave.length || toSave.length > room} onClick={save}>
          {busy ? t('photo.saving') : `${t('photo.saveSel')} (${toSave.length})`}
        </button>
        {galleryUrls.some((u) => !sel.includes(u)) && (
          <button type="button" className="ghost" disabled={off}
            onClick={() => setSel((s) => [...s, ...galleryUrls.filter((u) => !s.includes(u))].slice(0, Math.max(room, 1)))}>
            + {t('photo.addGallery')} ({galleryUrls.filter((u) => !sel.includes(u)).length})
          </button>
        )}
        <label className="check small">
          <input type="checkbox" checked={asMain} onChange={(e) => setAsMain(e.target.checked)} /> {t('photo.firstMain')}
        </label>
        {toSave.length > room && <span className="error small">{t('photo.tooMany')} {MAX_PHOTOS}</span>}
        {saved.length > 0 && <span className="tag ok">✓ {t('photo.saved')}: {saved.length}</span>}
      </div>
    </>
  );
}

/** Product photos card: current photos (make main / remove) + AI photo finder. */
export function ProductPhotos({ id, images: initial }: { id: number; images: string[] }) {
  const { t } = useT();
  const [images, setImages] = useState(initial);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'' | 'search' | 'edit'>('');
  const [error, setError] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [secs, setSecs] = useState(0);

  // the product page reloads every 15 s; only take the server list when we are not in the middle of something
  useEffect(() => { if (!busy) setImages(initial); }, [initial.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (busy !== 'search') return;
    setSecs(0);
    const h = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(h);
  }, [busy]);

  async function search() {
    setBusy('search'); setError(''); setRes(null); setSaved([]);
    try {
      setRes(await api<SearchResult>(`/admin/products/${id}/photo-search`, { method: 'POST', body: JSON.stringify({ url: url.trim() || undefined }) }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function save(urls: string[], main: boolean) {
    setError('');
    try {
      const r = await api<{ images: string[] }>(`/admin/products/${id}/images`, { method: 'POST', body: JSON.stringify({ urls, main }) });
      setImages(r.images); setSaved((s) => [...s, ...urls]);
    } catch (e) { setError((e as Error).message); }
  }

  async function update(next: string[]) {
    if (next.length < images.length && !confirm(t('photo.confirmRemove'))) return;
    setBusy('edit'); setError('');
    try { setImages((await api<{ images: string[] }>(`/admin/products/${id}/images`, { method: 'PUT', body: JSON.stringify({ images: next }) })).images); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  return (
    <section className="card ph">
      <h2>{t('product.images')} <small className="muted">{images.length}</small></h2>

      {images.length > 0 ? (
        <div className="ph-cur">
          {images.map((src, i) => (
            <figure key={src} className={i === 0 ? 'main' : ''}>
              <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="" loading="lazy" /></a>
              <figcaption>
                {i === 0 ? <span className="tag ok">{t('photo.main')}</span>
                  : <button type="button" className="ghost" disabled={!!busy} onClick={() => update([src, ...images.filter((x) => x !== src)])}>{t('photo.makeMain')}</button>}
                <button type="button" className="ghost bad" disabled={!!busy} title={t('photo.remove')} onClick={() => update(images.filter((x) => x !== src))}>✕</button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="muted small">{t('photo.none')}</p>}

      <div className="ph-find">
        <button type="button" onClick={search} disabled={!!busy}>
          {busy === 'search' ? `${t('photo.searching')} ${secs} s` : `✨ ${t('photo.find')}`}
        </button>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('photo.urlPh')} disabled={!!busy}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
      </div>
      <p className="muted small">{busy === 'search' ? t('photo.wait') : t('photo.hint')}</p>
      {error && <div className="error">{error}</div>}

      {res && (
        <div className="ph-res">
          <ResultInfo res={res} />
          <CandidatePicker key={res.ms} res={res} room={MAX_PHOTOS - images.length} disabled={!!busy} saved={saved} onSave={save} />
          {res.candidates.length > 0 && <p className="muted small">{t('photo.selHint')}</p>}
        </div>
      )}
    </section>
  );
}
