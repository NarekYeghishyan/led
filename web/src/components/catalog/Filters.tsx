'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Lang } from '@/lib/i18n';
import { toSearch, type CatQuery } from './query';

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const closeDrawer = () => document.body.classList.remove('flt-open');

/**
 * Filter panel: brands (counts from the API facets) and price. Every change navigates to the new URL and the server
 * renders the result. On phones the panel is a full-screen drawer (body.flt-open, CSS from responsive.html) opened by
 * the toolbar's "Filters" button.
 */
export function Filters({ lang, base, q, brands, price, total, children }: {
  lang: Lang; base: string; q: CatQuery; brands: { v: string; n: number }[]; price: { min: number; max: number }; total: number;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const go = (change: Partial<CatQuery>) => router.push(base + toSearch(q, change), { scroll: false });
  const [min, setMin] = useState(q.min ? String(q.min) : '');
  const [max, setMax] = useState(q.max ? String(q.max) : '');
  useEffect(() => { setMin(q.min ? String(q.min) : ''); setMax(q.max ? String(q.max) : ''); }, [q.min, q.max]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    addEventListener('keydown', k);
    return () => { removeEventListener('keydown', k); closeDrawer(); };
  }, []);
  const num = (s: string) => { const n = Math.round(Number(s.replace(/\D/g, ''))); return n > 0 ? n : undefined; };
  const applyPrice = () => { const a = num(min), b = num(max); if (a !== q.min || b !== q.max) go({ min: a, max: b }); };
  const sel = new Set(q.brand.map((b) => b.toLowerCase()));
  return (
    <aside className="filters">
      <div className="flt-hd"><span>{t(lang, 'filters')}</span><button type="button" aria-label={t(lang, 'close')} onClick={closeDrawer}>✕</button></div>
      {children}
      <div className="fh">
        <b>{t(lang, 'filters')}</b>
        <a href={base} onClick={(e) => { e.preventDefault(); router.push(base, { scroll: false }); }}>{t(lang, 'reset')}</a>
      </div>
      <details open>
        <summary>{t(lang, 'price')}</summary>
        <form className="price" onSubmit={(e) => { e.preventDefault(); applyPrice(); }}>
          <input inputMode="numeric" aria-label={t(lang, 'priceFrom')} placeholder={price.min ? fmt(price.min) : t(lang, 'priceFrom')}
            value={min} onChange={(e) => setMin(e.target.value)} onBlur={applyPrice} />
          <span>—</span>
          <input inputMode="numeric" aria-label={t(lang, 'priceTo')} placeholder={price.max ? fmt(price.max) : t(lang, 'priceTo')}
            value={max} onChange={(e) => setMax(e.target.value)} onBlur={applyPrice} />
          <button type="submit" hidden>{t(lang, 'apply')}</button>
        </form>
      </details>
      {brands.length > 0 && (
        <details open>
          <summary>{t(lang, 'brand')}</summary>
          {brands.map((b) => {
            const on = sel.has(b.v.toLowerCase());
            const next = on ? q.brand.filter((x) => x.toLowerCase() !== b.v.toLowerCase()) : [...q.brand, b.v];
            return (
              <label key={b.v} className="ck">
                <input type="checkbox" checked={on} onChange={() => go({ brand: next })} />
                <span>{b.v}</span><em>{b.n}</em>
              </label>
            );
          })}
        </details>
      )}
      <button type="button" className="flt-go"
        onClick={() => { closeDrawer(); document.querySelector('.results')?.scrollIntoView({ behavior: 'smooth' }); }}>
        {t(lang, 'show')} ({total})
      </button>
    </aside>
  );
}

/** Toolbar button that opens the filter drawer on phones (hidden on desktop by the template CSS). */
export function FiltersButton({ lang, count }: { lang: Lang; count: number }) {
  return (
    <button type="button" className="fbtn" onClick={() => document.body.classList.add('flt-open')}>
      <svg className="i" aria-hidden="true"><use href="#filter" /></svg><span>{t(lang, 'filters')}</span>{count ? <em>{count}</em> : null}
    </button>
  );
}
