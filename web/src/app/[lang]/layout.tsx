import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Inter, Noto_Sans_Armenian } from 'next/font/google';
import { Suspense } from 'react';
import { getCategories, getMegaExtras, type CatNode } from '@/lib/api';
import { isLang, type Lang } from '@/lib/i18n';
import { Sprite } from '@/components/Sprite';
import { TopBar } from '@/components/TopBar';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { BgFx, Fab, HeaderHeight, HoverFx } from '@/components/Effects';
import { StoreSync } from '@/components/StoreSync';
import { PhoneMask } from '@/components/PhoneMask';
import '@/styles/site.css';
import '@/styles/app.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--font-inter', display: 'swap' });
const armenian = Noto_Sans_Armenian({ subsets: ['armenian'], weight: ['400', '600', '700'], variable: '--font-arm', display: 'swap' });

// No generateStaticParams: pages render on request (API data cached 60 s, refreshed by the API on changes), never at
// build time — the image build must not depend on the live API being up.

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'https://led.creativeweb.am'),
  title: { default: 'LED Computers', template: '%s — LED Computers' },
  // test domain: never indexed (nginx also sends X-Robots-Tag). Remove at go-live (step 11).
  robots: process.env.SITE_INDEX === '1' ? undefined : { index: false, follow: false },
  icons: { icon: '/img/logo.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0E1A2E' };

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  let cats: CatNode[] = [];
  try { cats = await getCategories(); } catch { /* API down: the page still renders, menus empty */ }
  const extras = await getMegaExtras(cats);
  return (
    <html lang={lang} className={`${inter.variable} ${armenian.variable}`}>
      <body>
        <Sprite cats={cats} />
        <BgFx />
        <Fab lang={lang as Lang} />
        <StoreSync lang={lang as Lang} />
        <PhoneMask />
        <Suspense fallback={null}><TopBar lang={lang as Lang} /></Suspense>
        <Header lang={lang as Lang} cats={cats} extras={extras} />
        {children}
        <Footer lang={lang as Lang} cats={cats} />
        <HoverFx />
        <HeaderHeight />
      </body>
    </html>
  );
}
