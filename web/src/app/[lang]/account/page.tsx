/** /account (+ /ru, /en): customer account (components/info/Account.tsx) in the info frame. Personal → noindex. */
import type { Metadata } from 'next';
import type { Lang } from '@/lib/i18n';
import { InfoPage, infoMeta } from '@/components/info/InfoPage';
import { Account } from '@/components/info/Account';
import '@/styles/info.css';

type P = { params: Promise<{ lang: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> { return infoMeta('account', (await params).lang as Lang); }

export default async function Page({ params }: P) {
  const lang = (await params).lang as Lang;
  return <InfoPage k="account" lang={lang} nav={<></>}><div className="ac-app"><Account lang={lang} /></div></InfoPage>;
}
