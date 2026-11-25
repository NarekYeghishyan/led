/**
 * Product page: /product/<slug>-<code> (+ /ru, /en). Data: GET /api/shop/products/<slug> (in-stock only, ֏ price).
 * - Wrong/old slug with a valid code → 301 to the canonical slug; unknown or sold out → /api/shop/resolve (its category) or 404.
 * - SEO: canonical, hreflang, Product + BreadcrumbList JSON-LD. Layout and classes = Design/site/product.html (styles/product.css).
 * - No fake data: no reviews, ratings, options or bundles until the store has them (docs/PROJECT_PLAN.md section 11).
 */
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { getProduct, NotFound, resolvePath } from '@/lib/api';
import { href, money, pick, specValue, t, type Lang, type TKey } from '@/lib/i18n';
import { ProductCard, splitName } from '@/components/ProductCard';
import { Gallery } from '@/components/product/Gallery';
import { BuyActions } from '@/components/product/BuyBox';
import { Icon } from '@/components/Icon';
import '@/styles/product.css';

type P = { params: Promise<{ lang: string; slug: string }> };
const SITE = process.env.SITE_URL ?? 'https://led.creativeweb.am';
const INDEXABLE = process.env.SITE_INDEX === '1';
const PHONE = '+37410502802';
/** Spec groups of the table (order, title, icon) — group names come from backend/src/specs.ts. */
const GROUPS: [string, TKey, string][] = [['main', 'gMain', 'doc'], ['cpu', 'gCpu', 'cpu'], ['display', 'gDisplay', 'monitor'],
  ['memory', 'gMemory', 'spark'], ['graphics', 'gGraphics', 'monitor'], ['ports', 'gPorts', 'wifi'], ['power', 'gPower', 'ups'], ['body', 'gBody', 'tool']];
