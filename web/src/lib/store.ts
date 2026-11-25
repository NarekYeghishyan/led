'use client';
/**
 * Cart / favourites / compare in localStorage — same keys and item shape as the static templates (shop_shared.html:
 * { id, t, img, spec, p, q? }), so the static cart.html / favorites.html / compare.html pages show what was added here.
 * Real ids: "p<Access code>". Step 6 moves this to real product ids + price/stock re-check from the API.
 */
export type StoreKey = 'cart' | 'fav' | 'cmp';
export interface StoreItem { id: string; t: string; img?: string; spec?: string; p: number; q?: number; code?: number; url?: string }
const K: Record<StoreKey, string> = { cart: 'led-cart', fav: 'led-fav', cmp: 'led-cmp' };

export function get(k: StoreKey): StoreItem[] {
  try { const v = JSON.parse(localStorage.getItem(K[k]) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function set(k: StoreKey, v: StoreItem[]) {
  try { localStorage.setItem(K[k], JSON.stringify(v)); } catch { /* private mode */ }
  dispatchEvent(new Event('led:store'));
}
export const has = (k: StoreKey, id: string) => get(k).some((x) => x.id === id);
export function add(k: StoreKey, item: StoreItem, n = 1) {
  const v = get(k), i = v.findIndex((x) => x.id === item.id);
  if (i >= 0) { if (k !== 'cart') return; v[i].q = (v[i].q || 1) + n; } else v.push(k === 'cart' ? { ...item, q: n } : item);
  if (k === 'cmp' && v.length > 4) v.shift();
  set(k, v);
}
export function toggle(k: StoreKey, item: StoreItem) {
  const on = !has(k, item.id);
  if (on) add(k, item); else set(k, get(k).filter((x) => x.id !== item.id));
  if (k === 'fav' && item.code) saveWish(on ? { add: [item.code] } : { remove: [item.code] });
  return on;
}

/** Real site items have ids "p<Access code>"; anything else is template demo data. */
export const codeOf = (id: string) => (/^p\d+$/.test(id) ? Number(id.slice(1)) : null);

// ---------------------------------------------------------------- account wishlist (logged-in customers)

let loggedIn = false;
/** Send a favourites change to the account (only when the last sync found a session). */
export function saveWish(body: { add?: number[]; remove?: number[] }) {
  if (!loggedIn) return;
  fetch('/api/shop/me/wishlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
    .catch(() => {});
}

type Card = { code: number; slug: string; name: string; price: number; image: string | null; section: string | null };

/**
 * Once per page load: re-check cart / favourites / compare against the API (current price, name, photo; sold-out or hidden
 * products removed) and merge favourites with the account when logged in (both directions). Returns what changed.
 */
export async function syncStore(url: (slug: string) => string) {
  let server: number[] | null = null;
  try {
    const r = await fetch('/api/shop/me/wishlist', { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) { server = ((await r.json()) as { codes: number[] }).codes; loggedIn = true; }
  } catch { /* offline */ }

  const lists = { cart: get('cart'), fav: get('fav'), cmp: get('cmp') };
  const local = new Set<number>();
  for (const k of ['cart', 'fav', 'cmp'] as StoreKey[]) {
    lists[k] = lists[k].filter((x) => codeOf(x.id) !== null); // drop template demo items
    lists[k].forEach((x) => local.add(codeOf(x.id)!));
  }
  const favLocal = new Set(lists.fav.map((x) => codeOf(x.id)!));
  const fromServer = (server || []).filter((c) => !favLocal.has(c));
  const codes = [...new Set([...local, ...fromServer])].slice(0, 100);

  const res = { gone: 0, priced: 0 };
  let cards = new Map<number, Card>(), gone = new Set<number>();
  if (codes.length) {
    try {
      const r = await fetch(`/api/shop/products/by-ids?codes=${codes.join(',')}`, { cache: 'no-store' });
      if (!r.ok) return res;
      const j = (await r.json()) as { items: Card[]; gone: number[] };
      cards = new Map(j.items.map((c) => [c.code, c]));
      gone = new Set(j.gone);
    } catch { return res; }
  }
  const fresh = (x: StoreItem): StoreItem => {
    const c = cards.get(codeOf(x.id)!);
    if (!c) return x;
    return { ...x, code: c.code, t: c.name, p: c.price, url: url(c.slug), img: c.image || x.img || `/img/placeholder/${c.section || 'default'}.svg` };
  };
  for (const k of ['cart', 'fav', 'cmp'] as StoreKey[]) {
    const before = lists[k];
    const after = before.filter((x) => !gone.has(codeOf(x.id)!)).map(fresh);
    if (k !== 'cmp') res.gone += before.length - after.length;
    if (k === 'cart') {
      const old = new Map(before.map((x) => [x.id, x.p]));
      res.priced = after.filter((x) => old.get(x.id) !== x.p).length;
    }
    lists[k] = after;
  }
  // favourites only on the account → add here; only here → send to the account
  for (const c of fromServer) {
    const card = cards.get(c);
    if (card) lists.fav.push(fresh({ id: `p${c}`, code: c, t: card.name, p: card.price }));
  }
  if (loggedIn) {
    const up = lists.fav.map((x) => codeOf(x.id)!).filter((c) => !(server || []).includes(c));
    const down = (server || []).filter((c) => gone.has(c));
    if (up.length || down.length) saveWish({ add: up, remove: down });
  }
  for (const k of ['cart', 'fav', 'cmp'] as StoreKey[]) {
    try { localStorage.setItem(K[k], JSON.stringify(lists[k])); } catch { /* private mode */ }
  }
  dispatchEvent(new Event('led:store'));
  return res;
}

/** The templates' bottom toast (.sp-toast in site.css) with an optional button. */
let el: HTMLDivElement | null = null, timer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, btn?: string, go?: string | (() => void)) {
  if (!el) { el = document.createElement('div'); el.className = 'sp-toast'; document.body.appendChild(el); }
  el.textContent = '';
  const s = document.createElement('span'); s.textContent = msg; el.appendChild(s);
  if (btn && go) { const b = document.createElement('button'); b.textContent = btn; b.onclick = () => { if (typeof go === 'function') { go(); el?.classList.remove('on'); } else location.href = go; }; el.appendChild(b); }
  const e = el;
  requestAnimationFrame(() => e.classList.add('on'));
  clearTimeout(timer); timer = setTimeout(() => e.classList.remove('on'), 4200);
}
