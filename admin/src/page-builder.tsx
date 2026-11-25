/**
 * Block constructor for the info page texts (admin "Страницы сайта"). The page body is still stored as HTML (site-blocks 'info',
 * cleaned by the server's whitelist) — this is only an editor over it: the HTML is parsed into the site's designed blocks
 * (numbers row, card with icon + heading + parts, two cards side by side, note), edited with forms and a small visual text
 * editor, and written back as the same markup (classes ip-*, styles in web/src/styles/info.css). Anything it does not know
 * (contacts cards, map, contact form) stays a fixed "special block" that can only be moved or edited as HTML by an expert.
 */
import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------- model

type Item = { icon: string; title: string; text: string };
export type Part =
  | { t: 'text'; html: string }
  | { t: 'h3'; text: string }
  | { t: 'steps'; items: string[] }
  | { t: 'list'; x: boolean; items: string[] }
  | { t: 'tiles'; items: Item[] }
  | { t: 'pay'; items: Item[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'pills'; items: string[] }
  | { t: 'raw'; html: string };
export type Card = { icon: string; title: string; href: string; body: Part[] };
export type Block =
  | { t: 'stats'; items: { v: string; l: string }[] }
  | ({ t: 'card' } & Card)
  | { t: 'pair'; cards: Card[] }
  | { t: 'note'; tone: 'warn' | 'info'; icon: string; html: string }
  | { t: 'raw'; html: string };

const iconOf = (el: Element | null) => el?.querySelector('use')?.getAttribute('href')?.replace('#', '') || '';
const svg = (i: string) => `<svg class="i"><use href="#${i}"/></svg>`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kids = (el: Element) => [...el.children];
/** heading text without its icon */
const textOf = (el: Element | null) => { if (!el) return ''; const c = el.cloneNode(true) as Element; c.querySelectorAll('svg,.ic').forEach((x) => x.remove()); return c.textContent?.trim() || ''; };

function parsePart(el: Element): Part {
  const c = el.classList, tag = el.tagName;
  if (tag === 'P') return { t: 'text', html: el.innerHTML.trim() };
  if (tag === 'H3') return { t: 'h3', text: textOf(el) };
  if (tag === 'OL' && c.contains('ip-steps')) return { t: 'steps', items: kids(el).map((li) => li.innerHTML.trim()) };
  if (tag === 'UL' && c.contains('ip-list')) return { t: 'list', x: c.contains('x'), items: kids(el).map((li) => li.innerHTML.trim()) };
  if (c.contains('ip-tiles')) return { t: 'tiles', items: kids(el).map((d) => ({ icon: iconOf(d.querySelector('.ic')), title: d.querySelector('b')?.innerHTML.trim() || '', text: d.querySelector(':scope > span:not(.ic)')?.innerHTML.trim() || '' })) };
  if (c.contains('ip-pay')) return { t: 'pay', items: kids(el).map((d) => ({ icon: iconOf(d.querySelector('h3')), title: textOf(d.querySelector('h3')), text: d.querySelector('p')?.innerHTML.trim() || '' })) };
  if (tag === 'TABLE') return { t: 'table', head: [...el.querySelectorAll('thead th')].map((x) => x.innerHTML.trim()), rows: [...el.querySelectorAll('tbody tr')].map((r) => [...r.children].map((x) => x.innerHTML.trim())) };
  if (tag === 'DIV' && el.children.length && kids(el).every((x) => x.classList.contains('ip-pill'))) return { t: 'pills', items: kids(el).map((x) => x.innerHTML.trim()) };
  return { t: 'raw', html: el.outerHTML };
}
function parseCard(el: Element): Card | null {
  if (!el.classList.contains('ip-card') || el.querySelector('form,iframe') || el.textContent?.includes('[[form]]')) return null;
  const h2 = el.querySelector(':scope > h2');
  return { icon: iconOf(h2), title: textOf(h2), href: el.tagName === 'A' ? el.getAttribute('href') || '' : '', body: kids(el).filter((x) => x !== h2).map(parsePart) };
}
export function parseBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild!;
  const out: Block[] = [];
  for (const el of kids(root)) {
    const c = el.classList;
    if (c.contains('ip-stats')) out.push({ t: 'stats', items: kids(el).map((s) => ({ v: s.querySelector('b')?.innerHTML.trim() || '', l: s.querySelector('span')?.innerHTML.trim() || '' })) });
    else if (c.contains('ip-note')) out.push({ t: 'note', tone: c.contains('b') ? 'info' : 'warn', icon: iconOf(el), html: el.querySelector(':scope > div')?.innerHTML.trim() || '' });
    else if (c.contains('ip-card') && parseCard(el)) out.push({ t: 'card', ...parseCard(el)! });
    else if (c.contains('ip-2') && kids(el).length && kids(el).every((x) => parseCard(x))) out.push({ t: 'pair', cards: kids(el).map((x) => parseCard(x)!) });
    else out.push({ t: 'raw', html: el.outerHTML });
  }
  return out;
}

