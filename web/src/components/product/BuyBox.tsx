'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { href, money, t, type Lang } from '@/lib/i18n';
import { add, has, toast, toggle, type StoreItem } from '@/lib/store';
import { Icon } from '../Icon';

/** Buy box actions: qty + add to cart (shared localStorage cart), order by phone, wishlist / compare. Sticky bottom bar after scrolling past. */
export function BuyActions({ lang, item, max, phone }: { lang: Lang; item: StoreItem; max: number; phone: string }) {
  const [q, setQ] = useState(1);
  const [fav, setFav] = useState(false);
  const [cmp, setCmp] = useState(false);
  useEffect(() => {
    const r = () => { setFav(has('fav', item.id)); setCmp(has('cmp', item.id)); };
    r(); addEventListener('led:store', r); addEventListener('storage', r);
    return () => { removeEventListener('led:store', r); removeEventListener('storage', r); };
  }, [item.id]);
  const lim = Math.max(1, max);
  const cart = () => { add('cart', item, q); toast(t(lang, 'addedCart'), t(lang, 'go'), href(lang, '/cart')); };
  return (
    <>
      <div className="cta">
        <div className="qty">
          <button aria-label="−" onClick={() => setQ((v) => Math.max(1, v - 1))}>−</button>
          <input value={q} inputMode="numeric" aria-label="qty"
            onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setQ(Number.isFinite(n) ? Math.min(lim, Math.max(1, n)) : 1); }} />
          <button aria-label="+" onClick={() => setQ((v) => Math.min(lim, v + 1))}>+</button>
        </div>
        <button className="addc" onClick={cart}><Icon name="cart" /><span>{t(lang, 'addCart')}</span></button>
      </div>
      <a className="oneclick" href={`tel:${phone}`}><Icon name="call" /><span>{t(lang, 'callOrder')}</span></a>
      <div className="sec-act">
        <button className="fv" aria-pressed={fav} onClick={() => { const v = toggle('fav', item); toast(t(lang, v ? 'favOn' : 'favOff'), v ? t(lang, 'go') : undefined, href(lang, '/favorites')); }}>
          <Icon name="heart" /><span>{t(lang, 'toFav')}</span>
        </button>
        <button className="cp" aria-pressed={cmp} onClick={() => { const v = toggle('cmp', item); toast(t(lang, v ? 'cmpOn' : 'cmpOff'), v ? t(lang, 'go') : undefined, href(lang, '/compare')); }}>
          <Icon name="cmp" /><span>{t(lang, 'compareBtn')}</span>
        </button>
      </div>
      <StickyBar lang={lang} item={item} onAdd={cart} />
    </>
  );
}

function StickyBar({ lang, item, onAdd }: { lang: Lang; item: StoreItem; onAdd: () => void }) {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const el = document.querySelector('.buy');
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => { document.body.classList.toggle('sbar-on', show); return () => document.body.classList.remove('sbar-on'); }, [show]);
  // rendered into <body>: inside the sticky buy box its z-index would only count within that box (cards painted over it)
  if (!mounted) return null;
  return createPortal(
    <div className={`sbar${show ? ' show' : ''}`}>
      <div className="wrap">
        {item.img ? <img src={item.img} alt="" /> : null}
        <div className="t"><b>{item.t}</b><span>{t(lang, 'inStockLong')}</span></div>
        <div className="p"><b>{money(item.p)}</b></div>
        <button className="addc" onClick={onAdd}><Icon name="cart" /><span>{t(lang, 'addCart')}</span></button>
      </div>
    </div>,
    document.body,
  );
}
