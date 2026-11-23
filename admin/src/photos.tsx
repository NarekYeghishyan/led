import { useEffect, useState } from 'react';
import { api } from './api';
import { useT } from './pages';
import type { TKey } from './i18n';

type Kind = 'product' | 'box' | 'infographic' | 'lifestyle' | 'logo' | 'other';
interface Candidate {
  url: string; preview: string; page: string | null; source: string; width: number; height: number; bytes: number;
  match: number | null; quality: number | null; kind: Kind | null; reason: string | null; best: boolean; gallery: boolean;
}
interface SearchResult {
  query: string; candidates: Candidate[]; best: number; errors: string[]; ms: number; rankedBy?: string | null;
  ident?: { brand: string | null; model: string; code: string | null; gtin: string | null };
}

const MAX = 12;
const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };

/**
 * Product photos card: current photos (make main / remove) + AI photo finder.
 * Several found photos can be selected; the first selected becomes the main photo, the rest go to the gallery.
 */
export function ProductPhotos({ id, images: initial }: { id: number; images: string[] }) {
  const { t } = useT();
  const [images, setImages] = useState(initial);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'' | 'search' | 'save' | 'edit'>('');
  const [error, setError] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [sel, setSel] = useState<string[]>([]); // selected urls, in click order; [0] = main
  const [saved, setSaved] = useState<string[]>([]);
  const [asMain, setAsMain] = useState(true);
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
    setBusy('search'); setError(''); setRes(null); setSaved([]); setSel([]);
    try {
      const r = await api<SearchResult>(`/admin/products/${id}/photo-search`, { method: 'POST', body: JSON.stringify({ url: url.trim() || undefined }) });
      setRes(r);
      setSel(r.best >= 0 ? [r.candidates[r.best].url] : []);
      setAsMain(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function save() {
    const urls = sel.filter((u) => !saved.includes(u));
    if (!urls.length) return;
    setBusy('save'); setError('');
    try {
      const r = await api<{ images: string[] }>(`/admin/products/${id}/images`, { method: 'POST', body: JSON.stringify({ urls, main: asMain }) });
      setImages(r.images); setSaved((s) => [...s, ...urls]); setSel([]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function update(next: string[]) {
    if (next.length < images.length && !confirm(t('photo.confirmRemove'))) return;
    setBusy('edit'); setError('');
    try { setImages((await api<{ images: string[] }>(`/admin/products/${id}/images`, { method: 'PUT', body: JSON.stringify({ images: next }) })).images); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  const toggle = (u: string) => setSel((s) => (s.includes(u) ? s.filter((x) => x !== u) : [...s, u]));
  const room = MAX - images.length;
  const toSave = sel.filter((u) => !saved.includes(u));
  const galleryUrls = res ? res.candidates.filter((c) => c.gallery && !saved.includes(c.url)).map((c) => c.url) : [];
  const bestC = res && res.best >= 0 ? res.candidates[res.best] : null;
  const kindLabel = (k: Kind | null) => (k && k !== 'product' ? t(`photo.kind.${k}` as TKey) : '');

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
          <p className="small muted">
            {res.ident?.brand && <>{t('photo.brand')}: <b>{res.ident.brand}</b> · </>}«{res.query}» · {(res.ms / 1000).toFixed(0)} s
            {res.rankedBy && <> · AI: {res.rankedBy}</>}
          </p>
          {res.errors.length > 0 && <p className="small muted">⚠ {res.errors.join('; ')}</p>}
          {!res.candidates.length && <p className="muted">{t('photo.nothing')}</p>}
          {res.candidates.length > 0 && (
            <>
              <p className="small">
                {bestC ? <><b>{t('photo.aiPick')}:</b> {bestC.reason}</> : <span className="tag">{t('photo.noExact')}</span>}
              </p>
              <div className="ph-grid">
                {res.candidates.map((c) => {
                  const n = sel.indexOf(c.url);
                  const done = saved.includes(c.url);
                  return (
                    <button type="button" key={c.url} disabled={done || !!busy}
                      className={`ph-c${n >= 0 ? ' sel' : ''}${c.best ? ' best' : ''}${done ? ' done' : ''}`}
                      onClick={() => toggle(c.url)} title={c.reason || ''}>
                      <img src={c.preview} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      <span className="ph-tags">
                        {c.best && <span className="ph-ai">AI ★</span>}
                        {c.gallery && <span className="ph-gal">{t('photo.forGallery')}</span>}
                        {c.source === 'icecat' && <span className="ph-src">Icecat</span>}
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
                <button type="button" disabled={!!busy || !toSave.length || toSave.length > room} onClick={save}>
                  {busy === 'save' ? t('photo.saving') : `${t('photo.saveSel')} (${toSave.length})`}
                </button>
                {galleryUrls.some((u) => !sel.includes(u)) && (
                  <button type="button" className="ghost" disabled={!!busy}
                    onClick={() => setSel((s) => [...s, ...galleryUrls.filter((u) => !s.includes(u))].slice(0, Math.max(room, 1)))}>
                    + {t('photo.addGallery')} ({galleryUrls.filter((u) => !sel.includes(u)).length})
                  </button>
                )}
                <label className="check small">
                  <input type="checkbox" checked={asMain} onChange={(e) => setAsMain(e.target.checked)} /> {t('photo.firstMain')}
                </label>
                {toSave.length > room && <span className="error small">{t('photo.tooMany')} {MAX}</span>}
                {saved.length > 0 && <span className="tag ok">✓ {t('photo.saved')}: {saved.length}</span>}
              </div>
              <p className="muted small">{t('photo.selHint')}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
