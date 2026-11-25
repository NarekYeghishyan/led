import type { ProductCard as P } from '@/lib/api';
import { href, money, t, type Lang, type TKey } from '@/lib/i18n';
import { Icon } from './Icon';
import { CardButtons } from './CardButtons';

/** "Ноутбук Dell XPS 13 … (3K IPS Touch, Core 5 320, 8GB, 512GB SSD)" → title + "3K IPS Touch · Core 5 320 · 8GB · 512GB SSD". */
export function splitName(name: string) {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name);
  return m ? { title: m[1], spec: m[2].split(/\s*,\s*/).join(' · ') } : { title: name, spec: '' };
}

/** Label for one spec part of the name ("15.6\" FHD IPS" → screen, "Core i5 13420H" → CPU…); order = first match. */
const KIND: [TKey, RegExp][] = [
  ['spGpu', /b(rtx|gtx|radeon|geforce|arc|graphics|\d+gb\s*(rtx|gtx|gddr))/i],
  ['spCpu', /b(core|ryzen|celeron|pentium|athlon|xeon|snapdragon|apple m\d|i[3579][-\s]?\d{3,5})/i],
  ['spScreen', /(\d{2}(\.\d)?\s*("|″|inch|')|b(fhd|uhd|qhd|wuxga|oled|ips|\d+k|\d{2,3}\s?hz|touch|retina)b)/i],
  ['spDisk', /b(ssd|hdd|nvme|emmc|\d+\s?tb)b/i],
  ['spRam', /b\d{1,3}\s?gbb(?!.*ssd)|bddr\d/i],
  ['spOs', /b(win(dows)?\s?\d*|dos|linux|chrome\s?os|macos|no os|free dos)b/i],
  ['spSocket', /b(s-?am\d|s-?\d{3,4}|lga\s?\d{3,4}|socket)b/i],
];
export function specRows(spec: string) {
  const used = new Set<TKey>();
  return spec.split(' · ').filter(Boolean).map((v) => {
    const k = (KIND.find(([key, re]) => !used.has(key) && re.test(v))?.[0]) ?? 'spOther';
    if (k !== 'spOther') used.add(k);
    return { k, v };
  });
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
        <dl>
          {p.brand ? <div><dt>{t(lang, 'spBrand')}</dt><dd>{p.brand}</dd></div> : null}
          {specRows(spec).slice(0, 5).map((r, i) => <div key={i}><dt>{t(lang, r.k)}</dt><dd>{r.v}</dd></div>)}
          <div><dt>{t(lang, 'spCode')}</dt><dd>{p.code}</dd></div>
        </dl>
        <div className="mi-act">
          <CardButtons lang={lang} item={{ id: `p${p.code}`, code: p.code, t: p.name, img, spec, p: p.price, url }} part="cmp" />
          <a href={url} className="det"><span>{t(lang, 'details')}</span><Icon name="arrow" /></a>
        </div>
      </div>
      <CardButtons lang={lang} item={{ id: `p${p.code}`, code: p.code, t: p.name, img, spec, p: p.price, url }} part="fav" />
    </div>
  );
}
