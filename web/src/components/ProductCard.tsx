import type { ProductCard as P } from '@/lib/api';
import { href, money, t, type Lang } from '@/lib/i18n';
import { Icon } from './Icon';
import { CardButtons } from './CardButtons';

/** "Ноутбук Dell XPS 13 … (3K IPS Touch, Core 5 320, 8GB, 512GB SSD)" → title + "3K IPS Touch · Core 5 320 · 8GB · 512GB SSD". */
export function splitName(name: string) {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name);
  return m ? { title: m[1], spec: m[2].split(/\s*,\s*/).join(' · ') } : { title: name, spec: '' };
}

/** Product card — same markup as the templates' .prod (site.css), server-rendered; the buttons are a small client part. */
export function ProductCard({ p, lang }: { p: P; lang: Lang }) {
  const url = href(lang, `/product/${p.slug}`);
  const { title, spec } = splitName(p.name);
  const img = p.image || `/img/placeholder/${p.section || 'default'}.svg`;
  return (
    <div className="prod" data-href={url}>
      <div className="img"><a href={url} tabIndex={-1} aria-hidden="true"><img src={img} className={p.image ? 'cover' : 'cover ph'} alt={title} loading="lazy" /></a></div>
      <span className={`stock${p.stock.state === 'low' ? ' low' : ''}`}>
        {p.stock.state === 'low' ? t(lang, 'lastN', { n: p.stock.qty }) : t(lang, 'inStockLong')}
      </span>
      <h4><a href={url}>{title}</a></h4>
      {spec ? <div className="spec">{spec}</div> : p.brand ? <div className="spec">{p.brand}</div> : null}
      <div className="pr">
        <div><b>{money(p.price)}</b></div>
        <CardButtons lang={lang} item={{ id: `p${p.code}`, code: p.code, t: p.name, img, spec, p: p.price, url }} part="cart" />
      </div>
      <div className="more-info">
        <div className="mi-act">
          <CardButtons lang={lang} item={{ id: `p${p.code}`, code: p.code, t: p.name, img, spec, p: p.price, url }} part="cmp" />
          <a href={url} className="det"><span>{t(lang, 'details')}</span><Icon name="arrow" /></a>
        </div>
      </div>
      <CardButtons lang={lang} item={{ id: `p${p.code}`, code: p.code, t: p.name, img, spec, p: p.price, url }} part="fav" />
    </div>
  );
}
