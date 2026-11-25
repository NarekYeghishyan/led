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
import { PageBuilder } from './page-builder';

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
  note: ['Тексты информационных страниц на трёх языках. Содержимое собирается из блоков: карточки, цифры, шаги, списки, плитки, таблицы, заметки — справа видно, как будет на сайте. Сохраняются только изменения; «как в шаблоне» возвращает исходный текст.', 'Texts of the info pages in three languages. The content is built from blocks: cards, numbers, steps, lists, tiles, tables, notes — the right side shows how it looks on the site. Only changes are saved; "as template" restores the original.'],
  f_title: ['Заголовок вкладки браузера', 'Browser tab title'], f_h1: ['Заголовок страницы', 'Page heading'], f_lead: ['Подзаголовок', 'Lead line'], f_html: ['Содержимое страницы', 'Page content'],
  blocks: ['Конструктор', 'Constructor'], htmlMode: ['HTML (для специалиста)', 'HTML (expert)'],
  copyFrom: ['Взять блоки из', 'Copy blocks from'], copySure: ['Заменить содержимое этого языка копией? Тексты потом нужно перевести.', 'Replace this language with a copy? Translate the texts afterwards.'],
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
  const [mode, setMode] = useState<'blocks' | 'html'>('blocks');
  // the storefront's own stylesheets + icon sprite, so the constructor and the preview look like the site
  const [site, setSite] = useState<{ css: string[]; sprite: string; icons: string[] }>({ css: [], sprite: '', icons: [] });
  useEffect(() => {
    fetch('/about').then((r) => r.text()).then((h) => {
      const css = [...h.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
      const sprite = (/<svg id="ledIcons"[\s\S]*?<\/svg>(?=\s*<)/.exec(h) || [''])[0];
      const icons = [...sprite.matchAll(/<symbol id="([\w-]+)"/g)].map((m) => m[1]).filter((i) => !/^(br-|logo|ci-|sp-|g-)/.test(i));
      setSite({ css, sprite, icons });
    }).catch(() => {});
  }, []);

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
  const doc = useMemo(() => `<!doctype html><html lang="${l}"><meta charset="utf-8"><base target="_blank">${site.css.map((c) => `<link rel="stylesheet" href="${c}">`).join('')}
    <style>body{margin:0;padding:12px 16px;font-family:Inter,'Noto Sans Armenian',system-ui,sans-serif}.ip{display:block}.ip-main{max-width:none}</style>
    <body>${site.sprite}<main class="info"><div class="ip"><div class="ip-main"><div class="ip-hero"><div><h1>${esc(cur('h1'))}</h1><p>${esc(cur('lead'))}</p></div></div>
    ${cur('html').replace('[[form]]', '')}</div></div></main></body></html>`, [ed, page, l, defs, site]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!defs) return err ? <div className="error">{err}</div> : <p className="muted">…</p>;
  const pg = PAGES.find((x) => x[0] === page)!;

  return (
    <>
      <header className="page-head"><h1>{tx('title')}</h1></header>
      {site.sprite ? <div style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: site.sprite }} /> : null}
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
            <div key={f} className="pb-field">
              <span>{tx(`f_${f}` as keyof typeof TX)}
                {isEd(f) ? <> · <b>{tx('edited')}</b> · <button type="button" className="ghost" style={{ padding: '0 6px' }} onClick={() => set(f, undefined)}>{tx('reset')}</button></> : null}
              </span>
              {f === 'html' ? (
                <>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 8px' }}>
                    <button type="button" className={mode === 'blocks' ? '' : 'ghost'} onClick={() => setMode('blocks')}>{tx('blocks')}</button>
                    <button type="button" className={mode === 'html' ? '' : 'ghost'} onClick={() => setMode('html')}>{tx('htmlMode')}</button>
                    <span style={{ flex: 1 }} />
                    <span className="muted small">{tx('copyFrom')}</span>
                    {(['hy', 'ru', 'en'] as L3[]).filter((x) => x !== l).map((x) => (
                      <button key={x} type="button" className="ghost" onClick={() => {
                        if (!confirm(tx('copySure'))) return;
                        set('html', ed[page]?.[x]?.html ?? (defs?.[page]?.[x] as F | undefined)?.html ?? '');
                      }}>{x.toUpperCase()}</button>
                    ))}
                  </span>
                  {mode === 'html'
                    ? <textarea rows={22} className="mono" style={{ fontSize: 12.5 }} value={cur(f)} onChange={(e) => set(f, e.target.value)} />
                    : <PageBuilder key={`${page}-${l}`} html={cur(f)} onChange={(v) => set(f, v)} icons={site.icons} lang={lang} />}
                </>
              )
                : f === 'lead' ? <textarea rows={2} value={cur(f)} onChange={(e) => set(f, e.target.value)} />
                  : <input value={cur(f)} onChange={(e) => set(f, e.target.value)} />}
            </div>
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
