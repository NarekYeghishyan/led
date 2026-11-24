import { toSearch, type CatQuery } from './query';

/** 1 … 4 5 [6] 7 8 … 21 — real links (crawlable), page 1 has no ?page. */
export function Pager({ base, q, page, pages }: { base: string; q: CatQuery; page: number; pages: number }) {
  if (pages <= 1) return null;
  const url = (n: number) => base + toSearch(q, { page: n > 1 ? n : undefined, brand: q.brand, min: q.min, max: q.max, sort: q.sort });
  const nums: (number | '…')[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 2) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="pager" aria-label="pages">
      {page > 1 ? <a href={url(page - 1)} className="pv" rel="prev" aria-label="‹">‹</a> : null}
      {nums.map((n, i) => (n === '…' ? <span key={`d${i}`}>…</span>
        : <a key={n} href={url(n)} className={n === page ? 'on' : undefined} aria-current={n === page ? 'page' : undefined}>{n}</a>))}
      {page < pages ? <a href={url(page + 1)} className="pv" rel="next" aria-label="›">›</a> : null}
    </nav>
  );
}
