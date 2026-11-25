/**
 * Category page: /<section>[/<group>[/<item>]] (+ /ru, /en). URL scheme and SEO rules: docs/PROJECT_PLAN.md section 11.
 * - Data: GET /api/shop/products?cat=… (in-stock products only, prices in ֏); filters live in the URL (?brand=&min=&max=&sort=&page=).
 * - Unknown path → /api/shop/resolve (renamed/moved categories, old led.am URLs) → permanent redirect, else 404.
 * - SEO: canonical = clean URL (+ ?page=N for later pages); filtered/sorted variants are noindex,follow; BreadcrumbList +
 *   ItemList JSON-LD; hreflang for hy/ru/en.
 */
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { getCategories, getProducts, NotFound, resolvePath, type ProductList } from '@/lib/api';
import { href, money, pick, specValue, t, type Lang } from '@/lib/i18n';
import { ProductCard } from '@/components/ProductCard';
import { Tree } from '@/components/catalog/Tree';
import { Filters, FiltersButton } from '@/components/catalog/Filters';
import { Grid, Toolbar } from '@/components/catalog/Toolbar';
import { Pager } from '@/components/catalog/Pager';
import { isFiltered, parseQuery, withSpec, type CatQuery } from '@/components/catalog/query';

type SP = Record<string, string | string[] | undefined>;
type P = { params: Promise<{ lang: string; slug: string[] }>; searchParams: Promise<SP> };
const PER_PAGE = 24;
const SITE = process.env.SITE_URL ?? 'https://led.creativeweb.am';
const INDEXABLE = process.env.SITE_INDEX === '1'; // test domain: never indexed

/** Loads the category, or answers with a redirect / 404 (shared by the page and its metadata; fetches are deduplicated). */
const load = cache(async (lang: Lang, slug: string[], sp: SP) => {
  const path = slug.map((s) => decodeURIComponent(s));
  const q = parseQuery(sp);
  const here = `${lang === 'hy' ? '' : `/${lang}`}/${path.join('/')}`;
  const unknown = async (): Promise<never> => {
    const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(Array.isArray(v) ? v[0] : v)]]))).toString();
    const to = await resolvePath(here + (qs ? `?${qs}` : ''));
    if (to && to !== here) permanentRedirect(to);
    notFound();
  };
  if (path.length > 3 || path.some((s) => !/^[a-z0-9-]{1,80}$/.test(s))) return unknown();
  let data: ProductList;
  try {
    data = await getProducts({ ...Object.fromEntries(Object.entries(q.specs).map(([k, v]) => [k, v.join(',')])),
      cat: path.join('/'), brand: q.brand.join(','), min: q.min, max: q.max, sort: q.sort, page: q.page, limit: PER_PAGE });
  } catch (e) {
    if (e instanceof NotFound) return unknown();
    throw e;
  }
  if (!data.category) return unknown();
  if (q.page && q.page > data.pages) notFound();
  return { path, q, data, cat: data.category };
});

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const { path, q, data, cat } = await load(lang, slug, await searchParams);
  const name = pick(cat.path[cat.path.length - 1].name, lang);
  const clean = href(lang, `/${path.join('/')}`);
  const page = q.page ?? 1;
  const filtered = isFiltered(q);
  const canonical = clean + (!filtered && page > 1 ? `?page=${page}` : '');
  const langs = Object.fromEntries((['hy', 'ru', 'en'] as Lang[]).map((x) => [x, href(x, `/${path.join('/')}`)]));
  return {
    title: `${name} — ${t(lang, 'buyIn')}${page > 1 ? ` (${t(lang, 'pageN', { n: page })})` : ''}`,
    description: t(lang, 'catDesc', { name, n: data.total }),
    alternates: { canonical, languages: { ...langs, 'x-default': langs.hy } },
    robots: INDEXABLE && !filtered ? undefined : { index: false, follow: true },
  };
}

export default async function CategoryPage({ params, searchParams }: P) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const { path, q, data, cat } = await load(lang, slug, await searchParams);
  const cats = await getCategories();
  const base = href(lang, `/${path.join('/')}`);
  const leaf = cat.path[cat.path.length - 1];
  const name = pick(leaf.name, lang);

  const chips: { label: string; change: Partial<CatQuery> }[] = [
    ...q.brand.map((b) => ({ label: b, change: { brand: q.brand.filter((x) => x !== b) } })),
    ...Object.entries(q.specs).flatMap(([k, vs]) => {
      const f = data.facets.specs?.find((x) => x.k === k);
      return vs.map((v) => ({ label: `${f ? `${pick(f.names, lang)}: ` : ''}${specValue(lang, k, v)}`, change: withSpec(q, k, v) }));
    }),
    ...(q.min || q.max ? [{ label: `${q.min ? money(q.min) : '0'} — ${q.max ? money(q.max) : '∞'}`, change: { min: undefined, max: undefined } }] : []),
  ];

  const crumbs = [{ name: t(lang, 'home'), url: '/' }, ...cat.path.map((c) => ({ name: pick(c.name, lang), url: href(lang, `/${c.path}`) }))];
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + c.url })) },
    { '@context': 'https://schema.org', '@type': 'ItemList', name,
      itemListElement: data.items.map((p, i) => ({ '@type': 'ListItem', position: (data.page - 1) * data.limit + i + 1, url: SITE + href(lang, `/product/${p.slug}`) })) },
  ];

  return (
    <main className="wrap catpage">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav className="crumbs" aria-label="breadcrumb">
        {crumbs.map((c, i) => (i < crumbs.length - 1
          ? <span key={c.url} style={{ display: 'contents' }}><a href={c.url}>{c.name}</a><span>/</span></span>
          : <b key={c.url}>{c.name}</b>))}
      </nav>
      <div className="cat-head">
        <div><h1 id="catTitle">{name}</h1><p><b id="catCount">{data.total}</b> <span>{t(lang, 'products')}</span></p></div>
      </div>
      <div className="cat-body">
        <Filters lang={lang} base={base} q={q} brands={data.facets.brands} price={data.facets.price} specs={data.facets.specs} total={data.total}>
          <Tree lang={lang} cats={cats} path={path} />
        </Filters>
        <div className="results">
          <Toolbar lang={lang} base={base} q={q} chips={chips} />
          <FiltersButton lang={lang} count={chips.length} />
          {data.items.length ? (
            <Grid>{data.items.map((p) => <ProductCard key={p.code} p={p} lang={lang} />)}</Grid>
          ) : (
            <div className="cat-empty">
              <p>{t(lang, isFiltered(q) ? 'empty' : 'emptyCat')}</p>
              {isFiltered(q) ? <a className="btn p" href={base}>{t(lang, 'reset')}</a> : <a className="btn p" href={href(lang, '/catalog')}>{t(lang, 'catalog')}</a>}
            </div>
          )}
          <Pager base={base} q={q} page={data.page} pages={data.pages} />
        </div>
      </div>
      {!isFiltered(q) && (q.page ?? 1) === 1 && data.total > 0 ? (
        <section className="seo">
          <h2>{name} — {t(lang, 'buyIn')}</h2>
          <p>{t(lang, 'catDesc', { name, n: data.total })}</p>
        </section>
      ) : null}
    </main>
  );
}
