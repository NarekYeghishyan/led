import { redirect } from 'next/navigation';

/**
 * /ru and /en home: the home page is still the static template (Design/site/index.html, language from ?lang=), so this
 * is a TEMPORARY (307) redirect until the home page moves to Next.js (plan step 7). The Armenian "/" is served by nginx.
 */
export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(lang === 'hy' ? '/' : `/?lang=${lang}`);
}
