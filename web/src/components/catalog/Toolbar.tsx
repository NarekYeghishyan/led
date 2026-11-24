'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Lang, type TKey } from '@/lib/i18n';
import { SORTS, toSearch, type CatQuery } from './query';

const SORT_LABEL: Record<(typeof SORTS)[number], [TKey, string]> = {
  default: ['sortDefault', 'spark'], cheap: ['sortCheap', 'up'], expensive: ['sortExpensive', 'down'], new: ['sortNew', 'spark'], name: ['sortName', 'menu'],
};
const VIEW_KEY = 'led-view';

/** Active-filter chips (✕ removes one), sort menu and grid/list switch — markup of the template's .toolbar. */
export function Toolbar({ lang, base, q, chips }: { lang: Lang; base: string; q: CatQuery; chips: { label: string; change: Partial<CatQuery> }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { setList(localStorage.getItem(VIEW_KEY) === 'list'); } catch { /* */ }
    const c = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', c);
    return () => document.removeEventListener('click', c);
  }, []);
  useEffect(() => { document.querySelector('.cgrid3')?.classList.toggle('list', list); }, [list]);
  const cur = (q.sort ?? 'default') as (typeof SORTS)[number];
  const go = (change: Partial<CatQuery>) => router.push(base + toSearch(q, change), { scroll: false });
  const view = (v: boolean) => { setList(v); try { localStorage.setItem(VIEW_KEY, v ? 'list' : 'grid'); } catch { /* */ } };
  return (
    <div className="toolbar">
      <div className="chips">
        {chips.map((c) => (
          <span key={c.label}>{c.label} <i role="button" tabIndex={0} aria-label={t(lang, 'reset')} onClick={() => go(c.change)}>✕</i></span>
        ))}
      </div>
      <div className="tb-r">
        <div className={`sort${open ? ' open' : ''}`} id="sort" ref={ref}>
          <span>{t(lang, 'sortBy')}</span>
          <button className="sb" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
            <b id="sortCur">{t(lang, SORT_LABEL[cur][0])}</b><svg className="i" aria-hidden="true"><use href="#chev" /></svg>
          </button>
          <ul role="listbox">
            {SORTS.map((s) => (
              <li key={s} role="option" aria-selected={s === cur} className={s === cur ? 'on' : undefined}
                onClick={() => { setOpen(false); go({ sort: s === 'default' ? undefined : s }); }}>
                <svg className="i" aria-hidden="true"><use href={`#${SORT_LABEL[s][1]}`} /></svg><span>{t(lang, SORT_LABEL[s][0])}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="view">
          <button type="button" className={list ? undefined : 'on'} aria-label="grid" aria-pressed={!list} onClick={() => view(false)}>
            <svg className="i" aria-hidden="true"><use href="#grid" /></svg>
          </button>
          <button type="button" className={list ? 'on' : undefined} aria-label="list" aria-pressed={list} onClick={() => view(true)}>
            <svg className="i" aria-hidden="true"><use href="#menu" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Product grid: a click anywhere on a card opens the product (Ctrl/middle click → new tab); its buttons keep their action. */
export function Grid({ children }: { children: React.ReactNode }) {
  const open = (e: React.MouseEvent, newTab: boolean) => {
    const el = e.target as Element;
    if (el.closest('a,button,[role=button],input,label')) return;
    const card = el.closest('.prod') as HTMLElement | null;
    const url = card?.dataset.href;
    if (!url) return;
    if (newTab || e.ctrlKey || e.metaKey) window.open(url, '_blank'); else location.href = url;
  };
  return (
    <div className="pgrid cgrid3" onClick={(e) => open(e, false)} onAuxClick={(e) => { if (e.button === 1) open(e, true); }}>
      {children}
    </div>
  );
}
