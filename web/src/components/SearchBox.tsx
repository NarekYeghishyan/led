'use client';
import { useEffect, useRef, useState } from 'react';
import { href, money, pick, t, type Lang } from '@/lib/i18n';

type Suggest = {
  total: number; fix: string | null;
  cats: { path: string; name: string[]; n: number }[];
  items: { code: number; slug: string; name: string; price: number; image: string | null; section: string | null }[];
};
const RECENT = 'led-recent'; // same key as the static templates

const recent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT) || '[]'); return Array.isArray(v) ? v.slice(0, 6) : []; } catch { return []; } };
export function rememberSearch(q: string) {
  const v = q.trim();
  if (!v) return;
  try { localStorage.setItem(RECENT, JSON.stringify([v, ...recent().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 6))); } catch { /* private mode */ }
}

/** Words of the query highlighted in a product name (<mark>, template style). */
function Hl({ text, q }: { text: string; q: string }) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/**
 * Header search: submits to /search?q=, live dropdown from /api/shop/suggest (categories, 5 products, "all results"),
 * recent searches when empty, ↑/↓/Enter/Esc. Template look (.sx in site.css).
 */
export function SearchBox({ lang, initial = '' }: { lang: Lang; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggest | null>(null);
  const [rec, setRec] = useState<string[]>([]);
  const [cur, setCur] = useState(-1);
  const box = useRef<HTMLFormElement>(null);
  const url = (v: string) => `${href(lang, '/search')}?q=${encodeURIComponent(v.trim())}`;

  useEffect(() => {
    const v = q.trim();
    if (!v) { setData(null); return; }
    const ctl = new AbortController();
    const tm = setTimeout(() => {
      fetch(`/api/shop/suggest?q=${encodeURIComponent(v)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setData(d); setCur(-1); } }).catch(() => {});
    }, 180);
    return () => { clearTimeout(tm); ctl.abort(); };
  }, [q]);
  useEffect(() => { // on the search page the box shows the query
    if (/\/search\/?$/.test(location.pathname)) setQ(new URLSearchParams(location.search).get('q') || '');
  }, []);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', out);
    return () => removeEventListener('mousedown', out);
  }, []);

  const links = () => [...(box.current?.querySelectorAll<HTMLAnchorElement>('.sx a[data-k]') || [])];
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    const l = links();
    if (e.key === 'Enter') { if (cur >= 0 && l[cur]) { e.preventDefault(); rememberSearch(q); location.href = l[cur].href; } return; }
    e.preventDefault(); setOpen(true);
    // -1 = the input itself; ↓ past the last link goes back to the input, ↑ from the input to the last link
    setCur((c) => {
      if (!l.length) return -1;
      const x = c + (e.key === 'ArrowDown' ? 1 : -1);
      return x >= l.length ? -1 : x < -1 ? l.length - 1 : x;
    });
  };
  useEffect(() => { links().forEach((a, i) => a.classList.toggle('on', i === cur)); });

  let k = 0;
  const v = q.trim();
  return (
    <form ref={box} className="search" action={href(lang, '/search')} method="get" role="search"
      onSubmit={(e) => { if (!v) { e.preventDefault(); return; } rememberSearch(v); }}>
      <input name="q" type="search" placeholder={t(lang, 'search')} aria-label="search" autoComplete="off" value={q} maxLength={100}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setRec(recent()); setOpen(true); }} onKeyDown={key} />
      <button>{t(lang, 'find')}</button>
      <div className={`sx${open && (v ? data : rec.length) ? ' open' : ''}`} role="listbox">
        {!v ? (
          <>
            <h6><span>{t(lang, 'recent')}</span>
              <button type="button" onClick={() => { try { localStorage.removeItem(RECENT); } catch { /* */ } setRec([]); }}>{t(lang, 'clear')}</button></h6>
            {rec.map((r) => <a key={r} data-k={k++} href={url(r)} onClick={() => rememberSearch(r)}><span className="nm">{r}</span></a>)}
          </>
        ) : data ? (
          <>
            {data.fix ? <a data-k={k++} href={url(data.fix)}><span className="nm">{t(lang, 'didYouMean')} <b>{data.fix}</b></span></a> : null}
            {data.cats.length ? <>
              <h6><span>{t(lang, 'categories')}</span></h6>
              <div className="chips">{data.cats.map((c) => (
                <a key={c.path} data-k={k++} href={href(lang, `/${c.path}`)}>{pick(c.name, lang)} <small>{c.n}</small></a>
              ))}</div>
            </> : null}
            {data.items.length ? <>
              <h6><span>{t(lang, 'productsH')}</span></h6>
              {data.items.map((p) => (
                <a key={p.code} data-k={k++} href={href(lang, `/product/${p.slug}`)} onClick={() => rememberSearch(v)}>
                  <img src={p.image || `/img/placeholder/${p.section || 'default'}.svg`} alt="" />
                  <span className="nm"><Hl text={p.name.replace(/\s*\(.*$/, '')} q={data.fix || v} /><small>{p.name.match(/\((.*)\)?$/)?.[1]?.replace(/\)$/, '') || ''}</small></span>
                  <b>{money(p.price)}</b>
                </a>
              ))}
              <a className="all" data-k={k++} href={url(v)} onClick={() => rememberSearch(v)}>{t(lang, 'allResults', { n: data.total })}</a>
            </> : <div className="none">{t(lang, 'nothingFound')}</div>}
          </>
        ) : null}
      </div>
    </form>
  );
}
