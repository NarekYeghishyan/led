'use client';
import { useEffect, useState } from 'react';
import { STATIC, t, type Lang } from '@/lib/i18n';
import { add, has, toast, toggle, type StoreItem } from '@/lib/store';
import { Icon } from './Icon';

/** Cart / ♡ / compare buttons of a product card (shared localStorage store, toasts like the templates). */
export function CardButtons({ lang, item, part }: { lang: Lang; item: StoreItem; part: 'cart' | 'fav' | 'cmp' }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (part === 'cart') return;
    const k = part;
    const r = () => setOn(has(k, item.id));
    r(); addEventListener('led:store', r); addEventListener('storage', r);
    return () => { removeEventListener('led:store', r); removeEventListener('storage', r); };
  }, [part, item.id]);
  if (part === 'cart') {
    return (
      <a className="cart" href={STATIC.cart} aria-label={t(lang, 'cart')}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); add('cart', item); toast(t(lang, 'addedCart'), t(lang, 'go'), STATIC.cart); }}>
        <Icon name="cart" />
      </a>
    );
  }
  if (part === 'fav') {
    return (
      <span className={`fav${on ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={on} aria-label={t(lang, 'favorites')}
        onClick={(e) => { e.stopPropagation(); const v = toggle('fav', item); toast(t(lang, v ? 'favOn' : 'favOff'), v ? t(lang, 'go') : undefined, STATIC.favorites); }}>
        <Icon name="heart" />
      </span>
    );
  }
  return (
    <button className="cmpb" type="button" aria-pressed={on}
      onClick={(e) => { e.stopPropagation(); const v = toggle('cmp', item); toast(t(lang, v ? 'cmpOn' : 'cmpOff'), v ? t(lang, 'go') : undefined, STATIC.compare); }}>
      <Icon name="cmp" /><span>{t(lang, 'compareBtn')}</span>
    </button>
  );
}
