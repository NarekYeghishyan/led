/**
 * Home page: / (hy), /ru, /en — layout and look of Design/site/index.html (styles/home.css + site.css), real data only:
 * - Slider: one in-stock product with a photo from each catalog section (the API's default order puts photos first).
 * - Quick links: gaming PCs, network equipment, new arrivals; stats = real counts (in stock, brands, categories).
 * - "Best offers": New (newest Access codes) + a tab per section. No invented discounts, old prices or monthly payments.
 * - Brands: the brands with most products in stock, template logos where they exist (components/home/art.ts).
 * Old /?lang=ru links → 301 /ru (web/src/proxy.ts).
 */
import type { Metadata } from 'next';
import { getByCodes, getCategories, getHomeBlocks, getProducts, type HomeBlocks, type CatNode, type ProductCard as Card, type ProductList } from '@/lib/api';
import { href, pick, t, type Lang } from '@/lib/i18n';
import { ProductCard, splitName } from '@/components/ProductCard';
import { Icon } from '@/components/Icon';
import { pageUrl } from '@/lib/pages';
import { BestTabs, CreditCalc, TopBuilds, GamingCard, HeroSlider, type Slide } from '@/components/home/HomeClient';
import { BRAND_LOGOS, CHAIN, QK_NEW, QK_SALE } from '@/components/home/art';
import { getBuilds } from '@/lib/builds';
import { brandSlug } from '@/lib/brands';
import '@/styles/home.css';

type P = { params: Promise<{ lang: string }> };
const SITE = process.env.SITE_URL ?? 'https://led.creativeweb.am';
const INDEXABLE = process.env.SITE_INDEX === '1';

const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
const EMPTY: ProductList = { items: [], total: 0, page: 1, pages: 1, limit: 0, sort: 'default', facets: { brands: [], price: { min: 0, max: 0 }, specs: [] }, category: null };

async function load() {
  const cats = await safe(getCategories(), [] as CatNode[]);
  const [all, fresh, ...bySection] = await Promise.all([
    safe(getProducts({ limit: 1 }), EMPTY),
    safe(getProducts({ sort: 'new', limit: 10 }), EMPTY),
    ...cats.map((c) => safe(getProducts({ cat: c.s, limit: 10 }), EMPTY)),
  ]);
  const blocks = await safe(getHomeBlocks(), null as HomeBlocks | null);
  const manual = blocks?.slides.mode === 'manual' && blocks.slides.items.length
    ? (await safe(getByCodes(blocks.slides.items.map((x) => x.code)), { items: [] as Card[] })).items : [];
  return { cats, all, fresh, bySection, blocks, manual };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const all = await safe(getProducts({ limit: 1 }), EMPTY);
  const langs = { hy: '/', ru: '/ru', en: '/en' };
  return {
    title: { absolute: t(lang, 'homeTitle') },
    description: t(lang, 'homeDesc', { n: all.total }),
    alternates: { canonical: langs[lang], languages: { ...langs, 'x-default': '/' } },
    robots: INDEXABLE ? undefined : { index: false, follow: true },
  };
}

const countLeaves = (n: CatNode[]): number => n.reduce((s, c) => s + (c.c?.length ? countLeaves(c.c) : 1), 0);

