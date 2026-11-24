'use client';
/**
 * Visual effects ported from the templates (Design/site-src: category.html scripts, btn_fx.html, card_fx.html,
 * responsive.html). Same behaviour, same classes; all of it honours prefers-reduced-motion.
 * Effect spans are appended at the END of buttons/cards (never first child — page code reads querySelector('span')),
 * and only for a real mouse (on phones the first tap would otherwise be taken as hover).
 */
import { useEffect, useRef, useState } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { Icon } from './Icon';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Page background: drifting network that reacts to the cursor (canvas#bgfx). */
export function BgFx() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, cx = cv.getContext('2d')!, reduce = reduced();
    let W = 0, H = 0, raf = 0;
    let pts: { x: number; y: number; vx: number; vy: number }[] = [];
    const mouse = { x: -999, y: -999 };
    const size = () => {
      const d = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0);
      const n = Math.min(90, Math.round((W * H) / 16000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 }));
    };
    const pm = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const pl = () => { mouse.x = mouse.y = -999; };
    const frame = () => {
      cx.clearRect(0, 0, W, H);
      for (const p of pts) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 140 && d > 0) { p.x += (dx / d) * 1.6; p.y += (dy / d) * 1.6; }
        if (!reduce) { p.x += p.vx; p.y += p.vy; }
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 130) { cx.strokeStyle = `rgba(20,104,220,${0.14 * (1 - d / 130)})`; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
        }
        const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (md < 200) { cx.strokeStyle = `rgba(20,104,220,${0.3 * (1 - md / 200)})`; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(mouse.x, mouse.y); cx.stroke(); }
        cx.fillStyle = 'rgba(20,104,220,.35)'; cx.beginPath(); cx.arc(a.x, a.y, 1.8, 0, 7); cx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    size(); frame();
    addEventListener('resize', size); addEventListener('pointermove', pm); addEventListener('pointerleave', pl);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointermove', pm); removeEventListener('pointerleave', pl); };
  }, []);
  return <canvas id="bgfx" ref={ref} aria-hidden="true" />;
}

/** Footer LED dot matrix that lights up around the cursor (canvas#ftfx, must be inside <footer>). */
export function FooterFx() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ft = c.closest('footer') as HTMLElement, g = c.getContext('2d')!, reduce = reduced();
    let w = 0, h = 0, tt = 0, vis = false, raf = 0;
    const m = { x: -999, y: -999 }, S = 22;
    const sz = () => { const d = devicePixelRatio || 1; w = ft.offsetWidth; h = ft.offsetHeight; c.width = w * d; c.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); };
    const pm = (e: PointerEvent) => {
      const r = ft.getBoundingClientRect(); m.x = e.clientX - r.left; m.y = e.clientY - r.top;
      ft.style.setProperty('--fx', `${m.x}px`); const fh = Math.min(innerWidth * 0.22, 300); ft.style.setProperty('--fy', `${m.y - (h - fh * 0.82)}px`);
    };
    const pl = () => { m.x = m.y = -999; };
    const loop = () => {
      if (!vis) return;
      g.clearRect(0, 0, w, h); tt += 0.02;
      for (let y = S / 2; y < h; y += S) for (let x = S / 2; x < w; x += S) {
        const d = Math.hypot(x - m.x, y - m.y), near = d < 60 ? 0 : Math.max(0, 1 - Math.abs(d - 130) / 70) * 0.8;
        const wave = reduce ? 0 : ((Math.sin(x * 0.012 + tt) * Math.cos(y * 0.02 - tt * 0.7) + 1) / 2) * 0.12;
        const a = 0.06 + wave + near * 0.85;
        g.fillStyle = near > 0.05 ? `rgba(${(79 + near * 120) | 0},${(142 + near * 80) | 0},247,${a})` : `rgba(141,184,255,${a})`;
        g.beginPath(); g.arc(x, y, 1.1 + near * 1.2, 0, 7); g.fill();
      }
      if (!reduce) raf = requestAnimationFrame(loop);
    };
    sz(); addEventListener('resize', sz); ft.addEventListener('pointermove', pm); ft.addEventListener('pointerleave', pl);
    const io = new IntersectionObserver((e) => { vis = e[0].isIntersecting; if (vis) { cancelAnimationFrame(raf); loop(); } });
    io.observe(ft);
    return () => { io.disconnect(); cancelAnimationFrame(raf); removeEventListener('resize', sz); ft.removeEventListener('pointermove', pm); ft.removeEventListener('pointerleave', pl); };
  }, []);
  return <canvas id="ftfx" ref={ref} aria-hidden="true" />;
}

