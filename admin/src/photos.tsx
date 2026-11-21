import { useEffect, useState } from 'react';
import { api } from './api';
import { useT } from './pages';

interface Candidate {
  url: string; page: string | null; source: string; width: number; height: number; bytes: number;
  match: number | null; quality: number | null; reason: string | null; best: boolean;
}
interface SearchResult { query: string; candidates: Candidate[]; best: number; needsSearchKey: boolean; errors: string[] }

const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };

/** Product photos card: current photos (make main / remove) + AI photo finder (Gemini picks the best candidate). */
export function ProductPhotos({ id, images: initial }: { id: number; images: string[] }) {
  const { t } = useT();
  const [images, setImages] = useState(initial);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'' | 'search' | 'save' | 'edit'>('');
  const [error, setError] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [pick, setPick] = useState(-1);
  const [saved, setSaved] = useState('');

  // the product page reloads every 15 s; only take the server list when we are not in the middle of something
  useEffect(() => { if (!busy) setImages(initial); }, [initial.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search() {
    setBusy('search'); setError(''); setRes(null); setSaved('');
    try {
      const r = await api<SearchResult>(`/admin/products/${id}/photo-search`, { method: 'POST', body: JSON.stringify({ url: url.trim() || undefined }) });
      setRes(r); setPick(r.best >= 0 ? r.best : -1);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function save(c: Candidate) {
    setBusy('save'); setError('');
    try {
      const r = await api<{ images: string[] }>(`/admin/products/${id}/images`, { method: 'POST', body: JSON.stringify({ url: c.url, main: true }) });
      setImages(r.images); setSaved(c.url);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function update(next: string[]) {
    if (next.length < images.length && !confirm(t('photo.confirmRemove'))) return;
    setBusy('edit'); setError('');
    try { setImages((await api<{ images: string[] }>(`/admin/products/${id}/images`, { method: 'PUT', body: JSON.stringify({ images: next }) })).images); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  const chosen = res && pick >= 0 ? res.candidates[pick] : null;
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
          {busy === 'search' ? t('photo.searching') : `✨ ${t('photo.find')}`}
        </button>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('photo.urlPh')} disabled={!!busy}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
      </div>
      <p className="muted small">{busy === 'search' ? t('photo.wait') : t('photo.hint')}</p>
      {error && <div className="error">{error}</div>}

      {res && (
        <div className="ph-res">
          {res.needsSearchKey && <div className="error">{t('photo.noKey')}</div>}
          {!res.needsSearchKey && !res.candidates.length && <p className="muted">{t('photo.nothing')}{res.errors.length ? `: ${res.errors.join('; ')}` : ''}</p>}
          {res.candidates.length > 0 && (
            <>
              <p className="small">
                {res.best >= 0 ? <><b>{t('photo.aiPick')}:</b> {res.candidates[res.best].reason}</> : <span className="tag">{t('photo.noExact')}</span>}
                {' '}<span className="muted">· «{res.query}»</span>
              </p>
              <div className="ph-grid">
                {res.candidates.map((c, i) => (
                  <button type="button" key={c.url} className={`ph-c${i === pick ? ' sel' : ''}${c.best ? ' best' : ''}`} onClick={() => setPick(i)} title={c.reason || ''}>
                    <img src={c.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    {c.best && <span className="ph-ai">AI ★</span>}
                    <span className="ph-meta">
                      {c.match !== null ? <>{t('photo.match')} {c.match}% · {t('photo.quality')} {c.quality}%</> : t('photo.notRated')}
                      <br /><span className="muted">{c.width}×{c.height} · {host(c.page || c.url)}</span>
                    </span>
                  </button>
                ))}
              </div>
              {chosen && (
                <div className="ph-act">
                  <button type="button" disabled={!!busy || saved === chosen.url || images.length >= 12} onClick={() => save(chosen)}>
                    {saved === chosen.url ? `✓ ${t('photo.saved')}` : busy === 'save' ? t('photo.saving') : t('photo.save')}
                  </button>
                  {chosen.reason && <span className="muted small">{chosen.reason}</span>}
                  {chosen.page && <a className="small" href={chosen.page} target="_blank" rel="noreferrer">{t('photo.source')} ↗</a>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
