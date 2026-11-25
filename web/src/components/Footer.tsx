import type { CatNode } from '@/lib/api';
import { href, pick, t, type Lang } from '@/lib/i18n';
import { Icon } from './Icon';
import { pageUrl } from '@/lib/pages';
import { FooterFx } from './Effects';

export function Footer({ lang, cats }: { lang: Lang; cats: CatNode[] }) {
  const help = [['order', pageUrl(lang, 'order')], ['deliveryPay', pageUrl(lang, 'delivery')], ['credit', pageUrl(lang, 'credit')], ['warrantyRet', pageUrl(lang, 'warranty')],
    ['contacts', pageUrl(lang, 'contacts')]] as const;
  return (
    <footer>
      <FooterFx />
      <div className="wrap">
        <div className="news">
          <h4>{t(lang, 'news')}</h4>
          <form action="#" method="get">
            <input type="email" placeholder={t(lang, 'email')} aria-label={t(lang, 'email')} />
            <button type="button" className="btn p" style={{ border: 0, font: 'inherit', fontWeight: 600 }}>{t(lang, 'subscribe')}</button>
          </form>
        </div>
        <div className="fgrid">
          <div>
            <a className="logo" href="/"><img src="/img/logo.png" alt="LED Computers" width={94} height={48} /></a>
            <p>{t(lang, 'tagline')}</p>
            <div className="soc"><span>f</span><span>ig</span><span>tg</span><span>wa</span><span>vb</span></div>
          </div>
          <div><h5>{t(lang, 'catalog')}</h5><ul>
            {cats.map((c) => <li key={c.s}><a href={href(lang, `/${c.s}`)} style={{ color: 'inherit', textDecoration: 'none' }}>{pick(c.n, lang)}</a></li>)}
          </ul></div>
          <div><h5>{t(lang, 'customers')}</h5><ul>
            {help.map(([k, to]) => <li key={k}><a href={to} style={{ color: 'inherit', textDecoration: 'none' }}>{t(lang, k)}</a></li>)}
          </ul></div>
          <div><h5>{t(lang, 'contactsH')}</h5><ul>
            <li className="ci"><Icon name="pin" /><span>{t(lang, 'address')}</span></li>
            <li className="ci" style={{ color: '#fff', fontWeight: 600 }}><Icon name="call" /><span>010 502‑802 · 099 502‑802</span></li>
            <li className="ci"><Icon name="mail" /><span>led@led.am</span></li>
            <li className="ci"><Icon name="clock" /><span>{t(lang, 'hours')}</span></li>
          </ul></div>
        </div>
        <div className="legal"><span>{t(lang, 'legal')}</span><div className="pay"><span>ArCa</span><span>VISA</span><span>Mastercard</span><span>Idram</span></div></div>
      </div>
    </footer>
  );
}