function partHtml(p: Part): string {
  switch (p.t) {
    case 'text': return `<p>${p.html}</p>`;
    case 'h3': return `<h3>${esc(p.text)}</h3>`;
    case 'steps': return `<ol class="ip-steps">\n${p.items.map((x) => `    <li>${x}</li>`).join('\n')}\n  </ol>`;
    case 'list': return `<ul class="ip-list${p.x ? ' x' : ''}">\n${p.items.map((x) => `    <li>${x}</li>`).join('\n')}\n  </ul>`;
    case 'tiles': return `<div class="ip-tiles">\n${p.items.map((x) => `    <div class="ip-tile"><span class="ic">${svg(x.icon || 'check')}</span><b>${x.title}</b>${x.text ? `<span>${x.text}</span>` : ''}</div>`).join('\n')}\n  </div>`;
    case 'pay': return `<div class="ip-pay">\n${p.items.map((x) => `    <div><h3>${svg(x.icon || 'card')}${esc(x.title)}</h3><p>${x.text}</p></div>`).join('\n')}\n  </div>`;
    case 'table': return `<table class="ip-table">\n    <thead><tr>${p.head.map((x) => `<th>${x}</th>`).join('')}</tr></thead>\n    <tbody>\n${p.rows.map((r) => `      <tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('\n')}\n    </tbody>\n  </table>`;
    case 'pills': return `<div style="margin-top:14px">${p.items.map((x) => `<span class="ip-pill">${x}</span>`).join('')}</div>`;
    default: return p.html;
  }
}
const cardHtml = (c: Card) => {
  const open = c.href ? `<a class="ip-card" href="${esc(c.href)}" style="text-decoration:none;color:inherit">` : '<div class="ip-card">';
  return `${open}\n  <h2><span class="ic">${svg(c.icon || 'ix-info')}</span>${esc(c.title)}</h2>\n${c.body.map((p) => `  ${partHtml(p)}`).join('\n')}\n${c.href ? '</a>' : '</div>'}`;
};
export function blocksHtml(bs: Block[]): string {
  return bs.map((b) => {
    switch (b.t) {
      case 'stats': return `<div class="ip-stats">\n${b.items.map((x) => `  <div class="ip-stat"><b>${x.v}</b><span>${x.l}</span></div>`).join('\n')}\n</div>`;
      case 'card': return cardHtml(b);
      case 'pair': return `<div class="ip-2">\n${b.cards.map(cardHtml).join('\n')}\n</div>`;
      case 'note': return `<div class="ip-note${b.tone === 'info' ? ' b' : ''}">${svg(b.icon || (b.tone === 'info' ? 'ix-info' : 'ix-alert'))}<div>${b.html}</div></div>`;
      default: return b.html;
    }
  }).join('\n');
}

// ---------------------------------------------------------------- texts (RU / EN admin)

const TX = {
  stats: ['Цифры в ряд', 'Numbers row'], card: ['Карточка', 'Card'], pair: ['Две карточки рядом', 'Two cards side by side'],
  note: ['Заметка (цветная плашка)', 'Note (coloured box)'], raw: ['Особый блок (форма, карта, контакты)', 'Special block (form, map, contacts)'],
  text: ['Абзац', 'Paragraph'], h3: ['Подзаголовок', 'Subheading'], steps: ['Шаги 1-2-3', 'Steps 1-2-3'], list: ['Список с галочками', 'Checklist'],
  tiles: ['Плитки с иконками', 'Icon tiles'], pay: ['Пункты с иконкой и текстом', 'Items with icon and text'], table: ['Таблица', 'Table'],
  pills: ['Метки (ArCa, VISA…)', 'Labels (ArCa, VISA…)'],
  add: ['+ Добавить блок', '+ Add block'], addPart: ['+ Добавить в карточку', '+ Add to card'], addItem: ['+ пункт', '+ item'],
  addRow: ['+ строка', '+ row'], addCol: ['+ столбец', '+ column'], delCol: ['− столбец', '− column'],
  up: ['Выше', 'Up'], down: ['Ниже', 'Down'], dup: ['Копия', 'Duplicate'], del: ['Удалить', 'Delete'], sure: ['Удалить этот блок?', 'Delete this block?'],
  icon: ['Иконка', 'Icon'], title: ['Заголовок', 'Heading'], link: ['Ссылка карточки (необязательно)', 'Card link (optional)'],
  value: ['Число / слово', 'Number / word'], label: ['Подпись', 'Label'], cross: ['красные крестики (запрещено)', 'red crosses (not allowed)'],
  tone: ['Цвет', 'Colour'], warn: ['жёлтая — внимание', 'yellow — attention'], info: ['синяя — информация', 'blue — information'],
  tileT: ['Заголовок плитки', 'Tile heading'], tileX: ['Текст (необязательно)', 'Text (optional)'],
  rawNote: ['Этот блок собран вручную (контакты, карта, форма обратной связи). Его можно двигать; править — только в режиме HTML.', 'This block is hand-made (contacts, map, contact form). It can be moved; edit it only in HTML mode.'],
  bold: ['Жирный', 'Bold'], italic: ['Курсив', 'Italic'], mkLink: ['Ссылка', 'Link'], unlink: ['Убрать ссылку', 'Remove link'], clear: ['Убрать оформление', 'Clear formatting'],
  linkAsk: ['Адрес ссылки: /delivery, https://…, tel:+374…, mailto:…', 'Link address: /delivery, https://…, tel:+374…, mailto:…'],
  pick: ['Выберите иконку', 'Choose an icon'],
} as const;
type K = keyof typeof TX;
let LANG: 'ru' | 'en' = 'ru';
const tx = (k: K) => TX[k][LANG === 'ru' ? 0 : 1];

// ---------------------------------------------------------------- small editors

/** Visual text editor (bold, italic, link). No tags visible; output = simple inline HTML (the server cleans it again). */
function Rich({ html, onChange, one }: { html: string; onChange: (v: string) => void; one?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html; }, [html]);
  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); onChange(ref.current!.innerHTML); };
  return (
    <div className="pb-rich">
      <div className="pb-tb" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" title={tx('bold')} onClick={() => cmd('bold')}><b>B</b></button>
        <button type="button" title={tx('italic')} onClick={() => cmd('italic')}><i>I</i></button>
        <button type="button" title={tx('mkLink')} onClick={() => { const u = prompt(tx('linkAsk')); if (u) cmd('createLink', u.trim()); }}>🔗</button>
        <button type="button" title={tx('unlink')} onClick={() => cmd('unlink')}>⛓̸</button>
        <button type="button" title={tx('clear')} onClick={() => cmd('removeFormat')}>⌫</button>
      </div>
      <div ref={ref} className={`pb-ed${one ? ' one' : ''}`} contentEditable suppressContentEditableWarning
        onInput={() => onChange(ref.current!.innerHTML.replace(/<div>/g, '<br>').replace(/<\/div>/g, ''))}
        onKeyDown={(e) => { if (one && e.key === 'Enter') e.preventDefault(); }}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }} />
    </div>
  );
}

function IconPick({ value, icons, onChange }: { value: string; icons: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="pb-ic">
      <button type="button" className="pb-icb" title={tx('icon')} onClick={() => setOpen(!open)}><svg className="pb-svg"><use href={`#${value || 'ix-info'}`} /></svg></button>
      {open ? (
        <div className="pb-icl" onMouseLeave={() => setOpen(false)}>
          <small>{tx('pick')}</small>
          <div>{icons.map((i) => <button type="button" key={i} title={i} className={i === value ? 'on' : ''} onClick={() => { onChange(i); setOpen(false); }}><svg className="pb-svg"><use href={`#${i}`} /></svg></button>)}</div>
        </div>
      ) : null}
    </span>
  );
}

