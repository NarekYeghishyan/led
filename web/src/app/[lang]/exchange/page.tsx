/** /exchange (+ /ru, /en): template content (content/info.json, key 'exchange') in the info frame. */
import type { Metadata } from 'next';
import type { Lang } from '@/lib/i18n';
import { InfoPage, infoMeta } from '@/components/info/InfoPage';
import { InfoForms } from '@/components/info/InfoForms';
import '@/styles/info.css';

type P = { params: Promise<{ lang: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> { return infoMeta('exchange', (await params).lang as Lang, true); }

export default async function Page({ params }: P) {
  const lang = (await params).lang as Lang;
  return <><InfoPage k="exchange" lang={lang} /><InfoForms lang={lang} /></>;
}
