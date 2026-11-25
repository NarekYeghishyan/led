/** /forgot-password (+ /ru, /en): template content (content/info.json, key 'forgot') in the info frame; forms wired by InfoForms. */
import type { Metadata } from 'next';
import type { Lang } from '@/lib/i18n';
import { InfoPage, infoMeta } from '@/components/info/InfoPage';
import { InfoForms } from '@/components/info/InfoForms';
import '@/styles/info.css';

type P = { params: Promise<{ lang: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> { return infoMeta('forgot', (await params).lang as Lang); }

export default async function Page({ params }: P) {
  const lang = (await params).lang as Lang;
  return <><InfoPage k="forgot" lang={lang} /><InfoForms lang={lang} /></>;
}
