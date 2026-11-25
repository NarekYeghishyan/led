'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';

/** Product photos: thumbnails, main photo with ‹ › and swipe, click → full-screen lightbox (.lb.open). Template classes (product.css). */
export function Gallery({ images, alt, placeholder }: { images: string[]; alt: string; placeholder: string }) {
  const pics = images.length ? images : [placeholder];
  const [i, setI] = useState(0);
  const [lb, setLb] = useState(false);
  const x0 = useRef<number | null>(null);
  const go = (d: number) => setI((v) => (v + d + pics.length) % pics.length);
  useEffect(() => {
    if (!lb) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setLb(false); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
    addEventListener('keydown', k);
    const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; // no page scroll under the lightbox
    return () => { removeEventListener('keydown', k); document.body.style.overflow = o; };
  });
  const many = pics.length > 1;
  return (
    <div className="gal">
      <div className="thumbs">
        {many ? pics.map((src, n) => (
          <button key={src} className={n === i ? 'on' : undefined} aria-label={String(n + 1)} onClick={() => setI(n)}><img src={src} alt="" /></button>
        )) : null}
      </div>
      <div>
        <div className={`stage${images.length ? '' : ' ph'}`}
          onClick={() => images.length && setLb(true)}
          onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (x0.current === null) return; const d = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); }}>
          <img src={pics[i]} alt={alt} />
          {many ? <>
            <button className="nav l" aria-label="prev" onClick={(e) => { e.stopPropagation(); go(-1); }}><Icon name="chev" /></button>
            <button className="nav r" aria-label="next" onClick={(e) => { e.stopPropagation(); go(1); }}><Icon name="chev" /></button>
            <span className="cnt">{i + 1} / {pics.length}</span>
          </> : null}
        </div>
        {many ? <div className="dots">{pics.map((src, n) => <i key={src} className={n === i ? 'on' : undefined} />)}</div> : null}
      </div>
      {/* rendered into <body>: inside the gallery the sticky header and the buy box were painted over it */}
      {lb ? createPortal(<div className="lb open" style={{ zIndex: 1000 }} onClick={() => setLb(false)}>
        <img src={pics[i]} alt={alt} onClick={(e) => e.stopPropagation()} />
        <button className="x" aria-label="close">✕</button>
        {many ? <>
          <button className="pv" aria-label="prev" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
          <button className="nx" aria-label="next" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
          <span className="c">{i + 1} / {pics.length}</span>
        </> : null}
      </div>, document.body) : null}
    </div>
  );
}