/** Key tiles under the title: first 4 specs in this order. */
const KEY_ORDER = ['cpu_model', 'cpu', 'screen', 'ram', 'storage', 'gpu', 'capacity', 'mem_type', 'socket', 'power_w', 'hz', 'resolution', 'ports', 'wifi', 'wireless', 'form', 'length'];
const KEY_ICON: Record<string, string> = { main: 'doc', cpu: 'cpu', display: 'monitor', memory: 'spark', graphics: 'monitor', ports: 'wifi', power: 'ups', body: 'tool' };
/** Bracket parts of the name the parser didn't turn into a spec ("Height, Pivot") → one "Features" row. */
function leftovers(spec: string, values: string[]) {
  const norm = (x: string) => x.toLowerCase().replace(/["″]/g, '').replace(/\s+/g, '');
  const vals = values.map(norm);
  return spec.split(' · ').filter((p) => p && !/^win(dows)?\s?1[01]/i.test(p) && !vals.some((v) => v && (norm(p).includes(v) || v.includes(norm(p)))));
}

const load = cache(async (lang: Lang, raw: string) => {
  const slug = decodeURIComponent(raw);
  const here = href(lang, `/product/${slug}`);
  try {
    if (!/^[\p{L}\p{N}-]{1,200}$/u.test(slug)) throw new NotFound(slug);
    const p = await getProduct(slug);
    if (p.slug !== slug) permanentRedirect(href(lang, `/product/${p.slug}`));
    return p;
  } catch (e) {
    if (!(e instanceof NotFound)) throw e;
    const to = await resolvePath(here);
    if (to && to !== here && !to.startsWith(`${href(lang, '/product/')}`)) permanentRedirect(to);
    notFound();
  }
});

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const p = await load(lang, slug);
  const { title } = splitName(p.name);
  const langs = Object.fromEntries((['hy', 'ru', 'en'] as Lang[]).map((x) => [x, href(x, `/product/${p.slug}`)]));
  const img = p.images[0];
  return {
    title: p.seoTitle || `${title} — ${money(p.price)} — ${t(lang, 'buyIn')}`,
    description: p.seoDescription || t(lang, 'prodDesc', { name: p.name, price: money(p.price) }),
    alternates: { canonical: langs[lang], languages: { ...langs, 'x-default': langs.hy } },
    openGraph: { type: 'website', title, url: SITE + langs[lang], images: img ? [{ url: img.startsWith('http') ? img : SITE + img }] : undefined },
    robots: INDEXABLE ? undefined : { index: false, follow: true },
  };
}

export default async function ProductPage({ params }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const p = await load(lang, slug);
  const { title, spec } = splitName(p.name);
  const url = href(lang, `/product/${p.slug}`);
  const placeholder = `/img/placeholder/${p.section || 'default'}.svg`;
  const keys = KEY_ORDER.map((k) => p.specs.find((x) => x.k === k)).filter((x): x is NonNullable<typeof x> => !!x)
    .filter((x, _, a) => !(x.k === 'cpu' && a.some((y) => y.k === 'cpu_model'))).slice(0, 4);
  const other = leftovers(spec, p.specs.map((x) => x.v));
  const abs = (u: string) => (u.startsWith('http') ? u : SITE + u);
  const leaf = p.breadcrumb[p.breadcrumb.length - 1];

  const crumbs = [{ name: t(lang, 'home'), url: '/' }, ...p.breadcrumb.map((c) => ({ name: pick(c.name, lang), url: href(lang, `/${c.path}`) }))];
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: String(p.code),
      ...(p.barcode ? { gtin: p.barcode } : {}), ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
      image: (p.images.length ? p.images : [placeholder]).map(abs), ...(p.description ? { description: p.description.slice(0, 5000) } : {}),
      offers: { '@type': 'Offer', url: SITE + url, priceCurrency: 'AMD', price: String(p.price), availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'LED Computers' } } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [...crumbs, { name: title, url }].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + c.url })) },
  ];
  const item = { id: `p${p.code}`, code: p.code, t: p.name, img: p.images[0] || placeholder, spec, p: p.price, url };

  return (
    <main className="wrap pdpage">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav className="crumbs" aria-label="breadcrumb">
        {crumbs.map((c) => <span key={c.url} style={{ display: 'contents' }}><a href={c.url}>{c.name}</a><span>/</span></span>)}
        <b>{title}</b>
      </nav>

      <div className="pdp" id="top">
        <Gallery images={p.images} alt={title} placeholder={placeholder} />

        <div className="pinfo">
          {p.brand ? <span className="brand">{p.brand}</span> : null}
          <h1>{p.name}</h1>
          <div className="meta"><span className="sku"><span>{t(lang, 'spCode')}:</span> <b>{p.code}</b></span></div>
          {keys.length ? (
            <div className="keys">
              {keys.map((r) => <div key={r.k}><span className="ki"><Icon name={KEY_ICON[r.group] || 'doc'} /></span><span><small>{pick(r.names, lang)}</small><b>{specValue(lang, r.k, r.v)}</b></span></div>)}
            </div>
          ) : null}
          <a href="#specs" className="allspec"><span>{t(lang, 'specsH')}</span><Icon name="arrow" /></a>
        </div>

        <aside className="buy">
          <div>
            <div className="now"><b>{money(p.price)}</b></div>
            <div className="avail"><i></i><b>{t(lang, 'inStockLong')}</b>
              <span>{p.stock.state === 'low' ? ` · ${t(lang, 'lastN', { n: p.stock.qty })}` : ` ${t(lang, 'inStockN', { n: p.stock.qty })}`}</span></div>
            <BuyActions lang={lang} item={item} max={p.stock.qty} phone={PHONE} />
          </div>
          <ul className="perks">
            <li><Icon name="truck" /><span><b>{t(lang, 'pkDelivery')}</b><span>{t(lang, 'pkDeliveryT')}</span></span></li>
            <li><Icon name="store" /><span><b>{t(lang, 'pkPickup')}</b><span>{t(lang, 'pkPickupT')}</span></span></li>
            <li><Icon name="shield" /><span><b>{t(lang, 'pkWarranty')}</b><span>{t(lang, 'pkWarrantyT')}</span></span></li>
            <li><Icon name="card" /><span><b>{t(lang, 'pkPay')}</b><span>{t(lang, 'pkPayT')}</span></span></li>
          </ul>
        </aside>
      </div>

      <div className="cols">
        <div>
          <section className="psec" id="specs">
            <h2>{t(lang, 'specsH')}</h2>
            <div className="card">
              <div className="specs">
                {GROUPS.map(([g, title, icon]) => {
                  const list = p.specs.filter((x) => x.group === g && !(x.k === 'cpu' && p.specs.some((y) => y.k === 'cpu_model')));
                  const extra = g === 'main' ? [
                    ...(p.brand ? [[t(lang, 'spBrand'), p.brand]] : []),
                    ...(other.length ? [[t(lang, 'spOther'), other.join(', ')]] : []),
                  ] : g === 'body' ? [
                    ...(p.weight ? [[t(lang, 'spWeight'), String(p.weight)]] : []),
                    ...(p.barcode ? [[t(lang, 'spBarcode'), p.barcode]] : []),
                    [t(lang, 'spCode'), String(p.code)],
                  ] : [];
                  if (!list.length && !extra.length) return null;
                  return (
                    <div className="sg" key={g}><h3><Icon name={icon} /><span>{t(lang, title)}</span></h3><dl>
                      {g === 'main' ? extra.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>) : null}
                      {list.map((x) => <div key={x.k}><dt>{pick(x.names, lang)}</dt><dd>{specValue(lang, x.k, x.v)}</dd></div>)}
                      {g !== 'main' ? extra.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>) : null}
                    </dl></div>
                  );
                })}
              </div>
            </div>
          </section>
          {p.description ? (
            <section className="psec" id="about">
              <h2>{t(lang, 'descH')}</h2>
              <div className="card desc">{p.description.split(/\n{2,}|\r\n\r\n/).map((s, i) => <p key={i}>{s}</p>)}</div>
            </section>
          ) : null}
        </div>
        <div className="side psec">
          <div className="card"><h3>{t(lang, 'deliveryPay')}</h3>
            <div className="ln"><span>{t(lang, 'pkDelivery')}</span><b>{t(lang, 'pkDeliveryT')}</b></div>
            <div className="ln"><span>{t(lang, 'pkPickup')}</span><b>{t(lang, 'pkPickupT')}</b></div>
            <div className="ln"><span>{t(lang, 'contactsH')}</span><b><a href={`tel:${PHONE}`}>010 502‑802</a></b></div>
          </div>
        </div>
      </div>

      {p.similar.length ? (
        <section className="psec similar" id="similar">
          <div className="sh"><h2>{t(lang, 'similarH')}</h2>{leaf ? <a href={href(lang, `/${leaf.path}`)}>{t(lang, 'allSimilar')}</a> : null}</div>
          <div className="pgrid">{p.similar.slice(0, 10).map((s) => <ProductCard key={s.code} p={s} lang={lang} />)}</div>
        </section>
      ) : null}
    </main>
  );
}