/** Button + card hover effects (btn_fx.html + card_fx.html), installed once on the document. */
export function HoverFx() {
  useEffect(() => {
    // --- buttons
    const P = '.bsum button,.search button,.btn.p,.addc,.sp-b.p,.asm-b.p,.add,.prod .cart,.loadmore,#sAdd,.mi-act .det';
    const S = '.btn:not(.p),.sp-b:not(.p),.asm-b:not(.p),.cmpb,.morebtn,.oneclick,.sec-act button,.sb,.sl-arr,.sp-seg button:not(.on),.stage .nav,.sp-qty button,.asm-q button,.asm-row .x,.sp-f .ht,.sp-f .cb,.sp-pc .x,.sp-promo button,.view button:not(.on),.fbtn,.tf,.rm:not(.sp-del)';
    type FxEl = HTMLElement & { _fx?: number; _pc?: number };
    const skip = (el: Element) => !!el.closest('#stubs,.catbtn,.fab,.lang') || el.classList.contains('catbtn');
    const prepBtn = (el: FxEl | null) => {
      if (!el || el._fx || skip(el)) return null;
      const pri = el.matches(P);
      if (!pri && !el.matches(S)) return null;
      el._fx = 1;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.classList.add('fx', pri ? 'fx-p' : 'fx-s');
      el.insertAdjacentHTML('beforeend', '<span class="fx-g"></span><span class="fx-sh"></span>');
      return el;
    };
    // --- cards / tiles / banners
    const CARD = '.prod,.sp-f,.sp-pc';
    const TILE = '.bi,.rv,.rv-top .big,.sg,#megaBr a,.sp-slot,.asm-row,.sp-row,.sp-opt,.sp-mi,.thumbs button,.t,.feats>div,.brands a,.mh,.c';
    const BAN = '.promo,.build,.credit,.b2b,.stage,.sp-free,.sp-side,.sp-dl,.sp-empty,.asm-sum,.asm-prog,.mega-p,.bsum';
    const ALL = [CARD, TILE, BAN].join(',');
    const prepCard = (c: FxEl) => {
      if (c.closest('#stubs')) return;
      if (c._pc) { if (!c.querySelector(':scope>.pc-g')) c._pc = 0; else return; }
      c._pc = 1;
      const kind = c.matches(CARD) ? 'card' : c.matches(BAN) ? 'ban' : 'tile';
      if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
      const m = getComputedStyle(c).backgroundColor.match(/\d+/g);
      const dark = c.matches('.build,.promo,.mega-p,.bsum') || (!!m && +m[0] + +m[1] + +m[2] < 200 && +(m[3] ?? 1) > 0);
      c.classList.add('pc', `pc-${kind}`);
      if (dark) c.classList.add('pc-dark');
      if (kind === 'ban') c.style.setProperty('--pc-r', '520px');
      if (kind === 'tile') c.style.setProperty('--pc-r', '200px');
      c.insertAdjacentHTML('beforeend', '<span class="pc-g"></span><span class="pc-b"></span>');
      const host = kind === 'card' ? c.querySelector('.img,.im') : c;
      host?.insertAdjacentHTML('beforeend', '<span class="pc-sh"></span>');
    };
    const big = (el: HTMLElement) => el.offsetWidth > 90;
    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const tg = e.target as Element;
      prepBtn(tg.closest?.('button,a') as FxEl | null);
      const c = tg.closest?.(ALL) as FxEl | null;
      if (c) prepCard(c);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const tg = e.target as Element;
      const el = tg.closest?.('.fx') as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        el.style.setProperty('--fx-x', `${x}px`); el.style.setProperty('--fx-y', `${y}px`);
        if (el.classList.contains('fx-p') && big(el)) {
          el.style.setProperty('--fx-tx', `${((x / r.width - 0.5) * 3).toFixed(1)}px`);
          el.style.setProperty('--fx-ty', `${((y / r.height - 0.5) * 2).toFixed(1)}px`);
        }
      }
      const c = tg.closest?.('.pc') as HTMLElement | null;
      if (c) {
        const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, k = c.classList.contains('pc-ban') ? 12 : 8;
        c.style.setProperty('--pc-x', `${x}px`); c.style.setProperty('--pc-y', `${y}px`);
        c.style.setProperty('--pc-tx', `${((x / r.width - 0.5) * -k).toFixed(1)}px`);
        c.style.setProperty('--pc-ty', `${((y / Math.max(r.height, 1) - 0.5) * -k * 0.7).toFixed(1)}px`);
      }
    };
    const out = (e: PointerEvent) => {
      const tg = e.target as Element, rel = e.relatedTarget as Node | null;
      const el = tg.closest?.('.fx') as HTMLElement | null;
      if (el && !el.contains(rel)) { el.style.removeProperty('--fx-tx'); el.style.removeProperty('--fx-ty'); }
      const c = tg.closest?.('.pc') as HTMLElement | null;
      if (c && !c.contains(rel)) { c.style.removeProperty('--pc-tx'); c.style.removeProperty('--pc-ty'); }
    };
    const down = (e: PointerEvent) => {
      const tg = e.target as Element;
      const el = (tg.closest?.('.fx') as HTMLElement | null) || prepBtn(tg.closest?.('button,a') as FxEl | null);
      if (!el) return;
      const r = el.getBoundingClientRect(), s = document.createElement('span');
      s.className = 'fx-r'; s.style.left = `${e.clientX - r.left}px`; s.style.top = `${e.clientY - r.top}px`;
      el.appendChild(s); setTimeout(() => s.remove(), 650);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', down);
    return () => {
      document.removeEventListener('pointerover', over); document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', out); document.removeEventListener('pointerdown', down);
    };
  }, []);
  return null;
}

