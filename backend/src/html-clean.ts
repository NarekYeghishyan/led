/**
 * Whitelist HTML cleaner for admin-edited page texts (site-blocks.ts 'info'). The storefront renders this HTML as is,
 * so only formatting survives: allowed tags + attributes, links only http(s) / tel / mailto / relative / #, iframes only
 * Google Maps, inline style without url()/expression. Everything else (script, style, on* handlers, forms…) is dropped.
 */
const TAGS = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'br', 'hr', 'div', 'span', 'small',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'svg', 'use', 'iframe', 'img']);
const VOID = new Set(['br', 'hr', 'use', 'img']);
const DROP_WITH_CONTENT = /<(script|style|template|noscript|object|embed|form|textarea|select|button)\b[\s\S]*?<\/\1\s*>/gi;
const ATTRS: Record<string, Set<string>> = {
  '*': new Set(['class', 'title', 'style', 'lang', 'colspan', 'rowspan']),
  a: new Set(['href', 'target', 'rel']),
  use: new Set(['href']),
  iframe: new Set(['src', 'title', 'loading', 'referrerpolicy', 'width', 'height', 'allowfullscreen']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function okUrl(tag: string, name: string, v: string) {
  const u = v.trim();
  if (tag === 'use') return /^#[\w-]+$/.test(u);
  if (tag === 'iframe') return /^https:\/\/(www\.)?google\.[a-z.]+\/maps[/?]/i.test(u);
  if (tag === 'img') return /^(https:\/\/|\/(?!\/))/i.test(u);
  return /^(https?:\/\/|mailto:|tel:|viber:|\/(?!\/)|#)/i.test(u) && !/^\s*javascript:/i.test(u);
}

export function cleanHtml(html: string, max = 60000): string {
  let s = String(html || '').slice(0, max).replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, '')
    // iframes other than Google Maps go with their closing tag
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, (m) => (/\ssrc\s*=\s*["']?https:\/\/(www\.)?google\.[a-z.]+\/maps[/?]/i.test(m) ? m : ''));
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|<|>/g, (m, tag: string | undefined, rest: string | undefined) => {
    if (!tag) return m === '<' ? '&lt;' : '&gt;';
    const t = tag.toLowerCase();
    if (!TAGS.has(t)) return '';
    if (m.startsWith('</')) return VOID.has(t) ? '' : `</${t}>`;
    const out: string[] = [];
    const re = /([a-zA-Z_:][-\w:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(rest || ''))) {
      const name = a[1].toLowerCase();
      if (!(ATTRS['*'].has(name) || ATTRS[t]?.has(name))) continue;
      let v = a[2] === undefined ? '' : unesc(a[2].replace(/^["']|["']$/g, ''));
      if ((name === 'href' || name === 'src') && !okUrl(t, name, v)) continue;
      if (name === 'style') { if (/url\s*\(|expression|javascript:|@import|behavior/i.test(v)) continue; v = v.slice(0, 300); }
      if (name === 'target' && v !== '_blank') continue;
      out.push(a[2] === undefined ? name : `${name}="${esc(v)}"`);
    }
    if (t === 'a' && out.some((x) => x.startsWith('target='))) out.push('rel="noopener"');
    if ((t === 'iframe' || t === 'img') && !out.some((x) => x.startsWith('src='))) return '';
    const self = /\/\s*$/.test(rest || '') || VOID.has(t);
    return `<${t}${out.length ? ' ' + [...new Set(out)].join(' ') : ''}${self && t === 'use' ? '/' : ''}>`;
  });
  return s.trim();
}
