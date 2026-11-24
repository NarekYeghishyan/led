import type { Metadata } from 'next';
import { getCategories } from '@/lib/api';
import { href, isLang, pick, t, type Lang } from '@/lib/i18n';
import { Icon } from '@/components/Icon';

/** /catalog — every catalog section with its groups (from the admin "Категории сайта"), in-stock counts from the API. */
type P = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params;
  const l = (isLang(lang) ? lang : 'hy') as Lang;
  return {
    title: t(l, 'catalog'),
    alternates: { canonical: href(l, '/catalog'), languages: { hy: '/catalog', ru: '/ru/catalog', en: '/en/catalog', 'x-default': '/catalog' } },
  };
}

export default async function CatalogPage({ params }: P) {
  const lang = (await params).lang as Lang;
  const cats = await getCategories();
  return (
    <main className="wrap catpage">
      <nav className="crumbs"><a href="/">{t(lang, 'home')}</a><span>/</span><b>{t(lang, 'catalog')}</b></nav>
      <div className="sh"><h2 style={{ fontSize: 28 }}>{t(lang, 'catalog')}</h2></div>
      <div className="cgrid cat-sections">
        {cats.map((c) => (
          <a key={c.s} className="c" href={href(lang, `/catalog/${c.s}`)}>
            <div className="ic"><Icon name={c.i || 'pc'} /></div>
            <b>{pick(c.n, lang)}</b>
            <span>{c.k ? `${c.k} ${t(lang, 'products')}` : '\u00a0'}</span>
          </a>
        ))}
      </div>
      <div className="cat-groups">
        {cats.map((c) => (
          <section key={c.s}>
            <h3><a href={href(lang, `/catalog/${c.s}`)}>{pick(c.n, lang)}</a></h3>
            <ul>
              {(c.c ?? []).map((g) => (
                <li key={g.s}><a href={href(lang, `/catalog/${c.s}/${g.s}`)}>{pick(g.n, lang)}</a>{g.k ? <small>{g.k}</small> : null}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