/** --hdr = real header height when it is sticky (sticky side columns and the compare table use it). */
export function HeaderHeight() {
  useEffect(() => {
    const h = document.querySelector('header.h') as HTMLElement | null;
    if (!h) return;
    const set = () => {
      const pos = getComputedStyle(h).position;
      document.documentElement.style.setProperty('--hdr', `${pos === 'sticky' || pos === 'fixed' ? h.offsetHeight : 0}px`);
    };
    set();
    const ro = new ResizeObserver(set); ro.observe(h);
    addEventListener('resize', set);
    return () => { ro.disconnect(); removeEventListener('resize', set); };
  }, []);
  return null;
}

/** Floating contact button: call, WhatsApp, Telegram, Viber. */
export function Fab({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', c);
    return () => document.removeEventListener('click', c);
  }, []);
  return (
    <div className={`fab${open ? ' open' : ''}`} id="fab" ref={ref}>
      <div className="fab-menu" id="fabMenu" role="menu">
        <a href="tel:+37410502802" className="fm call" role="menuitem"><span className="fi"><Icon name="call" /></span><span><b>{t(lang, 'call')}</b><small>010 502‑802</small></span></a>
        <a href="https://wa.me/37499502802" target="_blank" rel="noopener" className="fm wa" role="menuitem"><span className="fi"><Icon name="wa" /></span><span><b>WhatsApp</b><small>099 502‑802</small></span></a>
        <a href="https://t.me/" target="_blank" rel="noopener" className="fm tg" role="menuitem"><span className="fi"><Icon name="tg" /></span><span><b>Telegram</b><small>@ledam</small></span></a>
        <a href="viber://chat?number=%2B37499502802" className="fm vb" role="menuitem"><span className="fi"><Icon name="vb" /></span><span><b>Viber</b><small>099 502‑802</small></span></a>
      </div>
      <button className="fab-btn" id="fabBtn" aria-expanded={open} aria-controls="fabMenu" aria-label={t(lang, 'contact')} onClick={() => setOpen(!open)}>
        <Icon name="call" className="i ic-call" /><span className="ic-x">✕</span>
      </button>
    </div>
  );
}
