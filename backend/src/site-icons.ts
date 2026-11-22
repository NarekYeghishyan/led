/**
 * Category icons (/api/admin/site-icons). Built-in icons = the static site's sprite (read-only); admins add their own SVG.
 * Uploaded SVG is rebuilt from a whitelist (shapes + presentation attributes only): no scripts, styles, links, images or
 * event handlers can reach the site. The site renders icons as <symbol> + <use> inside `svg.i` (stroke = currentColor).
 */
import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from './auth';
import { slugify } from './site-categories';

const SHAPES = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g']);
/** Elements dropped together with everything inside them. */
const DROP = new Set(['script', 'style', 'defs', 'title', 'desc', 'metadata', 'clippath', 'mask', 'pattern', 'lineargradient',
  'radialgradient', 'filter', 'foreignobject', 'image', 'use', 'symbol', 'text', 'a', 'switch', 'marker', 'iframe']);
const ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'fill', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'transform', 'opacity',
  'fill-opacity', 'stroke-opacity']);
const COLOR_ATTRS = new Set(['fill', 'stroke']);
const MAX_SVG = 60_000;

export interface CleanOpts { fill?: boolean; mono?: boolean }

/** Whitelist rebuild of an SVG file → { viewBox, body } for a <symbol>. Throws on anything that is not a usable icon. */
export function cleanSvg(src: string, o: CleanOpts = {}) {
  const svg = String(src || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>/gi, '');
  if (!svg.trim()) throw new BadRequestException('Empty SVG');
  if (svg.length > MAX_SVG) throw new BadRequestException('SVG is too big (max 60 KB)');
  const root = /<svg\b([^>]*)>/i.exec(svg);
  if (!root) throw new BadRequestException('Not an SVG (no <svg> tag)');
  const ra = attrs(root[1]);
  let viewBox = (ra.viewbox || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(viewBox)) {
    const w = parseFloat(ra.width), h = parseFloat(ra.height);
    viewBox = w > 0 && h > 0 ? `0 0 ${w} ${h}` : '0 0 24 24';
  }
  // root-level paint (e.g. <svg fill="none" stroke="currentColor">) is applied to a wrapping <g>
  const rootPaint: Record<string, string> = {};
  for (const k of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule']) if (ra[k]) rootPaint[k] = ra[k];
  Object.assign(rootPaint, styleAttrs(ra.style));

  const end = svg.toLowerCase().lastIndexOf('</svg>');
  const inner = svg.slice(root.index + root[0].length, end > root.index ? end : undefined);
  const out: string[] = [];
  let skip = 0; // depth inside a dropped element
  const open: string[] = [];
  for (const m of inner.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, rawName, rawAttrs, selfClose] = m;
    const name = rawName.toLowerCase().replace(/^svg:/, '');
    if (close) {
      if (skip) { if (DROP.has(name)) skip--; continue; }
      if (SHAPES.has(name) && open[open.length - 1] === name) { open.pop(); out.push(`</${name}>`); }
      continue;
    }
    if (DROP.has(name)) { if (!selfClose) skip++; continue; }
    if (skip) continue;
    if (!SHAPES.has(name)) continue;
    const a = { ...attrs(rawAttrs) };
    Object.assign(a, styleAttrs(a.style));
    const kept = Object.entries(a).filter(([k, v]) => ATTRS.has(k) && safeValue(v))
      .map(([k, v]) => [k, o.mono && COLOR_ATTRS.has(k) && !/^(none|transparent|currentcolor)$/i.test(v) ? 'currentColor' : v]);
    out.push(`<${name}${kept.map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}${selfClose ? '/' : ''}>`);
    if (!selfClose) open.push(name);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  let body = out.join('');
  if (!/<(path|circle|rect|line|polyline|polygon|ellipse)\b/.test(body)) throw new BadRequestException('No drawable shapes found in the SVG');
  const paint = Object.entries(rootPaint).filter(([k, v]) => ATTRS.has(k) && safeValue(v))
    .map(([k, v]) => [k, o.mono && COLOR_ATTRS.has(k) && !/^(none|transparent|currentcolor)$/i.test(v) ? 'currentColor' : v]);
  if (o.fill) { // filled icon: paint with the text colour instead of the site's stroke style
    const p = Object.fromEntries(paint);
    p.fill = p.fill && p.fill !== 'none' ? p.fill : 'currentColor';
    p.stroke = p.stroke || 'none';
    body = `<g${Object.entries(p).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')}>${body}</g>`;
  } else if (paint.length) body = `<g${paint.map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}>${body}</g>`;
  if (body.length > 40_000) throw new BadRequestException('Icon is too complex');
  return { viewBox, body };
}

function attrs(s: string) {
  const r: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) r[m[1].toLowerCase()] = (m[3] ?? m[4] ?? '').trim();
  return r;
}
function styleAttrs(style?: string) {
  const r: Record<string, string> = {};
  for (const d of String(style || '').split(';')) {
    const i = d.indexOf(':');
    if (i > 0) { const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim(); if (ATTRS.has(k)) r[k] = v; }
  }
  return r;
}
const safeValue = (v: string) => v.length < 20_000 && !/url\s*\(|javascript:|expression\s*\(|[<>]/i.test(v);
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const COLS = `i.id, i.key, i.name, i.view_box AS "viewBox", i.body, i.builtin, i.updated_at AS "updatedAt",
  (SELECT COUNT(*)::int FROM site_categories c WHERE c.icon = i.key) AS "usedBy"`;

@Controller('admin/site-icons')
@UseGuards(JwtGuard)
export class SiteIconsController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get()
  list() {
    return this.ds.query(`SELECT ${COLS} FROM site_icons i ORDER BY i.builtin, i.id DESC`);
  }

  /** What the icon will look like after cleaning (the admin shows it before saving). */
  @Post('preview')
  preview(@Body() b: { svg?: string; fill?: boolean; mono?: boolean }) {
    return cleanSvg(String(b?.svg || ''), { fill: !!b?.fill, mono: b?.mono !== false });
  }

  @Post()
  async create(@Body() b: { name?: string; svg?: string; fill?: boolean; mono?: boolean }, @Req() req: { user?: { email?: string } }) {
    const name = String(b?.name || '').trim().slice(0, 60);
    if (!name) throw new BadRequestException('Name is required');
    const { viewBox, body } = cleanSvg(String(b?.svg || ''), { fill: !!b?.fill, mono: b?.mono !== false });
    const base = `ci-${slugify(name) || 'icon'}`.slice(0, 40);
    let key = base;
    for (let n = 2; (await this.ds.query(`SELECT 1 FROM site_icons WHERE key = $1`, [key])).length; n++) key = `${base}-${n}`;
    const [row] = await this.ds.query(
      `INSERT INTO site_icons (key, name, view_box, body) VALUES ($1, $2, $3, $4) RETURNING id`, [key, name, viewBox, body]);
    await this.log('created', row.id, name, req);
    return this.one(row.id);
  }

  /** Rename and/or replace the drawing of an added icon (the key stays, so categories keep it). */
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() b: { name?: string; svg?: string; fill?: boolean; mono?: boolean },
    @Req() req: { user?: { email?: string } }) {
    const cur = await this.editable(id);
    const name = b?.name !== undefined ? String(b.name).trim().slice(0, 60) || cur.name : cur.name;
    let { view_box: viewBox, body } = cur;
    if (b?.svg) ({ viewBox, body } = cleanSvg(b.svg, { fill: !!b.fill, mono: b.mono !== false }));
    await this.ds.query(`UPDATE site_icons SET name = $2, view_box = $3, body = $4, updated_at = now() WHERE id = $1`, [id, name, viewBox, body]);
    await this.ds.query(`UPDATE site_categories SET updated_at = now() WHERE icon = $1`, [cur.key]);
    await this.log('updated', id, name, req);
    return this.one(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user?: { email?: string } }) {
    const cur = await this.editable(id);
    const [{ n }] = await this.ds.query(`SELECT COUNT(*)::int AS n FROM site_categories WHERE icon = $1`, [cur.key]);
    if (n) throw new BadRequestException(`The icon is used by ${n} categor${n === 1 ? 'y' : 'ies'} — pick another icon there first`);
    await this.ds.query(`DELETE FROM site_icons WHERE id = $1`, [id]);
    await this.log('deleted', id, cur.name, req);
    return { ok: true };
  }

  private async one(id: number) {
    const [r] = await this.ds.query(`SELECT ${COLS} FROM site_icons i WHERE i.id = $1`, [id]);
    return r;
  }
  private async editable(id: number) {
    const [cur] = await this.ds.query(`SELECT * FROM site_icons WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException();
    if (cur.builtin) throw new BadRequestException('Built-in icons cannot be changed');
    return cur;
  }
  private log(action: string, id: number, name: string, req: { user?: { email?: string } }) {
    return this.ds.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('site_icon', $1, $2, $3, $4)`,
      [action, id, name, JSON.stringify({ by: [null, req.user?.email ?? 'admin'] })]);
  }
}