/** ↑ ↓ ⧉ × buttons for an element of a list */
function Tools<T>({ list, i, set, sure }: { list: T[]; i: number; set: (v: T[]) => void; sure?: boolean }) {
  const mv = (d: number) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); set(n); };
  return (
    <span className="pb-tools">
      <button type="button" title={tx('up')} disabled={i === 0} onClick={() => mv(-1)}>↑</button>
      <button type="button" title={tx('down')} disabled={i === list.length - 1} onClick={() => mv(1)}>↓</button>
      <button type="button" title={tx('dup')} onClick={() => { const n = [...list]; n.splice(i + 1, 0, structuredClone(list[i])); set(n); }}>⧉</button>
      <button type="button" title={tx('del')} className="danger" onClick={() => { if (!sure || confirm(tx('sure'))) set(list.filter((_, j) => j !== i)); }}>×</button>
    </span>
  );
}
const upd = <T,>(list: T[], i: number, v: T) => list.map((x, j) => (j === i ? v : x));

/** list of rich-text lines (steps, checklist, labels) */
function Lines({ items, set }: { items: string[]; set: (v: string[]) => void }) {
  return (
    <div className="pb-lines">
      {items.map((x, i) => (
        <div key={i} className="pb-line"><span className="pb-n">{i + 1}</span><Rich one html={x} onChange={(v) => set(upd(items, i, v))} /><Tools list={items} i={i} set={set} /></div>
      ))}
      <button type="button" className="pb-add" onClick={() => set([...items, ''])}>{tx('addItem')}</button>
    </div>
  );
}

