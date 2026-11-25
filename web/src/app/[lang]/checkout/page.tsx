/** /checkout (+ /ru, /en): real order form (plan step 10, components/orders/Orders.tsx). Personal page → noindex. */
import type { Metadata } from 'next';
import { href, type Lang } from '@/lib/i18n';
import { CheckoutPage } from '@/components/orders/Orders';
import '@/styles/shop.css';

type P = { params: Promise<{ lang: string }> };
const TITLE: Record<Lang, string> = { hy: 'Պատվերի ձևակերպում', ru: 'Оформление заказа', en: 'Checkout' };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return { title: TITLE[lang] ?? TITLE.hy, alternates: { canonical: href(lang, '/checkout') }, robots: { index: false, follow: false } };
}

export default async function Page({ params }: P) {
  const lang = (await params).lang as Lang;
  return <main className="wrap sp-page"><CheckoutPage lang={lang} /></main>;
}
