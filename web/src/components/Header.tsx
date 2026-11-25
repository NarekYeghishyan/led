'use client';
/**
 * Header: logo, "Catalog" button + popup (mega menu), search, account/compare/favourites/cart, top menu (6 sections).
 * Same markup and classes as the templates (Design/site/category.html), so site.css styles it. Rendered on the server
 * too, so every catalog link is in the HTML. Behaviour ported from the template scripts:
 * - catalog button: click toggles; hover opens after 120 ms; a hover-opened popup closes 250 ms after the mouse leaves
 *   the top menu / button / visible panel (.mega-in)
 * - hovering a top-menu tile opens the popup on that section; the tile of the shown section is active
 * - popup section buttons: hover/focus shows the section, a mouse click opens it; on touch a tap only switches
 * - Esc, ✕ and the backdrop close it; on phones it is full screen and the page does not scroll (body.mega-open)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatNode, ProductCard } from '@/lib/api';
import { href, money, pick, STATIC, t, type Lang } from '@/lib/i18n';
import { SearchBox } from './SearchBox';
import { Icon } from './Icon';

export interface MegaExtras { [section: string]: { hot: ProductCard[]; brands: string[] } }

export function Header({ lang, cats, extras }: { lang: Lang; cats: CatNode[]; extras: MegaExtras }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const hovered = useRef(false); // opened by hover (closes when the mouse leaves) vs by click (stays)
  const openT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const megaIn = useRef<HTMLDivElement>(null);

  const show = useCallback((v: boolean) => { setOpen(v); if (!v) hovered.current = false; }, []);

  // Esc closes; phones: lock page scroll while the full-screen popup is open
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') show(false); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [show]);
  useEffect(() => {
    const mq = matchMedia('(max-width:760px)');
    document.body.classList.toggle('mega-open', open && mq.matches);
    return () => document.body.classList.remove('mega-open');
  }, [open]);

  // hover-opened popup: close 250 ms after the mouse is outside the menu row, the button and the visible panel
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!hovered.current) return;
      const el = e.target as Element | null;
      if (el?.closest?.('.mega-in,nav.cats,#catBtn')) { clearTimeout(closeT.current); closeT.current = undefined; return; }
      if (closeT.current) return;
      closeT.current = setTimeout(() => { closeT.current = undefined; if (hovered.current) { clearTimeout(openT.current); show(false); } }, 250);
    };
    document.addEventListener('mousemove', move);
    return () => document.removeEventListener('mousemove', move);
  }, [show]);

  // --mtop: the popup fits the screen (only the group list scrolls) — the template's "mega-fit" script
  useEffect(() => {
    if (!open) return;
    const u = () => { const r = megaIn.current; if (r) document.documentElement.style.setProperty('--mtop', `${Math.max(0, r.getBoundingClientRect().top)}px`); };
    u();
    const f = () => requestAnimationFrame(u);
    addEventListener('scroll', f, { passive: true });
    addEventListener('resize', f);
    return () => { removeEventListener('scroll', f); removeEventListener('resize', f); };
  }, [open]);

  const hoverOpen = (i?: number) => {
    clearTimeout(openT.current);
    openT.current = setTimeout(() => {
      if (!open) { hovered.current = true; setOpen(true); }
      if (i !== undefined) setCur(i);
    }, 120);
  };

  const sec = cats[cur] ?? cats[0];
  const secPath = (s: CatNode) => href(lang, `/${s.s}`);
  const ex = sec ? extras[sec.s] : undefined;
  const promo = sec ? pick(sec.p ?? sec.n, lang) : '';

  return (
    <header className="h">
      <div className="wrap">
        <div className="row">
          <a className="logo" href="/"><img src="/img/logo.png" alt="LED Computers" width={94} height={48} /></a>
          <a className="catbtn" href={href(lang, '/catalog')} id="catBtn" aria-expanded={open} aria-controls="mega"
            onClick={(e) => { e.preventDefault(); clearTimeout(openT.current); if (hovered.current) { hovered.current = false; return; } show(!open); }}
            onMouseEnter={() => hoverOpen()} onMouseLeave={() => { if (!hovered.current) clearTimeout(openT.current); }}>
            <span className="bars" aria-hidden="true"><i /><i /><i /></span><span>{t(lang, 'catalog')}</span>
          </a>
          <SearchBox lang={lang} />
          <Acts lang={lang} />
        </div>
        <nav className="cats" style={{ ['--cats' as string]: Math.min(cats.length, 8) }}
          onMouseLeave={() => clearTimeout(openT.current)}>
          {cats.map((c, i) => (
            <a key={c.s} href={secPath(c)} data-m={i} aria-label={pick(c.n, lang)} className={open && i === cur ? 'act' : undefined}
              onMouseEnter={() => hoverOpen(i)}>
              <Icon name={c.i || 'pc'} /><span>{pick(c.n, lang)}</span>
            </a>
          ))}
        </nav>
      </div>

      <div className="mega" id="mega" hidden={!open}>
        <div className="wrap mega-in" ref={megaIn}>
          <div className="mega-l" role="tablist">
            {cats.map((c, i) => (
              <button key={c.s} role="tab" aria-selected={i === cur} className={i === cur ? 'on' : undefined}
                onMouseEnter={() => setCur(i)} onFocus={() => setCur(i)}
                onClick={() => { if (matchMedia('(hover:hover)').matches) location.href = secPath(c); else setCur(i); }}>
                <span className="mi"><Icon name={c.i || 'pc'} /></span>{pick(c.n, lang)}
              </button>
            ))}
          </div>
          {sec && (
            <div className="mega-r">
              <div className="mega-h">
                <div><small id="megaCount">{(sec.c?.length ?? 0)} {t(lang, 'subcats')}</small><h3 id="megaTitle">{pick(sec.n, lang)}</h3></div>
                <a href={secPath(sec)} id="megaAll">{t(lang, 'allProducts')}</a>
                <button className="mx" id="megaX" aria-label={t(lang, 'close')} onClick={() => show(false)}>✕</button>
              </div>
              <div className="mega-g" id="megaGrid" key={sec.s}>
                {(sec.c ?? []).map((g, k) => (
                  <a key={g.s} href={href(lang, `/${sec.s}/${g.s}`)} style={{ animationDelay: `${k * 25}ms` }}><i />{pick(g.n, lang)}</a>
                ))}
              </div>
              <div className="mega-x">
                <div className="mega-hot">
                  <small id="megaHotT">{t(lang, 'popular')}</small>
                  <div id="megaHot">
                    {(ex?.hot ?? []).map((p, k) => (
                      <a key={p.code} className="mh" href={href(lang, `/product/${p.slug}`)} style={{ animationDelay: `${k * 50}ms` }}>
                        <div className="im">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <Icon name={sec.i || 'pc'} />}</div>
                        <span>{p.name}</span><b>{money(p.price)}</b>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-br">
                  <small id="megaBrT">{t(lang, 'brands')}</small>
                  <div id="megaBr">
                    {(ex?.brands ?? []).map((b) => (
                      <a key={b} href={`${href(lang, `/${sec.s}`)}?brand=${encodeURIComponent(b)}`} title={b} className="mbr">{b}</a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {sec && (
            <div className="mega-p" id="megaPromo">
              <div className="big"><Icon name={sec.i || 'pc'} /></div>
              <small>{t(lang, 'offer')}</small><b>{promo}</b>
              <a href={secPath(sec)}>{t(lang, 'view')} →</a>
            </div>
          )}
        </div>
      </div>
      <div className="mega-bg" id="megaBg" hidden={!open} onClick={() => show(false)} />
    </header>
  );
}

/** Account / compare / favourites / cart with live counts from the shared localStorage store (same keys as the templates). */
function Acts({ lang }: { lang: Lang }) {
  const [n, setN] = useState({ cart: 0, fav: 0, cmp: 0, user: false });
  useEffect(() => {
    const read = () => {
      const arr = (k: string) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
      setN({
        cart: arr('led-cart').reduce((s: number, x: { q?: number }) => s + (x.q || 1), 0),
        fav: arr('led-fav').length, cmp: arr('led-cmp').length, user: !!localStorage.getItem('led-user'),
      });
    };
    read();
    addEventListener('storage', read);
    addEventListener('led:store', read);
    return () => { removeEventListener('storage', read); removeEventListener('led:store', read); };
  }, []);
  const A = ({ to, icon, label, count }: { to: string; icon: string; label: string; count?: number }) => (
    <a className="act" href={to} data-lk="1"><Icon name={icon} /><span>{label}</span>{count ? <em>{count}</em> : null}</a>
  );
  return (
    <div className="acts">
      <A to={n.user ? STATIC.account : STATIC.login} icon="user" label={t(lang, 'account')} />
      <A to={href(lang, '/compare')} icon="cmp" label={t(lang, 'compare')} count={n.cmp} />
      <A to={href(lang, '/favorites')} icon="heart" label={t(lang, 'favorites')} count={n.fav} />
      <A to={href(lang, '/cart')} icon="cart" label={t(lang, 'cart')} count={n.cart} />
    </div>
  );
}
