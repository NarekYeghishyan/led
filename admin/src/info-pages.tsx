/**
 * Admin "Страницы сайта" (/admin/pages, plan step 8): texts of the info pages (instalments, about, help pages, delivery,
 * warranty, exchange, contacts) in HY · RU · EN — browser title, heading, lead line and the body HTML.
 * Starts from the template text (GET /info-defaults.json from the storefront); only fields that differ from it are saved
 * (site-blocks 'info'), so "Reset" = back to the template. The server keeps formatting only (no scripts/forms); the
 * contact form stays as the [[form]] placeholder. Preview runs in a sandboxed frame (no scripts).
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

type L3 = 'hy' | 'ru' | 'en';
type F = { title: string; h1: string; lead: string; html: string };
type All = Record<string, Partial<Record<L3, Partial<F>>>>;
const PAGES: [string, string, string, string][] = [ // key, RU name, EN name, site path
  ['credit', 'Рассрочка', 'Instalments', '/credit'], ['about', 'О нас', 'About us', '/about'], ['buy', 'Как купить', 'How to buy', '/how-to-buy'],
  ['order', 'Как заказать', 'How to order', '/how-to-order'], ['pay', 'Как оплатить', 'How to pay', '/how-to-pay'], ['delivery', 'Доставка', 'Delivery', '/delivery'],
  ['warranty', 'Гарантия', 'Warranty', '/warranty'], ['exchange', 'Обмен и возврат', 'Exchange & returns', '/exchange'], ['contacts', 'Контакты', 'Contacts', '/contacts'],
];
const FIELDS: (keyof F)[] = ['title', 'h1', 'lead', 'html'];
const TX = {
  title: ['Страницы сайта', 'Site pages'],
  note: ['Тексты информационных страниц на трёх языках. Сначала показан текущий текст шаблона; сохраняются только изменённые поля. «Как в шаблоне» возвращает исходный текст. Скрипты и формы вырезаются; [[form]] на странице контактов — место формы обратной связи.', 'Texts of the info pages in three languages. The current template text is shown first; only changed fields are saved. "As template" restores the original. Scripts and forms are removed; [[form]] on the contacts page marks the contact form.'],
  f_title: ['Заголовок вкладки браузера', 'Browser tab title'], f_h1: ['Заголовок страницы', 'Page heading'], f_lead: ['Подзаголовок', 'Lead line'], f_html: ['Текст страницы (HTML)', 'Page text (HTML)'],
  reset: ['как в шаблоне', 'as template'], edited: ['изменено', 'edited'], preview: ['Предпросмотр', 'Preview'], open: ['Открыть на сайте ↗', 'Open on the site ↗'],
  save: ['Сохранить', 'Save'], saving: ['Сохранение…', 'Saving…'], saved: ['Сохранено — сайт обновится через несколько секунд', 'Saved — the website updates in a few seconds'],
  unsaved: ['есть несохранённые изменения', 'unsaved changes'],
} as const;

export function InfoPagesPage() {
  const { lang } = useI18n() as { lang: 'ru' | 'en' };
  const tx = (k: keyof typeof TX) => TX[k][lang === 'ru' ? 0 : 1];
  const [defs, setDefs] = useState<All | null>(null);
  const [ed, setEd] = useState<All>({});
  const [saved, setSaved] = useState('{}');
  const [page, setPage] = useState('about');
  const [l, setL] = useState<L3>('hy');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');

  useEffect(() => {
    fetch('/info-defaults.json').then((r) => r.json()).then(setDefs).catch((e) => setErr(String(e)));
    api<{ data: All }>('/admin/site-blocks/info').then((r) => { setEd(r.data || {}); setSaved(JSON.stringify(r.data || {})); }).catch((e) => setErr(e.message));
  }, []);
  const def = defs?.[page]?.[l] as F | undefined;
  const cur = (f: keyof F) => ed[page]?.[l]?.[f] ?? def?.[f] ?? '';
  const isEd = (f: keyof F) => ed[page]?.[l]?.[f] !== undefined;
  const set = (f: keyof F, v: string | undefined) => {
    const p = { ...(ed[page] || {}) }, x = { ...(p[l] || {}) };
    if (v === undefined || v === def?.[f]) delete x[f]; else x[f] = v;
    p[l] = x; setEd({ ...ed, [page]: p }); setMsg('');
  };
  const dirty = JSON.stringify(ed) !== saved;
  const save = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const r = await api<{ data: All }>('/admin/site-blocks/info', { method: 'PUT', body: JSON.stringify(ed) });
      setEd(r.data); setSaved(JSON.stringify(r.data)); setMsg(tx('saved'));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const doc = useMemo(() => `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:15px/1.6 system-ui,sans-serif;color:#16243B;padding:16px;margin:0}
    h1{font-size:24px;margin:0 0 6px}.lead{color:#5B6B82;margin:0 0 16px}svg{display:none}img,iframe{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #E3E9F1;padding:6px}</style>
    <h1>${esc(cur('h1'))}</h1><p class="lead">${esc(cur('lead'))}</p>${cur('html')}`, [ed, page, l, defs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!defs) return err ? <div className="error">{err}</div> : <p className="muted">…</p>;
  const pg = PAGES.find((x) => x[0] === page)!;

  return (
    <>
      <header className="page-head"><h1>{tx('title')}</h1></header>
      <p className="muted small">{tx('note')}</p>
      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 14px' }}>
        {PAGES.map(([k, ru, en]) => (
          <button key={k} type="button" className={k === page ? '' : 'ghost'} onClick={() => setPage(k)}>
            {lang === 'ru' ? ru : en}{ed[k] && Object.values(ed[k]).some((x) => x && Object.keys(x).length) ? ' •' : ''}
          </button>
        ))}
      </div>
      <div className="grid2">
        <section className="card cu-form">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['hy', 'ru', 'en'] as L3[]).map((x) => <button key={x} type="button" className={x === l ? '' : 'ghost'} onClick={() => setL(x)}>{x.toUpperCase()}</button>)}
            <span style={{ flex: 1 }} />
            <a href={`${l === 'hy' ? '' : '/' + l}${pg[3]}`} target="_blank" rel="noopener">{tx('open')}</a>
          </div>
          {FIELDS.map((f) => (
            <label key={f}>
              <span>{tx(`f_${f}` as keyof typeof TX)}
                {isEd(f) ? <> · <b>{tx('edited')}</b> · <button type="button" className="ghost" style={{ padding: '0 6px' }} onClick={() => set(f, undefined)}>{tx('reset')}</button></> : null}
              </span>
              {f === 'html'
                ? <textarea rows={22} className="mono" style={{ fontSize: 12.5 }} value={cur(f)} onChange={(e) => set(f, e.target.value)} />
                : f === 'lead' ? <textarea rows={2} value={cur(f)} onChange={(e) => set(f, e.target.value)} />
                  : <input value={cur(f)} onChange={(e) => set(f, e.target.value)} />}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" disabled={busy || !dirty} onClick={save}>{busy ? tx('saving') : tx('save')}</button>
            {dirty ? <span className="muted small">{tx('unsaved')}</span> : null}
          </div>
        </section>
        <section className="card">
          <h2>{tx('preview')}</h2>
          <iframe title="preview" sandbox="allow-popups" srcDoc={doc} style={{ width: '100%', height: 720, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }} />
        </section>
      </div>
    </>
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
