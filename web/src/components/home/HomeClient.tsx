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
import type { Build } from '@/lib/builds';
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
        // the click is handled here: with the 3D tilt the card moves under the cursor between press and release, so the
        // browser sends the click to this common parent instead of the link. Side card or front card → open that product.
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          const k = Number((e.target as HTMLElement).closest<HTMLElement>('.sl-card')?.dataset.k ?? cur);
          if (k !== cur) { window.location.href = slides[k].url; return; }
          const b = e.currentTarget.querySelector('.sl-card[data-p="0"]')?.getBoundingClientRect();
          if (b && e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom) window.location.href = slides[cur].url;
        }}
        onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (x0.current === null) return; const d = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(d) > 40) go(cur + (d < 0 ? 1 : -1)); }}>
        <div className="sl-floor" aria-hidden="true" />
        {slides.map((x, k) => (
          <a key={x.url} className="sl-card" href={x.url} data-p={pos(k)} data-k={k} aria-label={x.title}
            style={k === cur && tilt ? { ['--tilt' as string]: tilt } : undefined}
            >
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

/** Instalment calculator of the template (index.html #termR): price of a real in-stock product, term 3–36 months,
 *  monthly payment = price × (1 + 1.2 % × months) / months, rounded to 100 ֏ (the template's formula). */
export function CreditCalc({ lang, price }: { lang: Lang; price: number }) {
  const [n, setN] = useState(24);
  const pay = Math.round((price * (1 + 0.012 * n)) / n / 100) * 100;
  return (
    <>
      <div className="calc">
        <div><small>{t(lang, 'crCost')}</small><b>{money(price)}</b></div>
        <div><small>{t(lang, 'crF3')}</small><b>{n} <span>{t(lang, 'crMo')}</span></b></div>
        <div><small>{t(lang, 'crPay')}</small><b style={{ color: 'var(--blue-600)' }}>{money(pay)}</b></div>
      </div>
      <div className="range">
        <input type="range" min={3} max={36} step={3} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label={t(lang, 'crF3')} />
        <div><span>3</span><span>36</span></div>
      </div>
    </>
  );
}

/** "Top ready builds" (template index.html #topBuilds): tabs auto-rotate every 7 s (pause on hover), animated PC tower,
 *  4 spec chips, real parts (lib/builds.ts) with their links, total = sum of real prices, cart adds every part. */
const TB: Record<string, [string, string, string]> = {
  ttl: ['Լավագույն պատրաստի հավաքումներ', 'Топ готовых сборок', 'Top ready builds'],
  office: ['Գրասենյակ', 'Офис', 'Office'], gamer: ['Խաղային', 'Игровой', 'Gaming'], pro: ['Ուլտրա', 'Ультра', 'Ultra'],
  kOffice: ['Աշխատանքի և ուսման համար', 'Для работы и учёбы', 'For work & study'],
  kGamer: ['Խաղերի համար', 'Для игр', 'For gaming'], kPro: ['Սթրիմի և 3D‑ի համար', 'Для стрима и 3D', 'For streaming & 3D'],
  badge: ['Առկա է', 'В наличии', 'In stock'], parts: ['Մասերը', 'Комплектующие', 'Parts'],
  cart: ['Զամբյուղ', 'В корзину', 'Add to cart'], cfg: ['Կարգավորել', 'Настроить', 'Configure'],
  add: ['Հավաքման մասերը ավելացվեցին զամբյուղ', 'Комплектующие сборки добавлены в корзину', 'Build parts added to cart'],
  go: ['Անցնել', 'Перейти', 'View'], sum: ['մասերի գումարը', 'сумма комплектующих', 'sum of the parts'],
};
const TBC = { office: ['#4F8EF7', '#A5C8FF'], gamer: ['#A855F7', '#22D3EE'], pro: ['#F97316', '#FACC15'] } as const;
const TBI = ['cpu', 'monitor', 'server', 'doc'];
export function TopBuilds({ lang, builds, cfgUrl }: { lang: Lang; builds: Build[]; cfgUrl: string }) {
  const L = { hy: 0, ru: 1, en: 2 }[lang];
  const tx = (k: string) => TB[k][L];
  const [cur, setCur] = useState(Math.min(1, builds.length - 1));
  const [hold, setHold] = useState(false);
  const [open, setOpen] = useState(false);
  const DUR = 7000;
  useEffect(() => {
    if (hold || open || builds.length < 2) return;
    const id = setTimeout(() => setCur((c) => (c + 1) % builds.length), DUR);
    return () => clearTimeout(id);
  }, [cur, hold, open, builds.length]);
  if (!builds.length) return null;
  const b = builds[cur];
  const kick = { office: 'kOffice', gamer: 'kGamer', pro: 'kPro' }[b.k];
  const toCart = (e: React.MouseEvent) => {
    e.preventDefault();
    for (const p of b.parts) {
      const u = href(lang, `/product/${p.slug}`), img = p.image || `/img/placeholder/${p.section || 'default'}.svg`;
      add('cart', { id: `p${p.code}`, code: p.code, t: p.name, img, p: p.price, url: u });
    }
    toast(tx('add'), tx('go'), href(lang, '/cart'));
  };
  return (
    <div className={`tb${hold ? ' hold' : ''}`} style={{ '--c1': TBC[b.k][0], '--c2': TBC[b.k][1], '--dur': `${DUR}ms` } as React.CSSProperties}
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <div className="tb-h">
        <b className="tb-ttl">{tx('ttl')}</b>
        <div className="tb-tabs" role="tablist">
          {builds.map((x, i) => <button key={x.k + (i === cur ? cur : '')} role="tab" className={i === cur ? 'on' : ''} onClick={() => { setCur(i); setOpen(false); }}>{tx(x.k)}<i /></button>)}
        </div>
      </div>
      <div className="tb-card in" key={b.k}>
        <div className="tb-pc">
          <span className="tb-badge">{tx('badge')}</span>
          <div className="tb-case"><span className="tb-fan" /><span className="tb-fan" /><span className="tb-fan" />{b.parts.some((p) => p.role === 'gpu') ? <span className="tb-gpu" /> : null}<span className="tb-strip" /></div>
        </div>
        <div className="tb-info">
          <small className="k">{tx(kick)}</small>
          <h4>LED {tx(b.k)}</h4>
          <ul className="tb-spec">{b.spec.map((s, i) => <li key={i}><Icon name={TBI[i]} /><span>{s}</span></li>)}</ul>
          <details className="tb-parts" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
            <summary>{tx('parts')} ({b.parts.length})</summary>
            <ul>{b.parts.map((p) => <li key={p.code}><a href={href(lang, `/product/${p.slug}`)}>{p.name}</a><b>{money(p.price)}</b></li>)}</ul>
          </details>
          <div className="tb-buy">
            <div className="tb-pr"><b>{money(b.price)}</b><small>{tx('sum')}</small></div>
            <div className="tb-act">
              <a className="btn g tb-cart" href="#" title={tx('cart')} aria-label={tx('cart')} onClick={toCart}><Icon name="cart" /></a>
              <a className="btn p tb-cfg" href={cfgUrl} onClick={() => { try { localStorage.setItem('led-asm', JSON.stringify(Object.fromEntries(b.parts.map((p) => [p.role === 'cs' ? 'case' : p.role, { code: p.code, q: 1 }])))); } catch { /* full */ } }}>{tx('cfg')} <Icon name="arrow" /></a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
