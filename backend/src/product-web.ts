/**
 * Admin: a product's web fields (plan step 8) — PATCH /api/admin/products/:id/web
 *   { isVisible?, slug?, web?: { desc, title, meta: { hy, ru, en } }, oldPrice?: number|null (֏), specEdit?: { key: value|'' } }
 * Access fields are never touched (read-only). Every change → change_log (entity 'product_web'); the storefront is refreshed.
 * GET …/web/specs → what the name parser reads (the admin shows parsed vs corrected values) + the list of spec keys.
 */
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from './auth';
import { parseSpecs, SPECS, SPEC_KEYS } from './specs';
import { revalidateSite } from './revalidate';
import { dropSpecEdits } from './spec-edits';

type Req = { user?: { email?: string } };
const LANGS = ['hy', 'ru', 'en'] as const;
const KINDS = ['desc', 'title', 'meta'] as const;
const MAX = { desc: 20000, title: 120, meta: 300 };
const JSON_COLS = new Set(['web', 'spec_edit']);

@Controller('admin/products')
@UseGuards(JwtGuard)
export class ProductWebController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get(':id/web/specs')
  async specs(@Param('id', ParseIntPipe) id: number) {
    const [p] = await this.ds.query(`SELECT name FROM products WHERE id = $1`, [id]);
    if (!p) throw new NotFoundException();
    return { parsed: parseSpecs(p.name), keys: SPEC_KEYS.map((k) => ({ k, names: SPECS[k].names, group: SPECS[k].group })) };
  }

  @Patch(':id/web')
  async save(@Param('id', ParseIntPipe) id: number, @Body() b: Record<string, unknown>, @Req() req: Req) {
    const [p] = await this.ds.query(`SELECT id, external_id, name, is_visible, slug, web, old_price, spec_edit FROM products WHERE id = $1`, [id]);
    if (!p) throw new NotFoundException();
    const set: Record<string, unknown> = {};
    if (b.isVisible !== undefined) set.is_visible = !!b.isVisible;
    if (b.slug !== undefined) {
      const s = String(b.slug || '').trim().toLowerCase();
      if (s && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) throw new BadRequestException('Slug: latin letters, digits and "-" only');
      if (s) {
        const [dup] = await this.ds.query(`SELECT 1 FROM products WHERE slug = $1 AND id <> $2`, [s, id]);
        if (dup) throw new BadRequestException('Slug is used by another product');
      }
      set.slug = s || null;
    }
    if (b.web !== undefined) {
      const w = (b.web || {}) as Record<string, Record<string, unknown>>;
      const out: Record<string, Record<string, string>> = {};
      for (const k of KINDS) for (const l of LANGS) {
        const v = String(w?.[k]?.[l] ?? '').trim().slice(0, MAX[k]);
        if (v) (out[k] ||= {})[l] = v;
      }
      set.web = out;
    }
    if (b.oldPrice !== undefined) {
      const n = b.oldPrice === null || b.oldPrice === '' ? null : Math.round(Number(b.oldPrice));
      if (n !== null && !(n > 0)) throw new BadRequestException('Old price must be a positive number');
      set.old_price = n;
    }
    if (b.specEdit !== undefined) {
      const e = (b.specEdit || {}) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(e)) if (SPECS[k]) out[k] = String(v ?? '').trim().slice(0, 80);
      set.spec_edit = out;
    }
    const cols = Object.keys(set);
    if (!cols.length) return { ok: true };
    await this.ds.query(
      `UPDATE products SET ${cols.map((c, i) => `${c} = $${i + 2}${JSON_COLS.has(c) ? '::jsonb' : ''}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [id, ...cols.map((c) => (JSON_COLS.has(c) ? JSON.stringify(set[c]) : set[c]))]);
    const changes: Record<string, [unknown, unknown]> = {};
    for (const c of cols) {
      const before = p[c] ?? null, after = set[c] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after) && String(before ?? '') !== String(after ?? '')) changes[c] = [before, after];
    }
    if (Object.keys(changes).length) {
      await this.ds.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('product_web', 'updated', $1, $2, $3)`,
        [p.external_id, p.name, JSON.stringify({ ...changes, by: [null, req.user?.email ?? 'admin'] })]);
    }
    if (set.spec_edit !== undefined) dropSpecEdits();
    revalidateSite(['products']);
    return { ok: true };
  }
}
