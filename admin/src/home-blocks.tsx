/**
 * Admin "Главная страница" (/admin/home, plan step 8; backend site-blocks.ts): what the storefront home page shows —
 * hero slider (automatic or hand-picked products by Access code), quick-link cards (automatic or up to 3 own cards),
 * "Best offers" tabs and their order, and which home blocks are hidden. Saved as one JSON document, logged in the journal.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

type L3 = { hy: string; ru: string; en: string };
const E3: L3 = { hy: '', ru: '', en: '' };
interface Home {
  slides: { mode: 'auto' | 'manual'; items: { code: number; tag: L3 }[] };
  quick: { mode: 'auto' | 'manual'; items: { style: 'sale' | 'srv' | 'new'; title: L3; sub: L3; url: string }[] };
  tabs: string[]; hide: string[];
}
interface Card { code: number; name: string; price: number; image: string | null }
interface Cat { s: string; n: [string, string, string] }

const TX = {
  title: ['Главная страница', 'Home page'],
  note: ['Что показывает главная страница сайта. Пустые настройки = автоматически (как сейчас). Сайт обновляется через несколько секунд после сохранения.', 'What the website home page shows. Empty settings = automatic (as now). The site updates a few seconds after saving.'],
  slides: ['Слайдер', 'Hero slider'], auto: ['Автоматически', 'Automatic'], manual: ['Выбрать товары', 'Pick products'],
  slidesAuto: ['По одному товару с фото из каждого раздела каталога (до 5).', 'One product with a photo from each catalog section (up to 5).'],
  slidesManual: ['Коды товаров Access по порядку (до 10). Товары не в наличии не показываются.', 'Access product codes in order (up to 10). Products not in stock are not shown.'],
  code: ['Код товара', 'Product code'], tag: ['Метка (HY / RU / EN, пусто = раздел)', 'Label (HY / RU / EN, empty = section)'],
  add: ['+ добавить', '+ add'], del: ['×', '×'], up: ['↑', '↑'], down: ['↓', '↓'], notFound: ['не найден / нет в наличии', 'not found / not in stock'],
  quick: ['Быстрые ссылки (3 карточки под слайдером)', 'Quick links (3 cards under the slider)'],
  quickAuto: ['Игровые ПК · Сетевое оборудование · Новинки.', 'Gaming PCs · Network equipment · New arrivals.'],
  style: ['Цвет', 'Colour'], sale: ['оранжевый', 'orange'], srv: ['тёмный', 'navy'], new: ['зелёный', 'green'],
  cTitle: ['Заголовок', 'Title'], cSub: ['Подпись', 'Subtitle'], link: ['Ссылка (/computers/gaming, https://…)', 'Link (/computers/gaming, https://…)'],
  tabs: ['Вкладки «Лучшие предложения»', '"Best offers" tabs'], tabsNote: ['Отметьте вкладки; порядок — стрелками. Ничего не отмечено = Новинки + все разделы.', 'Tick the tabs; order with the arrows. Nothing ticked = New + every section.'],
  newTab: ['Новинки', 'New'],
  blocks: ['Блоки страницы', 'Page blocks'], blocksNote: ['Снимите галочку, чтобы скрыть блок.', 'Untick to hide a block.'],
  b_cfgPromo: ['Баннер «Конфигуратор» справа от слайдера', 'Configurator banner next to the slider'], b_gaming: ['Игровой баннер справа от слайдера', 'Gaming banner next to the slider'],
  b_quick: ['Быстрые ссылки', 'Quick links'], b_stats: ['Счётчики (товары, бренды, категории)', 'Counters (products, brands, categories)'],
  b_trust: ['Преимущества (доставка, рассрочка, гарантия, шоурум)', 'Benefits row (delivery, instalments, warranty, showroom)'],
  b_best: ['Лучшие предложения', 'Best offers'], b_build: ['Конфигуратор и готовые сборки', 'Configurator and ready builds'],
  b_credit: ['Рассрочка', 'Instalments'], b_b2b: ['Корпоративным клиентам', 'Business customers'], b_brands: ['Бренды', 'Brands'],
  save: ['Сохранить', 'Save'], saving: ['Сохранение…', 'Saving…'], saved: ['Сохранено', 'Saved'], last: ['Изменено', 'Changed'],
} as const;
const LANGS = ['hy', 'ru', 'en'] as const;

export function HomeBlocksPage() {
  const { lang, locale } = useI18n() as { lang: 'ru' | 'en'; locale: string };
  const tx = (k: keyof typeof TX) => TX[k][lang === 'ru' ? 0 : 1];
  const [h, setH] = useState<Home | null>(null);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const [cats, setCats] = useState<Cat[]>([]);
  const [cards, setCards] = useState<Record<number, Card>>({});
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');

  useEffect(() => {
    api<{ data: Home; blocks: string[]; updatedAt: string | null; updatedBy: string | null }>('/admin/site-blocks/home')
      .then((r) => { setH(r.data); setBlocks(r.blocks); setMeta(r); }).catch((e) => setErr(e.message));
    api<Cat[]>('/shop/categories').then(setCats).catch(() => {});
  }, []);
  const codes = (h?.slides.items || []).map((x) => x.code).filter((c) => c > 0).join(',');
  useEffect(() => {
    if (!codes) return;
    const tm = setTimeout(() => api<{ items: Card[] }>(`/shop/products/by-ids?codes=${codes}`)
      .then((r) => setCards(Object.fromEntries(r.items.map((x) => [x.code, x])))).catch(() => {}), 400);
    return () => clearTimeout(tm);
  }, [codes]);
  if (!h) return err ? <div className="error">{err}</div> : <p className="muted">…</p>;

  const move = <T,>(a: T[], i: number, d: number) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j], b[i]]; return b; };
  const save = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const r = await api<{ data: Home }>('/admin/site-blocks/home', { method: 'PUT', body: JSON.stringify(h) });
      setH(r.data); setMsg(tx('saved')); setMeta({ updatedAt: new Date().toISOString(), updatedBy: null });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const tri = (v: L3, set: (v: L3) => void, ph = '') => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
      {LANGS.map((l) => <input key={l} placeholder={`${l.toUpperCase()}${ph ? ` · ${ph}` : ''}`} value={v[l]} onChange={(e) => set({ ...v, [l]: e.target.value })} />)}
    </div>
  );
  const modeSel = (v: 'auto' | 'manual', set: (m: 'auto' | 'manual') => void) => (
    <div style={{ display: 'flex', gap: 14 }}>
      <label className="check"><input type="radio" checked={v === 'auto'} onChange={() => set('auto')} /> {tx('auto')}</label>
      <label className="check"><input type="radio" checked={v === 'manual'} onChange={() => set('manual')} /> {tx('manual')}</label>
    </div>
  );
  const tabAll = ['new', ...cats.map((c) => c.s)];
  const tabName = (k: string) => (k === 'new' ? tx('newTab') : cats.find((c) => c.s === k)?.n[lang === 'ru' ? 0 : 2] ?? k);
  const tabOrder = [...h.tabs, ...tabAll.filter((k) => !h.tabs.includes(k))];

  return (
    <>
      <header className="page-head"><h1>{tx('title')}</h1></header>
      <p className="muted small">{tx('note')}{meta.updatedAt ? ` · ${tx('last')}: ${new Date(meta.updatedAt).toLocaleString(locale)}${meta.updatedBy ? ` (${meta.updatedBy})` : ''}` : ''}</p>
      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <div className="grid2">
        <section className="card cu-form">
          <h2>{tx('slides')}</h2>
          {modeSel(h.slides.mode, (m) => setH({ ...h, slides: { ...h.slides, mode: m } }))}
          {h.slides.mode === 'auto' ? <p className="muted small">{tx('slidesAuto')}</p> : <>
            <p className="muted small">{tx('slidesManual')}</p>
            {h.slides.items.map((x, i) => {
              const set = (v: Partial<typeof x>) => setH({ ...h, slides: { ...h.slides, items: h.slides.items.map((y, j) => (j === i ? { ...y, ...v } : y)) } });
              const c = cards[x.code];
              return (
                <div key={i} style={{ display: 'grid', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input style={{ width: 110 }} inputMode="numeric" placeholder={tx('code')} value={x.code || ''} onChange={(e) => set({ code: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                    {c?.image ? <img src={c.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} /> : null}
                    <span className={c ? 'small' : 'small error'} style={{ flex: 1 }}>{x.code ? (c ? c.name : tx('notFound')) : ''}</span>
                    <button type="button" className="ghost" onClick={() => setH({ ...h, slides: { ...h.slides, items: move(h.slides.items, i, -1) } })}>{tx('up')}</button>
                    <button type="button" className="ghost" onClick={() => setH({ ...h, slides: { ...h.slides, items: move(h.slides.items, i, 1) } })}>{tx('down')}</button>
                    <button type="button" className="ghost" onClick={() => setH({ ...h, slides: { ...h.slides, items: h.slides.items.filter((_, j) => j !== i) } })}>{tx('del')}</button>
                  </div>
                  <small className="muted">{tx('tag')}</small>
                  {tri(x.tag || E3, (v) => set({ tag: v }))}
                </div>
              );
            })}
            {h.slides.items.length < 10 ? <button type="button" className="ghost" onClick={() => setH({ ...h, slides: { ...h.slides, items: [...h.slides.items, { code: 0, tag: { ...E3 } }] } })}>{tx('add')}</button> : null}
          </>}
        </section>

        <section className="card cu-form">
          <h2>{tx('quick')}</h2>
          {modeSel(h.quick.mode, (m) => setH({ ...h, quick: { ...h.quick, mode: m } }))}
          {h.quick.mode === 'auto' ? <p className="muted small">{tx('quickAuto')}</p> : <>
            {h.quick.items.map((q, i) => {
              const set = (v: Partial<typeof q>) => setH({ ...h, quick: { ...h.quick, items: h.quick.items.map((y, j) => (j === i ? { ...y, ...v } : y)) } });
              return (
                <div key={i} style={{ display: 'grid', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <label>{tx('style')} <select value={q.style} onChange={(e) => set({ style: e.target.value as typeof q.style })}>
                      {(['sale', 'srv', 'new'] as const).map((s) => <option key={s} value={s}>{tx(s)}</option>)}</select></label>
                    <span style={{ flex: 1 }} />
                    <button type="button" className="ghost" onClick={() => setH({ ...h, quick: { ...h.quick, items: move(h.quick.items, i, -1) } })}>{tx('up')}</button>
                    <button type="button" className="ghost" onClick={() => setH({ ...h, quick: { ...h.quick, items: move(h.quick.items, i, 1) } })}>{tx('down')}</button>
                    <button type="button" className="ghost" onClick={() => setH({ ...h, quick: { ...h.quick, items: h.quick.items.filter((_, j) => j !== i) } })}>{tx('del')}</button>
                  </div>
                  <small className="muted">{tx('cTitle')}</small>{tri(q.title, (v) => set({ title: v }))}
                  <small className="muted">{tx('cSub')}</small>{tri(q.sub, (v) => set({ sub: v }))}
                  <label>{tx('link')}<input value={q.url} onChange={(e) => set({ url: e.target.value })} /></label>
                </div>
              );
            })}
            {h.quick.items.length < 3 ? <button type="button" className="ghost" onClick={() => setH({ ...h, quick: { ...h.quick, items: [...h.quick.items, { style: 'new', title: { ...E3 }, sub: { ...E3 }, url: '' }] } })}>{tx('add')}</button> : null}
          </>}
        </section>

        <section className="card cu-form">
          <h2>{tx('tabs')}</h2>
          <p className="muted small">{tx('tabsNote')}</p>
          {tabOrder.map((k) => {
            const on = h.tabs.includes(k), i = h.tabs.indexOf(k);
            return (
              <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label className="check" style={{ flex: 1 }}><input type="checkbox" checked={on}
                  onChange={(e) => setH({ ...h, tabs: e.target.checked ? [...h.tabs, k] : h.tabs.filter((x) => x !== k) })} /> {tabName(k)}</label>
                {on ? <>
                  <button type="button" className="ghost" onClick={() => setH({ ...h, tabs: move(h.tabs, i, -1) })}>{tx('up')}</button>
                  <button type="button" className="ghost" onClick={() => setH({ ...h, tabs: move(h.tabs, i, 1) })}>{tx('down')}</button>
                </> : null}
              </div>
            );
          })}
        </section>

        <section className="card cu-form">
          <h2>{tx('blocks')}</h2>
          <p className="muted small">{tx('blocksNote')}</p>
          {blocks.map((b) => (
            <label key={b} className="check"><input type="checkbox" checked={!h.hide.includes(b)}
              onChange={(e) => setH({ ...h, hide: e.target.checked ? h.hide.filter((x) => x !== b) : [...h.hide, b] })} /> {tx(`b_${b}` as keyof typeof TX)}</label>
          ))}
        </section>
      </div>
      <p><button disabled={busy} onClick={save}>{busy ? tx('saving') : tx('save')}</button></p>
    </>
  );
}
