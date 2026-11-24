'use client';
/** Top bar: tagline, Instalments · About · Help ▾ · Contacts (static pages for now), phone list, language, currency. */
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LANGS, STATIC, t, type Lang } from '@/lib/i18n';
import { Icon } from './Icon';

const PHONES = [['010 502‑802', '+37410502802'], ['011 502‑802', '+37411502802'], ['099 502‑802', '+37499502802'], ['095 502‑802', '+37495502802']];
const HELP = [['buy', 'cart'], ['order', 'ix-box'], ['track', 'truck'], ['pay', 'ix-wallet'], ['delivery', 'truck'], ['warranty', 'shield'], ['exchange', 'ix-ref']] as const;

export function TopBar({ lang }: { lang: Lang }) {
  const [ph, setPh] = useState(false);
  const [help, setHelp] = useState(false);
  const phRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = (e: MouseEvent) => {
      if (!phRef.current?.contains(e.target as Node)) setPh(false);
      if (!helpRef.current?.contains(e.target as Node)) setHelp(false);
    };
    document.addEventListener('click', c);
    return () => document.removeEventListener('click', c);
  }, []);
  return (
    <div className="top"><div className="wrap">
      <span className="hide">{t(lang, 'store')}</span>
      <span className="sp" />
      <span style={{ display: 'contents' }}>
        <a className="tl cr" href={STATIC.credit}>{t(lang, 'credit')}</a>
        <a className="tl" href={STATIC.about}>{t(lang, 'about')}</a>
        <div className={`hlp${help ? ' open' : ''}`} ref={helpRef}>
          <a className="tl" tabIndex={0} role="button" aria-haspopup="true" aria-expanded={help} onClick={() => setHelp(!help)}>
            {t(lang, 'help')}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m6 9 6 6 6-6" /></svg>
          </a>
          <div className="hlp-m">
            {HELP.map(([k, ic]) => <a key={k} href={STATIC[k]}><Icon name={ic} /><span>{t(lang, k)}</span></a>)}
          </div>
        </div>
        <a className="tl" href={STATIC.contacts}>{t(lang, 'contacts')}</a>
      </span>
      <div className={`ph${ph ? ' open' : ''}`} ref={phRef} tabIndex={0} aria-haspopup="true" aria-expanded={ph}
        onClick={(e) => { if (!(e.target as Element).closest('a')) setPh(!ph); }}>
        <Icon name="call" style={{ width: 15, height: 15 }} />
        <span className="tick"><span className="track">{[...PHONES, PHONES[0]].map(([n], i) => <span key={i}>{n}</span>)}</span></span>
        <svg className="i chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
        <div className="ph-menu" role="menu">
          {PHONES.map(([n, tel]) => <a key={tel} href={`tel:${tel}`}><Icon name="call" /><b>{n}</b></a>)}
          <a href="https://wa.me/37499502802" target="_blank" rel="noopener" className="wa"><Icon name="wa" /><b>WhatsApp</b></a>
          <a href="viber://chat?number=%2B37499502802" className="vb"><Icon name="vb" /><b>Viber</b></a>
        </div>
      </div>
      <LangSwitch lang={lang} />
      <div className="pill"><span className="on">֏</span><span>$</span></div>
    </div></div>
  );
}

/** Same page in another language (/x → /ru/x → /en/x). Also saves `led-lang` so the static pages follow. */
function LangSwitch({ lang }: { lang: Lang }) {
  const path = usePathname() || '/';
  const qs = useSearchParams()?.toString();
  const bare = path.replace(/^\/(ru|en)(?=\/|$)/, '') || '/';
  const to = (l: Lang) => (l === 'hy' ? bare : `/${l}${bare === '/' ? '' : bare}`) + (qs ? `?${qs}` : '');
  const title = { hy: 'Հայերեն', ru: 'Русский', en: 'English' };
  return (
    <div className="pill lang" role="group" aria-label={t(lang, 'language')}>
      {LANGS.map((l) => (
        <a key={l} href={to(l)} hrefLang={l} title={title[l]} className={l === lang ? 'on' : undefined} data-lang={l}
          onClick={() => { try { localStorage.setItem('led-lang', l); } catch { /* private mode */ } }}>
          {l === 'hy' ? 'AM' : l.toUpperCase()}
        </a>
      ))}
    </div>
  );
}
