'use client';
import { useState } from 'react';
import type { CatNode } from '@/lib/api';
import { href, pick, t, type Lang } from '@/lib/i18n';

/** Left tree: sections (open = current), their groups with in-stock counts; the current group shows its sub-items. */
export function Tree({ lang, cats, path }: { lang: Lang; cats: CatNode[]; path: string[] }) {
  const [open, setOpen] = useState<string | null>(path[0] ?? null);
  return (
    <div className="tree" id="tree">
      <div className="tree-t">{t(lang, 'categories')}</div>
      {cats.map((s) => (
        <div key={s.s} className={`grp${open === s.s ? ' open' : ''}`}>
          <button className="tg-h" type="button" aria-expanded={open === s.s} onClick={() => setOpen(open === s.s ? null : s.s)}>
            {pick(s.n, lang)}<i>›</i>
          </button>
          <ul>
            {(s.c ?? []).map((g) => {
              const cur = path[0] === s.s && path[1] === g.s;
              return (
                <li key={g.s}>
                  <a href={href(lang, `/${s.s}/${g.s}`)} className={cur && !path[2] ? 'on' : undefined} aria-current={cur && !path[2] ? 'page' : undefined}>
                    <span>{pick(g.n, lang)}</span>{g.k ? <em>{g.k}</em> : null}
                  </a>
                  {cur && g.c?.length ? (
                    <ul className="sub">
                      {g.c.map((x) => (
                        <li key={x.s}>
                          <a href={href(lang, `/${s.s}/${g.s}/${x.s}`)} className={path[2] === x.s ? 'on' : undefined}
                            aria-current={path[2] === x.s ? 'page' : undefined}>
                            <span>{pick(x.n, lang)}</span>{x.k ? <em>{x.k}</em> : null}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
