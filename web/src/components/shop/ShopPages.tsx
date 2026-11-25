'use client';
/**
 * Cart, favourites and compare (plan step 7). They read the browser's store (lib/store.ts: localStorage led-cart / led-fav /
 * led-cmp, items "p<Access code>"); StoreSync in the layout has already re-checked prices and stock on this page load.
 * Markup and classes = the templates' shop pages (Design/site-src/shop_pages.html → styles/shop.css), minus the demo
 * parts: no invented delivery fees, promo codes, instalment maths or "best LED score". 1-click and checkout come with
 * real orders (step 10); until then checkout opens the static checkout page and "order by phone" dials the store.
 */
import { useEffect, useState } from 'react';
import { href, money, pick, specValue, STATIC, t, type Lang, type TKey } from '@/lib/i18n';
import { add, codeOf, get, set, toast, toggle, type StoreItem, type StoreKey } from '@/lib/store';
import { Icon } from '../Icon';

const PHONE = '+37410502802';

/** Live copy of one store list (re-renders on changes from this tab and other tabs). */
function useStore(k: StoreKey) {
  const [v, setV] = useState<StoreItem[] | null>(null);
  useEffect(() => {
    const r = () => setV(get(k).filter((x) => codeOf(x.id) !== null));
    r(); addEventListener('led:store', r); addEventListener('storage', r);
    return () => { removeEventListener('led:store', r); removeEventListener('storage', r); };
  }, [k]);
  return v;
}
const ids = (k: StoreKey, list: StoreItem[] | null) => new Set((list ?? []).map((x) => x.id));
const img = (x: StoreItem) => x.img || '/img/placeholder/default.svg';
const url = (lang: Lang, x: StoreItem) => x.url || href(lang, '/catalog');

function Head({ lang, icon, title, sub, tools }: { lang: Lang; icon: string; title: string; sub?: string; tools?: React.ReactNode }) {
  return (
    <>
      <nav className="crumbs" aria-label="breadcrumb"><a href={href(lang, '/')}>{t(lang, 'home')}</a><span>/</span><b>{title}</b></nav>
      <div className="sp-head">
        <div><h1><span className="ic"><Icon name={icon} /></span>{title}</h1>{sub ? <p>{sub}</p> : null}</div>
        <div className="sp-tools">{tools}</div>
      </div>
    </>
  );
}
function Empty({ lang, icon, h, p }: { lang: Lang; icon: string; h: TKey; p: TKey }) {
  return (
    <div className="sp-card sp-empty">
      <div className="art"><Icon name={icon} /></div><h2>{t(lang, h)}</h2><p>{t(lang, p)}</p>
      <a className="sp-b p" href={href(lang, '/catalog')}>{t(lang, 'toCat')}</a>
    </div>
  );
}
/** Remove with "Undo" in the toast (puts the item back at the same place). */
function removeWithUndo(lang: Lang, k: StoreKey, id: string) {
  const was = get(k);
  set(k, was.filter((x) => x.id !== id));
  toast(t(lang, 'removed'), t(lang, 'undo'), () => set(k, was));
}

// ---------------------------------------------------------------- cart

