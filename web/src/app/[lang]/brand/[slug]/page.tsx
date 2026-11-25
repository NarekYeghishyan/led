/**
 * Brand page: /brand/<slug>(?cat=&min=&max=&<spec>=&sort=&page=) (+ /ru, /en) — template brand.html?b=: hero (logo, name,
 * real counts, country / founded for known makers), category chips, filters, sort, cards, other brands.
 * Data: /api/shop/products?brand=<name> (in stock only). Unknown slug → 404. Filtered views are noindex.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProducts, type ProductList } from '@/lib/api';
import { href, money, pick, specValue, t, type Lang } from '@/lib/i18n';
import { BRAND_INFO, COUNTRY, getBrands } from '@/lib/brands';
import { ProductCard } from '@/components/ProductCard';
import { Filters, FiltersButton } from '@/components/catalog/Filters';
import { Grid, Toolbar } from '@/components/catalog/Toolbar';
import { Pager } from '@/components/catalog/Pager';
import { parseQuery, toSearch, withSpec, type CatQuery } from '@/components/catalog/query';
import { BrandLogo } from '@/components/brand/BrandLogo';
import '@/styles/shop.css';

type SP = Record<string, string | string[] | undefined>;
type P = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<SP> };
const PER_PAGE = 24;
const INDEXABLE = process.env.SITE_INDEX === '1';
const LI: Record<Lang, number> = { hy: 0, ru: 1, en: 2 };

async function brandOf(slug: string) {
  const all = await getBrands().catch(() => []);
  return { b: all.find((x) => x.slug === slug), all };
}

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const { b } = await brandOf(slug);
  if (!b) return {};
  const q = parseQuery(await searchParams);
  const filtered = !!(q.cat || q.min || q.max || q.sort || q.page || Object.keys(q.specs).length);
  const langs = Object.fromEntries((['hy', 'ru', 'en'] as Lang[]).map((x) => [x, href(x, `/brand/${slug}`)]));
  return {
    title: t(lang, 'brTitle', { b: b.name }), description: t(lang, 'brLead', { b: b.name, n: b.n }),
    alternates: { canonical: langs[lang], languages: { ...langs, 'x-default': langs.hy } },
    robots: INDEXABLE && !filtered ? undefined : { index: false, follow: true },
  };
}

export default async function BrandPage({ params, searchParams }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const { b, all: brands } = await brandOf(slug);
  if (!b) notFound();
  const q = { ...parseQuery(await searchParams), brand: [] as string[] };
  const base = href(lang, `/brand/${slug}`);
  const specs = Object.fromEntries(Object.entries(q.specs).map(([k, v]) => [k, v.join(',')]));
  const [data, whole]: [ProductList, ProductList] = await Promise.all([
    getProducts({ ...specs, brand: b.name, cat: q.cat, min: q.min, max: q.max, sort: q.sort, page: q.page, limit: PER_PAGE }),
    getProducts({ brand: b.name, limit: 1 }),
  ]);
  const cats = whole.facets.cats || [];
  const info = BRAND_INFO[slug];

  const chips: { label: string; change: Partial<CatQuery> }[] = [
    ...Object.entries(q.specs).flatMap(([k, vs]) => {
      const f = data.facets.specs?.find((x) => x.k === k);
      return vs.map((v) => ({ label: `${f ? `${pick(f.names, lang)}: ` : ''}${specValue(lang, k, v)}`, change: withSpec(q, k, v) }));
    }),
    ...(q.min || q.max ? [{ label: `${q.min ? money(q.min) : '0'} — ${q.max ? money(q.max) : '∞'}`, change: { min: undefined, max: undefined } }] : []),
  ];
  const others = brands.filter((x) => x.slug !== slug).slice(0, 8);

  return (
    <main className="wrap catpage">
      <nav className="crumbs" aria-label="breadcrumb">
        <a href={href(lang, '/')}>{t(lang, 'home')}</a><span>/</span><a href={href(lang, '/brands')}>{t(lang, 'brandsH')}</a><span>/</span><b>{b.name}</b>
      </nav>
      <div className="br-hero">
        <BrandLogo name={b.name} />
        <div className="br-hi">
          <h1>{b.name}</h1>
          <p>{t(lang, 'brLead', { b: b.name, n: b.n })}</p>
          <div className="br-facts">
            {info ? <><div><small>{t(lang, 'brCountry')}</small><b>{COUNTRY[info[0]][LI[lang]]}</b></div>
              <div><small>{t(lang, 'brSince')}</small><b>{info[1]}</b></div></> : null}
            <div><small>{t(lang, 'brInStock')}</small><b>{b.n}</b></div>
            {cats.length ? <div><small>{t(lang, 'brCats')}</small><b>{cats.length}</b></div> : null}
          </div>
        </div>
      </div>
      {cats.length > 1 ? (
        <div className="sr-cats">
          <a href={base + toSearch({ ...q, cat: undefined })} className={!q.cat ? 'on' : undefined}>{t(lang, 'allCats')}</a>
          {cats.map((c) => (
            <a key={c.path} href={base + toSearch({ ...q, cat: c.path, specs: {}, min: undefined, max: undefined })}
              className={q.cat === c.path ? 'on' : undefined}>{pick(c.name, lang)} <em>{c.n}</em></a>
          ))}
        </div>
      ) : null}
      <div className="cat-body">
        <Filters lang={lang} base={base} q={q} brands={[]} price={data.facets.price} specs={data.facets.specs} total={data.total} />
        <div className="results">
          <Toolbar lang={lang} base={base} q={q} chips={chips} />
          <FiltersButton lang={lang} count={chips.length} />
          <Grid>{data.items.map((p) => <ProductCard key={p.code} p={p} lang={lang} />)}</Grid>
          <Pager base={base} q={q} page={data.page} pages={data.pages} />
        </div>
      </div>
      {others.length ? (
        <section className="sp-up">
          <h3>{t(lang, 'brOther')}</h3>
          <div className="br-grid sm">
            {others.map((x) => (
              <a key={x.slug} className="sp-card br-t" href={href(lang, `/brand/${x.slug}`)}><BrandLogo name={x.name} /><b>{x.name}</b><small>{x.n} {t(lang, 'products')}</small></a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
