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
function set(k: StoreKey, v: StoreItem[]) {
  try { localStorage.setItem(K[k], JSON.stringify(v)); } catch { /* private mode */ }
  dispatchEvent(new Event('led:store'));
}
export const has = (k: StoreKey, id: string) => get(k).some((x) => x.id === id);
export function add(k: StoreKey, item: StoreItem) {
  const v = get(k), i = v.findIndex((x) => x.id === item.id);
  if (i >= 0) { if (k !== 'cart') return; v[i].q = (v[i].q || 1) + 1; } else v.push(k === 'cart' ? { q: 1, ...item } : item);
  if (k === 'cmp' && v.length > 4) v.shift();
  set(k, v);
}
export function toggle(k: StoreKey, item: StoreItem) {
  if (has(k, item.id)) { set(k, get(k).filter((x) => x.id !== item.id)); return false; }
  add(k, item); return true;
}

/** The templates' bottom toast (.sp-toast in site.css) with an optional button. */
let el: HTMLDivElement | null = null, timer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, btn?: string, go?: string) {
  if (!el) { el = document.createElement('div'); el.className = 'sp-toast'; document.body.appendChild(el); }
  el.textContent = '';
  const s = document.createElement('span'); s.textContent = msg; el.appendChild(s);
  if (btn && go) { const b = document.createElement('button'); b.textContent = btn; b.onclick = () => { location.href = go; }; el.appendChild(b); }
  const e = el;
  requestAnimationFrame(() => e.classList.add('on'));
  clearTimeout(timer); timer = setTimeout(() => e.classList.remove('on'), 4200);
}
