/** /track-order (+ /ru, /en): order status by number + phone (plan step 10) in the info frame (template key 'track'). noindex. */
import type { Metadata } from 'next';
import type { Lang } from '@/lib/i18n';
import { InfoPage, infoMeta } from '@/components/info/InfoPage';
import { TrackOrder } from '@/components/orders/Orders';
import '@/styles/info.css';

type P = { params: Promise<{ lang: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> { return infoMeta('track', (await params).lang as Lang); }

export default async function Page({ params }: P) {
  const lang = (await params).lang as Lang;
  return <InfoPage k="track" lang={lang}><TrackOrder lang={lang} /></InfoPage>;
}
