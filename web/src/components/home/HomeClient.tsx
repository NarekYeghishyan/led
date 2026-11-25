'use client';
/**
 * Moving parts of the home page, same behaviour as the template (Design/site/index.html script):
 * - Slider: 6 s per slide with progress bars, pauses under the mouse, arrows / bars / side cards / swipe / ←→, 3D tilt.
 * - Gaming card: crosshair follows the mouse, FPS counter flickers.
 * - Tabs: switch between product grids rendered on the server.
 */
import { useEffect, useRef, useState } from 'react';
import { href, money, t, type Lang } from '@/lib/i18n';
import { add, toast, type StoreItem } from '@/lib/store';
import { Icon } from '../Icon';
import { GM_ART, GM_ICON, GM_TOP } from './art';

export type Slide = { tag: string; title: string; spec: string; price: number; img: string; url: string; item: StoreItem };
const DUR = 6000;
const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function HeroSlider({ lang, slides }: { lang: Lang; slides: Slide[] }) {
  const N = slides.length;
  const [cur, setCur] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState<string | null>(null);
  const [num, setNum] = useState(1);
  const sp = useRef<HTMLDivElement>(null);
  const x0 = useRef<number | null>(null);
  const go = (i: number) => { setCur(((i % N) + N) % N); setTilt(null); };

  useEffect(() => { // autoplay
    if (paused || reduce() || N < 2) return;
    const tm = setTimeout(() => go(cur + 1), DUR);
    return () => clearTimeout(tm);
  });
  useEffect(() => { const tm = setTimeout(() => setNum(cur + 1), 200); return () => clearTimeout(tm); }, [cur]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (!sp.current?.matches(':hover')) return; if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });
  if (!N) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const pos = (k: number) => { let p = k - cur; if (p > N / 2) p -= N; if (p < -N / 2) p += N; return Math.abs(p) <= 2 ? String(p) : 'x'; };
  const s = slides[cur];

  return (
    <div ref={sp} className={`hmain sl${paused ? ' paused' : ''}`} id="spot" style={{ ['--dur' as string]: `${DUR}ms` }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPaused(true); }} onPointerLeave={() => setPaused(false)}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`); e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`); }}>
      <h1 className="vh">{t(lang, 'heroH1')}</h1>
      <div className="sl-num" aria-hidden="true" style={{ opacity: num === cur + 1 ? 1 : 0 }}>{pad(num)}</div>
      <div className="sl-info">
        <span className="eyebrow">{t(lang, 'heroEyebrow')}</span>
        <div className="sl-texts">
          {slides.map((x, i) => (
            <div key={x.url} className={`sl-t${i === cur ? ' on' : ''}`}>
              <span className="sl-tag n">{x.tag}</span><h2>{x.title}</h2>{x.spec ? <p className="sl-spec">{x.spec}</p> : null}
              <div className="sl-price"><b>{money(x.price)}</b></div>
            </div>
          ))}
        </div>
        <div className="btns">
          <a className="btn p sl-add" href={href(lang, '/cart')}
            onClick={(e) => { e.preventDefault(); add('cart', s.item); toast(t(lang, 'addedCart'), t(lang, 'go'), href(lang, '/cart')); }}>
            <Icon name="cart" />{t(lang, 'addCart')}
          </a>
          <a className="btn g" href={s.url}>{t(lang, 'details')} <Icon name="arrow" /></a>
        </div>
        <div className="sl-nav">
          <span className="sl-count"><b>{pad(cur + 1)}</b> / {pad(N)}</span>
          <div className="sl-bars">
            {slides.map((x, i) => <i key={`${x.url}-${i === cur ? cur : 'n'}`} className={i === cur ? 'on' : i < cur ? 'done' : undefined} onClick={() => go(i)}><em /></i>)}
          </div>
          <button className="sl-arr" aria-label="Prev" onClick={() => go(cur - 1)}>&lsaquo;</button>
          <button className="sl-arr" aria-label="Next" onClick={() => go(cur + 1)}>&rsaquo;</button>
        </div>
      </div>
      <div className="sl-stage"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; setTilt(`rotateY(${x * 16}deg) rotateX(${-y * 12}deg)`); }}
        onPointerLeave={() => setTilt(null)}
        onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (x0.current === null) return; const d = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(d) > 40) go(cur + (d < 0 ? 1 : -1)); }}>
        <div className="sl-floor" aria-hidden="true" />
        {slides.map((x, k) => (
          <a key={x.url} className="sl-card" href={x.url} data-p={pos(k)} aria-label={x.title}
            style={k === cur && tilt ? { ['--tilt' as string]: tilt } : undefined}
            onClick={(e) => { if (k !== cur) { e.preventDefault(); go(k); } }}>
            <img src={x.img} className="cover" alt="" />
          </a>
        ))}
      </div>
    </div>
  );
}

/** Gaming promo card: template art + crosshair following the mouse + flickering FPS. */
export function GamingCard({ lang, url }: { lang: Lang; url: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (reduce()) return;
    const f = ref.current?.querySelector('.gm-fps');
    const id = setInterval(() => { if (f) f.textContent = String(232 + Math.round(Math.random() * 16)); }, 700);
    return () => clearInterval(id);
  }, []);
  return (
    <a ref={ref} className="promo gm" href={url}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--gx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--gy', `${e.clientY - r.top}px`); }}>
      <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: GM_ART + GM_ICON + GM_TOP }} />
      <small>Gaming</small>
      <h3>{t(lang, 'gmH')}</h3>
      <span className="gm-go">{t(lang, 'gmGo')} <Icon name="arrow" style={{ width: 16 }} /></span>
    </a>
  );
}

/** "Best offers": tab buttons + the matching server-rendered grid; the "all" link follows the tab. */
export function BestTabs({ title, tabs, all, children }: { title: string; tabs: string[]; all: { href: string; label: string }[]; children: React.ReactNode[] }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0); // bumps the grid's swap animation
  return (
    <section id="best">
      <div className="sh">
        <h2>{title}</h2>
        <div className="tabs" role="tablist">
          {tabs.map((x, k) => <span key={x} role="tab" aria-selected={k === i} className={k === i ? 'on' : undefined} onClick={() => { setI(k); setN(n + 1); }}>{x}</span>)}
        </div>
        <a href={all[i].href}>{all[i].label}</a>
      </div>
      <div key={n} className="pgrid swap">{children[i]}</div>
    </section>
  );
}
