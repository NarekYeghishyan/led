/**
 * Product card → "Website data" editor (plan step 8, backend product-web.ts): show on site, URL slug, old (sale) price,
 * description / SEO title / meta description in HY · RU · EN, corrections of the specs read from the name.
 * Access data stays read-only; only these site fields are saved (PATCH /api/admin/products/:id/web, logged in the journal).
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

type L3 = 'hy' | 'ru' | 'en';
type Web = Partial<Record<'desc' | 'title' | 'meta', Partial<Record<L3, string>>>>;
export interface WebFields { id: number; isVisible: boolean; slug: string | null; web: Web; oldPrice: number | null; specEdit: Record<string, string> }
interface SpecKey { k: string; names: [string, string, string]; group: string }

const TX = {
  title: ['Данные сайта', 'Website data'],
  note: ['Эти поля видит только сайт; данные магазина (Access) не меняются. Пустое поле = текст по умолчанию.', 'Only the website uses these; store data (Access) is not changed. Empty field = default text.'],
  visible: ['Показывать на сайте', 'Show on the website'],
  slug: ['URL (slug)', 'URL slug'], slugHint: ['пусто = из названия', 'empty = from the name'],
  old: ['Старая цена, ֏ (скидка)', 'Old price, ֏ (sale)'], oldHint: ['показывается зачёркнутой, только если больше текущей цены', 'shown crossed out only when above the current price'],
  desc: ['Описание', 'Description'], seoT: ['SEO заголовок', 'SEO title'], seoD: ['SEO описание', 'SEO description'],
  specs: ['Характеристики', 'Specs'], specsNote: ['Слева — прочитано из названия. Введите значение, чтобы исправить; «скрыть» убирает характеристику с сайта.', 'Left: read from the name. Type a value to correct it; "hide" removes the spec from the site.'],
  hide: ['скрыть', 'hide'], add: ['+ характеристика', '+ spec'], none: ['—', '—'],
  save: ['Сохранить', 'Save'], saving: ['Сохранение…', 'Saving…'], saved: ['Сохранено — сайт обновится через несколько секунд', 'Saved — the website updates in a few seconds'],
} as const;
const LANGS: [L3, string][] = [['hy', 'HY'], ['ru', 'RU'], ['en', 'EN']];

export function ProductWeb({ p, price, onSaved }: { p: WebFields; price: number | null; onSaved?: () => void }) {
  const { lang } = useI18n();
  const tx = (k: keyof typeof TX) => TX[k][lang === 'ru' ? 0 : 1];
  const [f, setF] = useState(() => ({ isVisible: p.isVisible, slug: p.slug || '', oldPrice: p.oldPrice ? String(p.oldPrice) : '', web: p.web || {}, specEdit: p.specEdit || {} }));
  const [tab, setTab] = useState<L3>('hy');
  const [specs, setSpecs] = useState<{ parsed: Record<string, string>; keys: SpecKey[] } | null>(null);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(''), [err, setErr] = useState('');
  useEffect(() => { api<{ parsed: Record<string, string>; keys: SpecKey[] }>(`/admin/products/${p.id}/web/specs`).then(setSpecs).catch(() => {}); }, [p.id]);

  const setWeb = (k: 'desc' | 'title' | 'meta', v: string) => setF({ ...f, web: { ...f.web, [k]: { ...(f.web[k] || {}), [tab]: v } } });
  const save = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      await api(`/admin/products/${p.id}/web`, { method: 'PATCH', body: JSON.stringify({ ...f, oldPrice: f.oldPrice.trim() === '' ? null : Number(f.oldPrice.replace(/\s/g, '')) }) });
      setMsg(tx('saved')); onSaved?.();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const name = (k: SpecKey) => (lang === 'ru' ? k.names[0] : k.names[2]);
  const shown = specs ? specs.keys.filter((k) => specs.parsed[k.k] !== undefined || f.specEdit[k.k] !== undefined) : [];
  const old = Number(f.oldPrice.replace(/\s/g, ''));

  return (
    <form className="card cu-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h2>{tx('title')}</h2>
      <p className="muted small">{tx('note')}</p>
      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <label className="check"><input type="checkbox" checked={f.isVisible} onChange={(e) => setF({ ...f, isVisible: e.target.checked })} /> {tx('visible')}</label>
      <div className="cu-grid">
        <label>{tx('slug')}<input value={f.slug} placeholder={tx('slugHint')} onChange={(e) => setF({ ...f, slug: e.target.value })} /></label>
        <label>{tx('old')}<input inputMode="numeric" value={f.oldPrice} onChange={(e) => setF({ ...f, oldPrice: e.target.value })} />
          <small className={old && price && old <= price ? 'error' : 'muted'}>{tx('oldHint')}</small></label>
      </div>
      <div className="seg" role="tablist" style={{ display: 'flex', gap: 6 }}>
        {LANGS.map(([l, n]) => (
          <button type="button" key={l} className={tab === l ? '' : 'ghost'} onClick={() => setTab(l)}
            style={{ padding: '4px 12px' }}>{n}{f.web.desc?.[l] ? ' ✓' : ''}</button>
        ))}
      </div>
      <label>{tx('desc')} ({tab.toUpperCase()})<textarea rows={8} value={f.web.desc?.[tab] || ''} onChange={(e) => setWeb('desc', e.target.value)} /></label>
      <label>{tx('seoT')} ({tab.toUpperCase()}) <small className="muted">{(f.web.title?.[tab] || '').length}/60</small>
        <input value={f.web.title?.[tab] || ''} maxLength={120} onChange={(e) => setWeb('title', e.target.value)} /></label>
      <label>{tx('seoD')} ({tab.toUpperCase()}) <small className="muted">{(f.web.meta?.[tab] || '').length}/160</small>
        <textarea rows={2} maxLength={300} value={f.web.meta?.[tab] || ''} onChange={(e) => setWeb('meta', e.target.value)} /></label>

      <h2>{tx('specs')}</h2>
      <p className="muted small">{tx('specsNote')}</p>
      {specs && (
        <table className="tbl">
          <tbody>
            {shown.map((k) => {
              const e = f.specEdit[k.k], hidden = e === '';
              return (
                <tr key={k.k}>
                  <td>{name(k)}</td>
                  <td className="muted">{specs.parsed[k.k] ?? tx('none')}</td>
                  <td><input value={e ?? ''} disabled={hidden} placeholder={specs.parsed[k.k] ?? ''}
                    onChange={(ev) => { const v = { ...f.specEdit }; if (ev.target.value) v[k.k] = ev.target.value; else delete v[k.k]; setF({ ...f, specEdit: v }); }} /></td>
                  <td><label className="check"><input type="checkbox" checked={hidden}
                    onChange={(ev) => { const v = { ...f.specEdit }; if (ev.target.checked) v[k.k] = ''; else delete v[k.k]; setF({ ...f, specEdit: v }); }} /> {tx('hide')}</label></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {specs && (
        <select value={extra} onChange={(e) => { const k = e.target.value; setExtra(''); if (k) setF({ ...f, specEdit: { ...f.specEdit, [k]: f.specEdit[k] || ' ' } }); }}>
          <option value="">{tx('add')}</option>
          {specs.keys.filter((k) => !shown.includes(k)).map((k) => <option key={k.k} value={k.k}>{name(k)}</option>)}
        </select>
      )}
      <button disabled={busy}>{busy ? tx('saving') : tx('save')}</button>
    </form>
  );
}