const NEW_PART: Record<Part['t'], () => Part> = {
  text: () => ({ t: 'text', html: '' }), h3: () => ({ t: 'h3', text: '' }), steps: () => ({ t: 'steps', items: [''] }),
  list: () => ({ t: 'list', x: false, items: [''] }), tiles: () => ({ t: 'tiles', items: [{ icon: 'check', title: '', text: '' }] }),
  pay: () => ({ t: 'pay', items: [{ icon: 'card', title: '', text: '' }] }), table: () => ({ t: 'table', head: ['', ''], rows: [['', '']] }),
  pills: () => ({ t: 'pills', items: [''] }), raw: () => ({ t: 'raw', html: '' }),
};

function PartEd({ p, set, icons }: { p: Part; set: (v: Part) => void; icons: string[] }) {
  switch (p.t) {
    case 'text': return <Rich html={p.html} onChange={(html) => set({ ...p, html })} />;
    case 'h3': return <input className="pb-h3" value={p.text} onChange={(e) => set({ ...p, text: e.target.value })} />;
    case 'steps': return <Lines items={p.items} set={(items) => set({ ...p, items })} />;
    case 'pills': return <Lines items={p.items} set={(items) => set({ ...p, items })} />;
    case 'list': return <>
      <label className="pb-chk"><input type="checkbox" checked={p.x} onChange={(e) => set({ ...p, x: e.target.checked })} /> {tx('cross')}</label>
      <Lines items={p.items} set={(items) => set({ ...p, items })} />
    </>;
    case 'tiles': case 'pay': return (
      <div className="pb-lines">
        {p.items.map((x, i) => (
          <div key={i} className="pb-tile">
            <IconPick value={x.icon} icons={icons} onChange={(icon) => set({ ...p, items: upd(p.items, i, { ...x, icon }) })} />
            <div style={{ flex: 1, display: 'grid', gap: 4 }}>
              <input placeholder={tx('tileT')} value={p.t === 'tiles' ? x.title.replace(/<[^>]+>/g, '') : x.title} onChange={(e) => set({ ...p, items: upd(p.items, i, { ...x, title: e.target.value }) })} />
              <Rich html={x.text} onChange={(text) => set({ ...p, items: upd(p.items, i, { ...x, text }) })} />
            </div>
            <Tools list={p.items} i={i} set={(items) => set({ ...p, items })} />
          </div>
        ))}
        <button type="button" className="pb-add" onClick={() => set({ ...p, items: [...p.items, { icon: p.t === 'pay' ? 'card' : 'check', title: '', text: '' }] })}>{tx('addItem')}</button>
      </div>
    );
    case 'table': {
      const cols = p.head.length;
      return (
        <div className="pb-table">
          <table><tbody>
            <tr>{p.head.map((h, j) => <th key={j}><input value={h.replace(/<[^>]+>/g, '')} onChange={(e) => set({ ...p, head: upd(p.head, j, e.target.value) })} /></th>)}<th /></tr>
            {p.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}><input value={c.replace(/<[^>]+>/g, '')} onChange={(e) => set({ ...p, rows: upd(p.rows, i, upd(r, j, e.target.value)) })} /></td>)}
                <td><Tools list={p.rows} i={i} set={(rows) => set({ ...p, rows })} /></td></tr>
            ))}
          </tbody></table>
          <button type="button" className="pb-add" onClick={() => set({ ...p, rows: [...p.rows, Array(cols).fill('')] })}>{tx('addRow')}</button>{' '}
          <button type="button" className="pb-add" onClick={() => set({ ...p, head: [...p.head, ''], rows: p.rows.map((r) => [...r, '']) })}>{tx('addCol')}</button>{' '}
          {cols > 1 ? <button type="button" className="pb-add" onClick={() => set({ ...p, head: p.head.slice(0, -1), rows: p.rows.map((r) => r.slice(0, -1)) })}>{tx('delCol')}</button> : null}
        </div>
      );
    }
    default: return <p className="muted small">{tx('rawNote')}</p>;
  }
}

