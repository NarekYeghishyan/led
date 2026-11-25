/** /compare (+ /ru, /en): the browser's store, rendered on the client (components/shop/ShopPages.tsx). Personal page → noindex. */
import type { Metadata } from 'next';
import { href, t, type Lang } from '@/lib/i18n';
import { ComparePage } from '@/components/shop/ShopPages';
import '@/styles/shop.css';

type P = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return { title: t(lang, 'cmpH'), alternates: { canonical: href(lang, '/compare') }, robots: { index: false, follow: true } };
}

export default async function Page({ params }: P) {
  const lang = (await params).lang as Lang;
  return <main className="wrap sp-page"><ComparePage lang={lang} /></main>;
}
