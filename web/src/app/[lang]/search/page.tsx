/**
 * Search page: /search?q=…(&cat=section/group&brand=&min=&max=&<spec>=&sort=&page=) (+ /ru, /en).
 * Data: GET /api/shop/products?q= (backend/src/search.ts: every word must match name / brand / category names in RU-HY-EN,
 * typos corrected → `fix`). Category chips come from an unfiltered call so all categories of the query stay visible.
 * SEO: search pages are never indexed (noindex,follow); canonical = /search.
 */
import type { Metadata } from 'next';
import { getProducts, type ProductList } from '@/lib/api';
import { href, money, pick, specValue, t, type Lang } from '@/lib/i18n';
import { ProductCard } from '@/components/ProductCard';
import { Filters, FiltersButton } from '@/components/catalog/Filters';
import { Grid, Toolbar } from '@/components/catalog/Toolbar';
import { Pager } from '@/components/catalog/Pager';
import { parseQuery, toSearch, withSpec, type CatQuery } from '@/components/catalog/query';
import { SearchRemember } from '@/components/SearchRemember';

type SP = Record<string, string | string[] | undefined>;
type P = { params: Promise<{ lang: string }>; searchParams: Promise<SP> };
const PER_PAGE = 24;

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const q = parseQuery(await searchParams);
  return {
    title: q.q ? `${t(lang, 'searchFor', { q: q.q })} — ${t(lang, 'searchH')}` : t(lang, 'searchH'),
    alternates: { canonical: href(lang, '/search') },
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: P) {
  const lang = (await params).lang as Lang;
  const q = parseQuery(await searchParams);
  const base = href(lang, '/search');
  if (!q.q) {
    return (
      <main className="wrap catpage">
        <div className="cat-head"><div><h1>{t(lang, 'searchH')}</h1><p>{t(lang, 'searchEmptyQ')}</p></div></div>
      </main>
    );
  }
  const specs = Object.fromEntries(Object.entries(q.specs).map(([k, v]) => [k, v.join(',')]));
  const [data, all]: [ProductList, ProductList] = await Promise.all([
    getProducts({ ...specs, q: q.q, cat: q.cat, brand: q.brand.join(','), min: q.min, max: q.max, sort: q.sort, page: q.page, limit: PER_PAGE }),
    q.cat ? getProducts({ q: q.q, limit: 1 }) : Promise.resolve(null as unknown as ProductList),
  ]).catch(() => [null, null] as unknown as [ProductList, ProductList]);
  if (!data) {
    return <main className="wrap catpage"><div className="cat-head"><div><h1>{t(lang, 'searchH')}</h1><p>{t(lang, 'nothingFound')}</p></div></div></main>;
  }
  const cats = (all || data).facets.cats || [];
  const fix = data.fix;

  const chips: { label: string; change: Partial<CatQuery> }[] = [
    ...q.brand.map((b) => ({ label: b, change: { brand: q.brand.filter((x) => x !== b) } })),
    ...Object.entries(q.specs).flatMap(([k, vs]) => {
      const f = data.facets.specs?.find((x) => x.k === k);
      return vs.map((v) => ({ label: `${f ? `${pick(f.names, lang)}: ` : ''}${specValue(lang, k, v)}`, change: withSpec(q, k, v) }));
    }),
    ...(q.min || q.max ? [{ label: `${q.min ? money(q.min) : '0'} — ${q.max ? money(q.max) : '∞'}`, change: { min: undefined, max: undefined } }] : []),
  ];

  return (
    <main className="wrap catpage">
      <SearchRemember q={q.q} />
      <nav className="crumbs" aria-label="breadcrumb"><a href="/">{t(lang, 'home')}</a><span>/</span><b>{t(lang, 'searchH')}</b></nav>
      <div className="cat-head">
        <div>
          <h1 id="catTitle">{t(lang, 'searchFor', { q: q.q })}</h1>
          <p><b id="catCount">{data.total}</b> <span>{t(lang, 'products')}</span>
            {fix ? <> · <span>{t(lang, 'showingFix', { fix })}</span></> : null}</p>
        </div>
      </div>
      {cats.length > 1 || q.cat ? (
        <div className="sr-cats">
          <a href={base + toSearch({ ...q, cat: undefined })} className={!q.cat ? 'on' : undefined}>{t(lang, 'allCats')}</a>
          {cats.map((c) => (
            <a key={c.path} href={base + toSearch({ ...q, cat: c.path, brand: [], specs: {}, min: undefined, max: undefined })}
              className={q.cat === c.path ? 'on' : undefined}>{pick(c.name, lang)} <em>{c.n}</em></a>
          ))}
        </div>
      ) : null}
      <div className="cat-body">
        <Filters lang={lang} base={base} q={q} brands={data.facets.brands} price={data.facets.price} specs={data.facets.specs} total={data.total} />
        <div className="results">
          <Toolbar lang={lang} base={base} q={q} chips={chips} />
          <FiltersButton lang={lang} count={chips.length} />
          {data.items.length ? (
            <Grid>{data.items.map((p) => <ProductCard key={p.code} p={p} lang={lang} />)}</Grid>
          ) : (
            <div className="cat-empty"><p>{t(lang, 'searchNone', { q: q.q })}</p><a className="btn p" href={href(lang, '/catalog')}>{t(lang, 'catalog')}</a></div>
          )}
          <Pager base={base} q={q} page={data.page} pages={data.pages} />
        </div>
      </div>
    </main>
  );
}
