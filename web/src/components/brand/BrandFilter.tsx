'use client';
/** /brands: A–Z letter buttons + "find a brand" box; hides tiles (.br-t[data-n]) on the page, like the template. */
import { useEffect, useState } from 'react';

export function BrandFilter({ letters, all, find }: { letters: string[]; all: string; find: string }) {
  const [l, setL] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.br-t[data-n]').forEach((t) => {
      const n = t.dataset.n || '';
      t.hidden = (!!q && !n.includes(q.toLowerCase())) || (!!l && n[0].toUpperCase() !== l);
    });
  }, [l, q]);
  return (
    <>
      <div className="sp-tools"><input className="br-q" placeholder={find} aria-label={find} value={q} onChange={(e) => setQ(e.target.value.trim())} /></div>
      <div className="br-az" style={{ flexBasis: '100%' }}>
        <button className={!l ? 'on' : undefined} onClick={() => setL('')}>{all}</button>
        {letters.map((x) => <button key={x} className={l === x ? 'on' : undefined} onClick={() => setL(x)}>{x}</button>)}
      </div>
    </>
  );
}