function AddMenu<T extends string>({ label, kinds, onAdd }: { label: string; kinds: T[]; onAdd: (k: T) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pb-addm">
      <button type="button" className="pb-add" onClick={() => setOpen(!open)}>{label}</button>
      {open ? <div className="pb-menu">{kinds.map((k) => <button type="button" key={k} onClick={() => { onAdd(k); setOpen(false); }}>{tx(k as K)}</button>)}</div> : null}
    </div>
  );
}

function CardEd({ c, set, icons }: { c: Card; set: (v: Card) => void; icons: string[] }) {
  return (
    <div className="pb-card">
      <div className="pb-row">
        <IconPick value={c.icon} icons={icons} onChange={(icon) => set({ ...c, icon })} />
        <input className="pb-title" placeholder={tx('title')} value={c.title} onChange={(e) => set({ ...c, title: e.target.value })} />
      </div>
      {c.href ? <label className="pb-small">{tx('link')}<input value={c.href} onChange={(e) => set({ ...c, href: e.target.value })} /></label> : null}
      {c.body.map((p, i) => (
        <div key={i} className="pb-part">
          <div className="pb-ph"><small>{tx(p.t as K)}</small><Tools list={c.body} i={i} set={(body) => set({ ...c, body })} /></div>
          <PartEd p={p} icons={icons} set={(v) => set({ ...c, body: upd(c.body, i, v) })} />
        </div>
      ))}
      <AddMenu label={tx('addPart')} kinds={['text', 'h3', 'list', 'steps', 'tiles', 'pay', 'table', 'pills'] as Part['t'][]} onAdd={(k) => set({ ...c, body: [...c.body, NEW_PART[k]()] })} />
    </div>
  );
}