type Ship = 'pick' | 'cour' | 'reg';
export function CartPage({ lang }: { lang: Lang }) {
  const v = useStore('cart');
  const fav = ids('fav', useStore('fav'));
  const [ship, setShip] = useState<Ship>('pick');
  if (!v) return <Head lang={lang} icon="cart" title={t(lang, 'cartH')} />;
  if (!v.length) return <><Head lang={lang} icon="cart" title={t(lang, 'cartH')} /><Empty lang={lang} icon="cart" h="emptyCart" p="emptyCartP" /></>;
  const n = v.reduce((s, x) => s + (x.q || 1), 0);
  const goods = v.reduce((s, x) => s + x.p * (x.q || 1), 0);
  const qty = (id: string, d: number) => {
    const all = get('cart');
    const x = all.find((y) => y.id === id);
    if (!x) return;
    x.q = Math.max(1, Math.min(99, (x.q || 1) + d));
    set('cart', all);
  };
  const go = () => {
    try { sessionStorage.setItem('led-co', JSON.stringify({ ...JSON.parse(sessionStorage.getItem('led-co') || '{}'), ship, promo: false })); } catch { /* */ }
    location.href = lang === 'hy' ? STATIC.checkout : `${STATIC.checkout}?lang=${lang}`;
  };
  return (
    <>
      <Head lang={lang} icon="cart" title={t(lang, 'cartH')} sub={`${t(lang, 'itemsN', { n })} · ${money(goods)}`}
        tools={<div className="sp-steps"><span className="on"><i>1</i>{t(lang, 'cartH')}</span><b /><span><i>2</i>{t(lang, 'step2')}</span><b /><span><i>3</i>{t(lang, 'step3')}</span></div>} />
      <div className="sp-cart">
        <div>
          <div className="sp-card sp-list">
            {v.map((x) => (
              <div className="sp-row" key={x.id}>
                <a className="im" href={url(lang, x)}><img src={img(x)} alt="" /></a>
                <div>
                  <span className="sp-ok">● {t(lang, 'inStockLong')}</span>
                  <h4><a href={url(lang, x)}>{x.t}</a></h4>
                  {x.spec ? <div className="sp">{x.spec}</div> : null}
                  <div className="mt">
                    <button className="tf" onClick={() => { if (!fav.has(x.id)) toggle('fav', x); }}>
                      <Icon name="heart" />{t(lang, fav.has(x.id) ? 'inFav' : 'toFav')}
                    </button>
                  </div>
                </div>
                <div className="sp-ctl">
                  <button className="rm sp-del" title={t(lang, 'del')} aria-label={t(lang, 'del')} onClick={() => removeWithUndo(lang, 'cart', x.id)}><Icon name="sp-trash" /></button>
                  <div className="sp-qty">
                    <button aria-label="−" onClick={() => qty(x.id, -1)}>−</button><span>{x.q || 1}</span><button aria-label="+" onClick={() => qty(x.id, 1)}>+</button>
                  </div>
                </div>
                <div className="sp-sum"><b>{money(x.p * (x.q || 1))}</b>{(x.q || 1) > 1 ? <small>{money(x.p)} {t(lang, 'each')}</small> : null}</div>
              </div>
            ))}
          </div>
          <div className="sp-card sp-dl">
            <h3>{t(lang, 'dl')}</h3>
            <div className="sp-opts">
              {([['pick', 'sp-store', 'shipPick', 'shipPickS'], ['cour', 'sp-truck', 'shipCour', 'shipCourS'], ['reg', 'sp-map', 'shipReg', 'shipRegS']] as [Ship, string, TKey, TKey][]).map(([k, ic, h, s]) => (
                <label key={k} className={`sp-opt${ship === k ? ' on' : ''}`}>
                  <input type="radio" name="ship" value={k} checked={ship === k} onChange={() => setShip(k)} />
                  <Icon name={ic} /><span><b>{t(lang, h)}</b><small>{t(lang, s)}</small></span>
                </label>
              ))}
            </div>
            {ship !== 'pick' ? <p className="sp-note">{t(lang, 'shipNote')}</p> : null}
          </div>
        </div>
        <aside className="sp-card sp-side">
          <h3>{t(lang, 'sumH')}</h3>
          <div className="sp-ln"><span>{t(lang, 'goodsN', { n })}</span><b>{money(goods)}</b></div>
          <div className="sp-ln"><span>{t(lang, 'shipH')}</span><b>{ship === 'pick' ? t(lang, 'free') : t(lang, 'byManager')}</b></div>
          <div className="sp-tot"><span>{t(lang, 'total')}</span><b>{money(goods)}</b></div>
          <button className="sp-b p big" onClick={go}>{t(lang, 'checkout')}</button>
          <a className="sp-b big" href={`tel:${PHONE}`}>{t(lang, 'callOrder')}</a>
          <div className="sp-safe"><Icon name="sp-shield" />{t(lang, 'safe')}</div>
          <div className="sp-pay"><span>ArCa</span><span>VISA</span><span>Mastercard</span><span>Idram</span></div>
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- favourites

export function FavPage({ lang }: { lang: Lang }) {
  const v0 = useStore('fav');
  const cart = ids('cart', useStore('cart'));
  const cmp = ids('cmp', useStore('cmp'));
  const [sort, setSort] = useState(0);
  if (!v0) return <Head lang={lang} icon="heart" title={t(lang, 'favH')} />;
  if (!v0.length) return <><Head lang={lang} icon="heart" title={t(lang, 'favH')} /><Empty lang={lang} icon="heart" h="emptyFav" p="emptyFavP" /></>;
  const v = [...v0].reverse();
  if (sort === 1) v.sort((a, b) => a.p - b.p);
  if (sort === 2) v.sort((a, b) => b.p - a.p);
  const sum = v.reduce((s, x) => s + x.p, 0);
  const allToCart = () => { for (const x of get('fav')) if (!cart.has(x.id)) add('cart', x); toast(t(lang, 'addedAll'), t(lang, 'cartH'), href(lang, '/cart')); };
  return (
    <>
      <Head lang={lang} icon="heart" title={t(lang, 'favH')} sub={`${t(lang, 'itemsN', { n: v.length })} · ${t(lang, 'favTotal', { sum: money(sum) })}`}
        tools={<>
          <div className="sp-seg">{(['sAdded', 'sCheap', 'sExp'] as TKey[]).map((k, i) => <button key={k} className={i === sort ? 'on' : undefined} onClick={() => setSort(i)}>{t(lang, k)}</button>)}</div>
          <button className="sp-b p" onClick={allToCart}><Icon name="cart" />{t(lang, 'allCart')}</button>
        </>} />
      <div className="sp-fgrid">
        {v.map((x, i) => (
          <div className="sp-card sp-f" key={x.id} style={{ animationDelay: `${i * 45}ms` }}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) { if (e.ctrlKey || e.metaKey) open(url(lang, x), '_blank'); else location.href = url(lang, x); } }}>
            <button className="ht" aria-label={t(lang, 'del')} onClick={() => removeWithUndo(lang, 'fav', x.id)}><Icon name="heart" /></button>
            <button className={`cb${cmp.has(x.id) ? ' on' : ''}`} aria-label={t(lang, 'compareBtn')} onClick={() => toggle('cmp', x)}><Icon name="cmp" /></button>
            <div className="im"><img src={img(x)} alt="" /></div>
            <span className="sp-ok">● {t(lang, 'inStockLong')}</span>
            <h4>{x.t}</h4>
            {x.spec ? <div className="sp">{x.spec}</div> : null}
            <div className="pr">
              <div><b>{money(x.p)}</b></div>
              <button className={`add${cart.has(x.id) ? ' in' : ''}`} aria-label={t(lang, 'cartH')} title={t(lang, cart.has(x.id) ? 'inCart' : 'cartH')}
                onClick={() => { if (cart.has(x.id)) location.href = href(lang, '/cart'); else { add('cart', x); toast(t(lang, 'addedCart'), t(lang, 'go'), href(lang, '/cart')); } }}>
                <Icon name={cart.has(x.id) ? 'sp-check' : 'cart'} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- compare

type Full = { code: number; specs?: { k: string; v: string; names: string[]; group?: string }[] };
const GROUP_ORDER = ['main', 'cpu', 'display', 'memory', 'graphics', 'ports', 'power', 'body'];
const GROUP_KEY: Record<string, TKey> = { main: 'gMain', cpu: 'gCpu', display: 'gDisplay', memory: 'gMemory', graphics: 'gGraphics', ports: 'gPorts', power: 'gPower', body: 'gBody' };

export function ComparePage({ lang }: { lang: Lang }) {
  const v = useStore('cmp');
  const cart = ids('cart', useStore('cart'));
  const [only, setOnly] = useState(false);
  const [full, setFull] = useState<Map<number, Full>>(new Map());
  const codes = (v ?? []).map((x) => codeOf(x.id)!).join(',');
  useEffect(() => {
    if (!codes) return;
    fetch(`/api/shop/products/by-ids?codes=${codes}&full=1`).then((r) => (r.ok ? r.json() : null))
      .then((j: { items: Full[] } | null) => { if (j) setFull(new Map(j.items.map((x) => [x.code, x]))); }).catch(() => {});
  }, [codes]);
  if (!v) return <Head lang={lang} icon="cmp" title={t(lang, 'cmpH')} />;
  if (!v.length) return <><Head lang={lang} icon="cmp" title={t(lang, 'cmpH')} /><Empty lang={lang} icon="cmp" h="emptyCmp" p="emptyCmpP" /></>;

  const slots = Math.max(v.length + (v.length < 4 ? 1 : 0), 3);
  const specOf = (x: StoreItem) => full.get(codeOf(x.id)!)?.specs ?? [];
  // rows: every spec key any of the products has, grouped like the product page
  const keys = new Map<string, { names: string[]; group: string }>();
  for (const x of v) for (const s of specOf(x)) if (!keys.has(s.k)) keys.set(s.k, { names: s.names, group: s.group || 'main' });
  const groups = GROUP_ORDER.map((g) => [g, [...keys].filter(([, d]) => d.group === g)] as const).filter(([, rows]) => rows.length);
  const minPrice = Math.min(...v.map((x) => x.p));
  const priceSame = v.every((x) => x.p === v[0].p);
  const clear = () => { const was = get('cmp'); set('cmp', []); toast(t(lang, 'cleared'), t(lang, 'undo'), () => set('cmp', was)); };
  const fill = (n: number) => Array.from({ length: n }, (_, i) => <td key={`f${i}`} />);

  return (
    <>
      <Head lang={lang} icon="cmp" title={t(lang, 'cmpH')} sub={t(lang, 'itemsN', { n: v.length })}
        tools={<>
          <label className="sp-sw"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /><i />{t(lang, 'onlyDiff')}</label>
          <button className="sp-b" onClick={clear}><Icon name="sp-trash" />{t(lang, 'clear')}</button>
        </>} />
      <div className="sp-card sp-cmpw">
        <table className={`sp-ct${only ? ' only' : ''}`}>
          <colgroup><col className="lab" />{Array.from({ length: slots }, (_, i) => <col key={i} />)}</colgroup>
          <thead>
            <tr>
              <th />
              {v.map((x, i) => (
                <td key={x.id}>
                  <div className="sp-pc" style={{ animationDelay: `${i * 60}ms` }}>
                    <button className="x" aria-label={t(lang, 'del')} onClick={() => removeWithUndo(lang, 'cmp', x.id)}>✕</button>
                    <a className="im" href={url(lang, x)}><img src={img(x)} alt="" /></a>
                    <h4><a href={url(lang, x)}>{x.t}</a></h4>
                    <div className="row">
                      <div><b>{money(x.p)}</b></div>
                      <button className={`add${cart.has(x.id) ? ' in' : ''}`} aria-label={t(lang, 'cartH')}
                        onClick={() => { if (cart.has(x.id)) location.href = href(lang, '/cart'); else { add('cart', x); toast(t(lang, 'addedCart'), t(lang, 'go'), href(lang, '/cart')); } }}>
                        <Icon name={cart.has(x.id) ? 'sp-check' : 'cart'} />
                      </button>
                    </div>
                  </div>
                </td>
              ))}
              {v.length < slots ? <td><a className="sp-slot" href={href(lang, '/catalog')}><div><span>+</span>{t(lang, 'addP')}</div></a></td> : null}
              {fill(Math.max(0, slots - v.length - 1))}
            </tr>
          </thead>
          <tbody>
            <tr className="sec"><th>{t(lang, 'gMain')}</th><td colSpan={slots} /></tr>
            <tr className={priceSame ? 'same' : 'diff'}>
              <th>{t(lang, 'priceH')}</th>
              {v.map((x) => <td key={x.id} className={!priceSame && x.p === minPrice ? 'best' : undefined}>{money(x.p)}</td>)}{fill(slots - v.length)}
            </tr>
            {groups.map(([g, rows]) => [
              g !== 'main' ? <tr key={`s${g}`} className="sec"><th>{t(lang, GROUP_KEY[g])}</th><td colSpan={slots} /></tr> : null,
              ...rows.map(([k, d]) => {
                const vals = v.map((x) => specOf(x).find((s) => s.k === k)?.v ?? null);
                const same = new Set(vals.map(String)).size <= 1;
                return (
                  <tr key={k} className={same ? 'same' : 'diff'}>
                    <th>{pick(d.names, lang)}</th>
                    {vals.map((val, i) => <td key={i}>{val === null ? '—' : specValue(lang, k, val)}</td>)}{fill(slots - v.length)}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      <div className="sp-leg"><span><b>★</b> — {t(lang, 'bestV')}</span><span>▮ {t(lang, 'diffL')}</span></div>
    </>
  );
}
