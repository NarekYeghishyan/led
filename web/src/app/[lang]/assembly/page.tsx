/** /assembly (+ /ru, /en): PC configurator with real in-stock parts (lib/assembly.ts, components/assembly/Assembly.tsx). */
import type { Metadata } from 'next';
import { href, t, type Lang } from '@/lib/i18n';
import { getAssembly } from '@/lib/assembly';
import { Assembly } from '@/components/assembly/Assembly';
import '@/styles/assembly.css';

type P = { params: Promise<{ lang: string }> };
const TITLE = { hy: 'Հավաքիր քո համակարգիչը', ru: 'Собери свою конфигурацию', en: 'Build your own PC' };
const INDEXABLE = process.env.SITE_INDEX === '1';

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const langs = Object.fromEntries((['hy', 'ru', 'en'] as Lang[]).map((x) => [x, href(x, '/assembly')]));
  return { title: TITLE[lang], description: t(lang, 'asmDesc'), alternates: { canonical: langs[lang], languages: { ...langs, 'x-default': langs.hy } }, robots: INDEXABLE ? undefined : { index: false, follow: true } };
}

export default async function Page({ params }: P) {
  const lang = (await params).lang as Lang;
  return <Assembly lang={lang} parts={await getAssembly()} />;
}