const NEW_CARD = (): Card => ({ icon: 'ix-info', title: '', href: '', body: [{ t: 'text', html: '' }] });
const NEW_BLOCK: Record<'stats' | 'card' | 'pair' | 'note', () => Block> = {
  stats: () => ({ t: 'stats', items: [{ v: '', l: '' }, { v: '', l: '' }] }),
  card: () => ({ t: 'card', ...NEW_CARD() }),
  pair: () => ({ t: 'pair', cards: [NEW_CARD(), NEW_CARD()] }),
  note: () => ({ t: 'note', tone: 'info', icon: 'ix-info', html: '' }),
};

// ---------------------------------------------------------------- the constructor

export function PageBuilder({ html, onChange, icons, lang }: { html: string; onChange: (v: string) => void; icons: string[]; lang: 'ru' | 'en' }) {
  LANG = lang;
  const [bs, setBs] = useState<Block[]>(() => parseBlocks(html));
  const last = useRef(html);
  // outside change (other page / language / reset / HTML mode) → parse again
  useEffect(() => { if (html !== last.current) { last.current = html; setBs(parseBlocks(html)); } }, [html]);
  const set = (n: Block[]) => { setBs(n); const h = blocksHtml(n); last.current = h; onChange(h); };
  return (
    <div className="pb">
      {bs.map((b, i) => (
        <section key={i} className={`pb-b pb-${b.t}`}>
          <div className="pb-bh"><b>{tx(b.t as K)}</b><Tools list={bs} i={i} set={set} sure /></div>
          {b.t === 'stats' ? (
            <div className="pb-lines">
              {b.items.map((x, j) => (
                <div key={j} className="pb-line">
                  <input style={{ width: 130 }} placeholder={tx('value')} value={x.v.replace(/<[^>]+>/g, '')} onChange={(e) => set(upd(bs, i, { ...b, items: upd(b.items, j, { ...x, v: e.target.value }) }))} />
                  <input style={{ flex: 1 }} placeholder={tx('label')} value={x.l.replace(/<[^>]+>/g, '')} onChange={(e) => set(upd(bs, i, { ...b, items: upd(b.items, j, { ...x, l: e.target.value }) }))} />
                  <Tools list={b.items} i={j} set={(items) => set(upd(bs, i, { ...b, items }))} />
                </div>
              ))}
              {b.items.length < 6 ? <button type="button" className="pb-add" onClick={() => set(upd(bs, i, { ...b, items: [...b.items, { v: '', l: '' }] }))}>{tx('addItem')}</button> : null}
            </div>
          ) : b.t === 'card' ? (
            <CardEd c={b} icons={icons} set={(c) => set(upd(bs, i, { t: 'card', ...c }))} />
          ) : b.t === 'pair' ? (
            <div className="pb-pair">{b.cards.map((c, j) => <CardEd key={j} c={c} icons={icons} set={(v) => set(upd(bs, i, { ...b, cards: upd(b.cards, j, v) }))} />)}</div>
          ) : b.t === 'note' ? (
            <>
              <div className="pb-row">
                <IconPick value={b.icon} icons={icons} onChange={(icon) => set(upd(bs, i, { ...b, icon }))} />
                <select value={b.tone} onChange={(e) => set(upd(bs, i, { ...b, tone: e.target.value as 'warn' | 'info' }))}>
                  <option value="info">{tx('info')}</option><option value="warn">{tx('warn')}</option>
                </select>
              </div>
              <Rich html={b.html} onChange={(v) => set(upd(bs, i, { ...b, html: v }))} />
            </>
          ) : <p className="muted small">{tx('rawNote')}</p>}
        </section>
      ))}
      <AddMenu label={tx('add')} kinds={['card', 'pair', 'stats', 'note'] as ('card' | 'pair' | 'stats' | 'note')[]} onAdd={(k) => set([...bs, NEW_BLOCK[k]()])} />
    </div>
  );
}
