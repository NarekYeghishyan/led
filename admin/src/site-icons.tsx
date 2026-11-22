import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useT } from './pages';

/** Category icon (backend/src/site-icons.ts). `body` is SVG markup already cleaned by the server's whitelist. */
export interface SiteIcon { id: number; key: string; name: string; viewBox: string; body: string; builtin: boolean; usedBy: number }

export function IconSvg({ icon, size = 22 }: { icon?: Pick<SiteIcon, 'viewBox' | 'body'> | null; size?: number }) {
  if (!icon) return <span className="ic ic-none" style={{ width: size, height: size }} />;
  // body comes from the server whitelist (shapes + presentation attributes only)
  return <svg className="ic" width={size} height={size} viewBox={icon.viewBox} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon.body }} />;
}

/** Modal: pick an icon for a category; add, replace or delete custom icons. */
export function IconPicker({ icons, value, onPick, onClose, onChanged }: {
  icons: SiteIcon[]; value: string | null; onPick: (key: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<SiteIcon | 'new' | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') (form ? setForm(null) : onClose()); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [form, onClose]);
  const s = q.trim().toLowerCase();
  const list = icons.filter((i) => !s || i.name.toLowerCase().includes(s) || i.key.includes(s));
  const custom = list.filter((i) => !i.builtin), builtin = list.filter((i) => i.builtin);
  const tile = (i: SiteIcon) => (
    <div key={i.id} className={`ip-tile${i.key === value ? ' sel' : ''}`}>
      <button type="button" className="ip-pick" title={i.key} onClick={() => onPick(i.key)}>
        <IconSvg icon={i} size={26} /><span>{i.name}</span>
      </button>
      {!i.builtin && <button type="button" className="ghost ip-edit" title={t('ic.edit')} onClick={() => setForm(i)}>✎</button>}
    </div>
  );
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label={t('ic.title')}>
        <div className="modal-head">
          <h2>{form ? (form === 'new' ? t('ic.new') : form.name) : t('ic.title')}</h2>
          <button type="button" className="ghost close-x" aria-label="×" onClick={form ? () => setForm(null) : onClose}>×</button>
        </div>
        {form
          ? <IconForm icon={form === 'new' ? null : form} onDone={(key) => { onChanged(); setForm(null); if (key) onPick(key); }} />
          : (
            <>
              <div className="filters">
                <input placeholder={t('ic.search')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                <button type="button" onClick={() => setForm('new')}>＋ {t('ic.add')}</button>
              </div>
              {custom.length > 0 && <><h3 className="ip-h">{t('ic.custom')}</h3><div className="ip-grid">{custom.map(tile)}</div></>}
              <h3 className="ip-h">{t('ic.builtin')}</h3>
              <div className="ip-grid">{builtin.map(tile)}</div>
              {!list.length && <p className="muted">{t('sc.empty')}</p>}
            </>
          )}
      </div>
    </div>
  );
}

/** Add a new icon (upload .svg or paste code) or replace/rename/delete an added one. Live preview = what the site will get. */
function IconForm({ icon, onDone }: { icon: SiteIcon | null; onDone: (pickKey?: string) => void }) {
  const { t } = useT();
  const [name, setName] = useState(icon?.name || '');
  const [svg, setSvg] = useState('');
  const [fill, setFill] = useState(false);
  const [mono, setMono] = useState(true);
  const [prev, setPrev] = useState<{ viewBox: string; body: string } | null>(icon ? { viewBox: icon.viewBox, body: icon.body } : null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // preview through the server, so it shows exactly what will be saved
  useEffect(() => {
    if (!svg.trim()) { setPrev(icon ? { viewBox: icon.viewBox, body: icon.body } : null); setErr(''); return; }
    const tm = setTimeout(() => {
      api<{ viewBox: string; body: string }>('/admin/site-icons/preview', { method: 'POST', body: JSON.stringify({ svg, fill, mono }) })
        .then((p) => { setPrev(p); setErr(''); }).catch((e) => { setPrev(null); setErr(e.message); });
    }, 350);
    return () => clearTimeout(tm);
  }, [svg, fill, mono, icon]);

  async function load(f?: File) {
    if (!f) return;
    if (f.size > 60_000) { setErr(t('ic.tooBig')); return; }
    const text = await f.text();
    setSvg(text);
    if (!name) setName(f.name.replace(/\.svg$/i, '').replace(/[-_]+/g, ' ').trim());
    // filled icon sets usually have no stroke at all
    setFill(!/stroke\s*[=:]/i.test(text) || /fill\s*=\s*"currentColor"/i.test(text));
  }
  async function save() {
    setBusy(true); setErr('');
    try {
      const body = JSON.stringify({ name, ...(svg.trim() ? { svg, fill, mono } : {}) });
      const r = icon
        ? await api<SiteIcon>(`/admin/site-icons/${icon.id}`, { method: 'PATCH', body })
        : await api<SiteIcon>('/admin/site-icons', { method: 'POST', body });
      onDone(icon ? undefined : r.key);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!icon || !confirm(t('ic.confirmDel'))) return;
    setBusy(true); setErr('');
    try { await api(`/admin/site-icons/${icon.id}`, { method: 'DELETE' }); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="cu-form ic-form">
      <label>{t('ic.name')}<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      <div className="ic-src">
        <button type="button" onClick={() => file.current?.click()}>{t('ic.upload')}</button>
        <input ref={file} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
        <span className="muted small">{icon ? t('ic.replaceHint') : t('ic.hint')}</span>
      </div>
      <label>{t('ic.code')}<textarea rows={5} className="mono" value={svg} onChange={(e) => setSvg(e.target.value)} placeholder='<svg viewBox="0 0 24 24">…</svg>' /></label>
      <div className="ic-opts">
        <label className="check"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} disabled={!svg.trim()} />{t('ic.fill')}</label>
        <label className="check"><input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} disabled={!svg.trim()} />{t('ic.mono')}</label>
      </div>
      <div className="ic-prev">
        <span className="muted small">{t('ic.preview')}</span>
        {prev ? (
          <div className="ic-prev-row">
            <span className="ic-site"><IconSvg icon={prev} size={22} /></span>
            <span className="ic-site dark"><IconSvg icon={prev} size={22} /></span>
            <span className="ic-big"><IconSvg icon={prev} size={64} /></span>
          </div>
        ) : <span className="muted small">—</span>}
      </div>
      {icon && icon.usedBy > 0 && <p className="muted small">{t('ic.usedBy', { n: icon.usedBy })}</p>}
      {err && <div className="error">{err}</div>}
      <div className="sc-btns">
        <button type="button" disabled={busy || !name.trim() || (!icon && !prev)} onClick={save}>{icon ? t('sc.save') : t('ic.addPick')}</button>
        {icon && <button type="button" className="danger" disabled={busy || icon.usedBy > 0} title={icon.usedBy ? t('ic.usedBy', { n: icon.usedBy }) : undefined} onClick={remove}>{t('sc.delete')}</button>}
      </div>
    </div>
  );
}
