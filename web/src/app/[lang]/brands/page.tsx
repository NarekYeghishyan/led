/** /brands (+ /ru, /en): every brand with products in stock, A–Z, logo + count (template brand.html without ?b). */
import type { Metadata } from 'next';
import { href, t, type Lang } from '@/lib/i18n';
import { getBrands } from '@/lib/brands';
import { Icon } from '@/components/Icon';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { BrandFilter } from '@/components/brand/BrandFilter';
import '@/styles/shop.css';

type P = { params: Promise<{ lang: string }> };
const INDEXABLE = process.env.SITE_INDEX === '1';

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const langs = Object.fromEntries((['hy', 'ru', 'en'] as Lang[]).map((x) => [x, href(x, '/brands')]));
  return {
    title: t(lang, 'brandsH'), description: t(lang, 'brandsP'),
    alternates: { canonical: langs[lang], languages: { ...langs, 'x-default': langs.hy } },
    robots: INDEXABLE ? undefined : { index: false, follow: true },
  };
}

export default async function BrandsPage({ params }: P) {
  const lang = (await params).lang as Lang;
  const brands = (await getBrands().catch(() => [])).sort((a, b) => a.name.localeCompare(b.name));
  const letters = [...new Set(brands.map((b) => b.name[0].toUpperCase()))];
  return (
    <main className="wrap">
      <nav className="crumbs" aria-label="breadcrumb"><a href={href(lang, '/')}>{t(lang, 'home')}</a><span>/</span><b>{t(lang, 'brandsH')}</b></nav>
      <div className="sp-head">
        <div><h1><span className="ic"><Icon name="store" /></span>{t(lang, 'brandsH')}</h1><p>{t(lang, 'brandsP')}</p></div>
        <BrandFilter letters={letters} all={t(lang, 'allL')} find={t(lang, 'brandFind')} />
      </div>
      <div className="br-grid">
        {brands.map((b) => (
          <a key={b.slug} className="sp-card br-t" data-n={b.name.toLowerCase()} href={href(lang, `/brand/${b.slug}`)}>
            <BrandLogo name={b.name} /><b>{b.name}</b><small>{b.n} {t(lang, 'products')}</small>
          </a>
        ))}
      </div>
    </main>
  );
}
