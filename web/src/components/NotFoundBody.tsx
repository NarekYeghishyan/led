'use client';
import { usePathname } from 'next/navigation';
import { href, t, type Lang } from '@/lib/i18n';

/** 404 text in the page's language (not-found pages get no params, so the language comes from the URL). */
export function NotFoundBody() {
  const m = /^\/(ru|en)(\/|$)/.exec(usePathname() || '');
  const lang = (m ? m[1] : 'hy') as Lang;
  return (
    <main className="wrap catpage" style={{ padding: '60px 0 80px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 10 }}>{t(lang, 'notFound')}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{t(lang, 'notFoundText')}</p>
      <a className="btn p" href={href(lang, '/catalog')}>{t(lang, 'catalog')}</a>
    </main>
  );
}
