'use client';
import { useEffect } from 'react';
import { href, t, STATIC, type Lang } from '@/lib/i18n';
import { syncStore, toast } from '@/lib/store';

/** Runs the cart / favourites / compare re-check once per page load (lib/store.ts syncStore) and tells the customer what changed. */
export function StoreSync({ lang }: { lang: Lang }) {
  useEffect(() => {
    syncStore((slug) => href(lang, `/product/${slug}`)).then((r) => {
      if (r.gone) toast(t(lang, 'goneItems', { n: r.gone }));
      else if (r.priced) toast(t(lang, 'priceChanged'), t(lang, 'go'), STATIC.cart);
    }).catch(() => {});
  }, [lang]);
  return null;
}