export default async function Home({ params }: P) {
  const lang = (await params).lang as Lang;
  const [{ cats, all, fresh, bySection, blocks, manual }, builds] = await Promise.all([load(), getBuilds().catch(() => [])]);
  const url = (p: Card) => href(lang, `/product/${p.slug}`);
  const img = (p: Card) => p.image || `/img/placeholder/${p.section || 'default'}.svg`;

  const show = (id: string) => !blocks?.hide.includes(id);
  const tx = (v: { hy?: string; ru?: string; en?: string } | undefined) => v?.[lang] || v?.hy || v?.ru || v?.en || '';
  const slideOf = (p: Card, tag: string): Slide => {
    const { title, spec } = splitName(p.name);
    return { tag, title, spec, price: p.price, img: img(p), url: url(p), item: { id: `p${p.code}`, code: p.code, t: p.name, img: img(p), spec, p: p.price, url: url(p) } };
  };
  // slider: the admin's hand-picked in-stock products, else the first product with a photo in each section (max 5)
  const sectionName = (p: Card) => { const c = cats.find((x) => x.s === p.section); return c ? pick(c.n, lang) : ''; };
  const picked: Slide[] = blocks?.slides.mode === 'manual'
    ? blocks.slides.items.flatMap((x) => { const p = manual.find((m) => m.code === x.code); return p ? [slideOf(p, tx(x.tag) || sectionName(p))] : []; }) : [];
  const slides: Slide[] = picked.length ? picked : cats.flatMap((c, i) => {
    const p = bySection[i].items.find((x) => x.image);
    return p ? [slideOf(p, pick(c.n, lang))] : [];
  }).slice(0, 5);

  const find = (path: string[]) => {
    let list = cats, node: CatNode | undefined;
    for (const s of path) { node = list.find((c) => c.s === s); list = node?.c ?? []; }
    return node;
  };
  const gaming = find(['computers', 'gaming']);
  const net = cats.find((c) => c.s === 'network-equipment');
  const netI = cats.findIndex((c) => c.s === 'network-equipment');
  const netBrands = netI >= 0 ? bySection[netI].facets.brands.slice(0, 3).map((b) => b.v).join(' · ') : '';
  const brands = all.facets.brands.slice(0, 12);

  // "Best offers" tabs: the admin's order ('new' + section slugs), else New + every section
  const tabKeys = (blocks?.tabs.length ? blocks.tabs : ['new', ...cats.map((c) => c.s)]).filter((k) => k === 'new' || cats.some((c) => c.s === k));
  const tabs = tabKeys.map((k) => (k === 'new' ? t(lang, 'qkNew') : pick(cats.find((c) => c.s === k)!.n, lang)));
  const lists = tabKeys.map((k) => (k === 'new' ? fresh : bySection[cats.findIndex((c) => c.s === k)]));
  const allLinks = tabKeys.map((k) => (k === 'new' ? { href: href(lang, '/catalog'), label: `${t(lang, 'catalog')} →` } : { href: href(lang, `/${k}`), label: t(lang, 'allIn') }));
  const orgLd = { '@context': 'https://schema.org', '@type': 'ComputerStore', name: 'LED Computers', url: SITE + href(lang, '/'),
    logo: `${SITE}/img/logo.png`, telephone: '+37410502802', priceRange: '֏֏',
    address: { '@type': 'PostalAddress', streetAddress: 'Kievyan 11-34', addressLocality: 'Yerevan', addressCountry: 'AM' } };

  return (
    <main className="wrap home">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, '\\u003c') }} />
      <div className="hero">
        <HeroSlider lang={lang} slides={slides} />
        <div className="hside">
      {show('cfgPromo') ? (<>
          <div className="promo b">
            <div className="ic"><Icon name="cpu" /></div>
            <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: CHAIN }} />
            <small>{t(lang, 'cfgSmall')}</small><h3>{t(lang, 'cfgH')}</h3>
            <a href={href(lang, '/assembly')}>{t(lang, 'cfgA')} <Icon name="arrow" style={{ width: 16 }} /></a>
          </div>
      </>) : null}
          {show('gaming') ? <GamingCard lang={lang} url={href(lang, gaming ? '/computers/gaming' : '/computers')} /> : null}
        </div>
      </div>

      {show('quick') || show('stats') ? (
      <div className="qk">
        {!show('quick') ? null : blocks?.quick.mode === 'manual' && blocks.quick.items.length ? blocks.quick.items.map((q, n) => (
          <a key={n} className={`qk-c ${q.style}`} href={q.url.startsWith('/') ? href(lang, q.url) : q.url || '#'}>
            {q.style === 'srv' ? <i className="qi"><Icon name="server" /></i> : <i className="qi" dangerouslySetInnerHTML={{ __html: q.style === 'sale' ? QK_SALE : QK_NEW }} />}
            <div className="qx"><b>{tx(q.title)}</b><span>{tx(q.sub)}</span></div>
            <i className="qa"><Icon name="arrow" /></i>
          </a>
        )) : <>
        {gaming ? (
          <a className="qk-c sale" href={href(lang, '/computers/gaming')}>
            <i className="qi" dangerouslySetInnerHTML={{ __html: QK_SALE }} />
            <div className="qx"><b>{pick(gaming.n, lang)}</b><span>{gaming.k ?? 0} {t(lang, 'products')}</span></div>
            <i className="qa"><Icon name="arrow" /></i>
          </a>
        ) : null}
        {net ? (
          <a className="qk-c srv" href={href(lang, `/${net.s}`)}>
            <i className="qi"><Icon name="server" /></i>
            <div className="qx"><b>{pick(net.n, lang)}</b><span>{netBrands}</span></div>
            <i className="qa"><Icon name="arrow" /></i>
          </a>
        ) : null}
        <a className="qk-c new" href="#best">
          <i className="qi" dangerouslySetInnerHTML={{ __html: QK_NEW }} />
          <div className="qx"><b>{t(lang, 'qkNew')}</b><span>{t(lang, 'qkNewS')}</span></div>
          <i className="qa"><Icon name="arrow" /></i>
        </a>
        </>}
        {show('stats') ? (
        <div className="qk-st">
          <div><b>{all.total.toLocaleString('ru-RU').replace(/ /g, ' ')}</b><span>{t(lang, 'stInStock')}</span></div>
          <div><b>{all.facets.brands.length}</b><span>{t(lang, 'stBrands')}</span></div>
          <div><b>{countLeaves(cats)}</b><span>{t(lang, 'stCats')}</span></div>
        </div>
        ) : null}
      </div>
      ) : null}

      {show('trust') ? (<>
      <div className="trust">
        {([['truck', 'tDelivery', 'tDeliveryS'], ['card', 'tCredit', 'tCreditS'], ['shield', 'tWarranty', 'tWarrantyS'], ['store', 'tShow', 'tShowS']] as const).map(([ic, b, s]) => (
          <div className="t" key={b}><div className="ic"><Icon name={ic} /></div><div><b>{t(lang, b)}</b><span>{t(lang, s)}</span></div></div>
        ))}
      </div>
      </>) : null}

      {show('best') ? (<>
      <BestTabs title={t(lang, 'bestH')} tabs={tabs} all={allLinks}>
        {lists.map((l, i) => l.items.slice(0, 10).map((p) => <ProductCard key={`${i}-${p.code}`} p={p} lang={lang} />))}
      </BestTabs>
      </>) : null}

      {show('build') || show('credit') ? (
      <section className="band">
        {show('build') ? (
        <div className="build">
          <div className="bl">
            <span className="eyebrow">{t(lang, 'bEyebrow')}</span>
            <h3>{t(lang, 'bH')}</h3>
            <p>{t(lang, 'bP')}</p>
            <ul className="perks">{(['b1', 'b2', 'b3'] as const).map((k) => <li key={k}><Icon name="check" /><span>{t(lang, k)}</span></li>)}</ul>
            <div className="btns"><a className="btn p" href={href(lang, '/assembly')}>{t(lang, 'bGo')} <Icon name="arrow" /></a></div>
          </div>
          <TopBuilds lang={lang} builds={builds} cfgUrl={href(lang, '/assembly')} />
        </div>
        ) : null}
        {show('credit') ? (
        <div className="credit">
          <span className="eyebrow">{t(lang, 'crEyebrow')}</span>
          <h3>{t(lang, 'crH')}</h3>
          <ul>{(['cr1', 'cr2', 'cr3'] as const).map((k) => <li key={k}><Icon name="check" />{t(lang, k)}</li>)}</ul>
          <a className="btn p" href={pageUrl(lang, 'credit')}>{t(lang, 'crGo')}</a>
          {slides.length ? <CreditCalc lang={lang} price={(slides.find((x) => x.price >= 200000) ?? slides[0]).price} /> : null}
        </div>
        ) : null}
      </section>
      ) : null}

      {show('b2b') ? (<>
      <section className="b2b">
        <div>
          <span className="eyebrow">{t(lang, 'bzEyebrow')}</span>
          <h3>{t(lang, 'bzH')}</h3>
          <p>{t(lang, 'bzP')}</p>
          <div className="btns"><a className="btn p" href={pageUrl(lang, 'contacts')}>{t(lang, 'bzGo')}</a></div>
        </div>
        <div className="feats">
          {([['doc', 'bz1', 'bz1s'], ['users', 'bz2', 'bz2s'], ['server', 'bz3', 'bz3s'], ['store', 'bz4', 'bz4s']] as const).map(([ic, b, s]) => (
            <div key={b}><Icon name={ic} /><div><b>{t(lang, b)}</b><span>{t(lang, s)}</span></div></div>
          ))}
        </div>
      </section>
      </>) : null}

      {brands.length && show('brands') ? (
        <section>
          <div className="sh"><h2>{t(lang, 'brands')}</h2><a href={href(lang, '/brands')}>{t(lang, 'allL')} →</a></div>
          <div className="brands">
            {brands.map((b) => {
              const logo = BRAND_LOGOS[b.v.toLowerCase()];
              return (
                <a key={b.v} href={href(lang, `/brand/${brandSlug(b.v)}`)} style={{ ['--bc' as string]: logo?.[0] ?? '#16243B' }} title={`${b.v} · ${b.n}`}>
                  {logo ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: logo[1] }} /> : <b className="br-txt">{b.v}</b>}
                  <span>{b.v}</span>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
