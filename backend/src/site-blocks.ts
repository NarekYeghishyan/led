/**
 * Editable site blocks (plan step 8). One JSON document per key in `site_blocks`; for now only 'home':
 *   slides: { mode: 'auto' | 'manual', items: [{ code, tag?: {hy,ru,en} }] }   hero slider (manual = these in-stock products)
 *   quick:  { mode: 'auto' | 'manual', items: [{ style: 'sale'|'srv'|'new', title, sub: {hy,ru,en}, url }] } (max 3)
 *   tabs:   string[]   "Best offers" tabs in order: 'new' and/or section slugs; empty = automatic (New + every section)
 *   hide:   string[]   home blocks not shown (ids in HOME_BLOCKS)
 * Admin: GET/PUT /api/admin/site-blocks/:key (logged in change_log, entity 'site_block'); site: GET /api/shop/blocks/:key.
 * 'info': { [page]: { [hy|ru|en]: { title, h1, lead, html } } } — edited texts of the info pages (empty field = template
 *   text). html goes through html-clean.ts (formatting only).
 * Data is cleaned against a whitelist — nothing but these fields is stored.
 */
import { BadRequestException, Body, Controller, Get, Header, Param, Put, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from './auth';
import { revalidateSite } from './revalidate';
import { cleanHtml } from './html-clean';

type Req = { user?: { email?: string } };
type L3 = Record<'hy' | 'ru' | 'en', string>;
export const HOME_BLOCKS = ['cfgPromo', 'gaming', 'quick', 'stats', 'trust', 'best', 'build', 'credit', 'b2b', 'brands'] as const;
const KEYS = ['home', 'info'] as const;
/** info pages whose texts the admin can edit (the storefront InfoPage keys; login/account pages are forms, not texts) */
export const INFO_PAGES = ['credit', 'about', 'buy', 'order', 'pay', 'delivery', 'warranty', 'exchange', 'contacts'] as const;

const txt = (v: unknown, max = 120): L3 => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { hy: String(o.hy ?? '').trim().slice(0, max), ru: String(o.ru ?? '').trim().slice(0, max), en: String(o.en ?? '').trim().slice(0, max) };
};
const url = (v: unknown) => {
  const s = String(v ?? '').trim().slice(0, 300);
  if (s && !/^(\/(?!\/)|https:\/\/|#)/.test(s)) throw new BadRequestException(`Link must start with "/", "https://" or "#": ${s}`);
  return s;
};

function cleanHome(b: Record<string, unknown>) {
  const s = (b.slides || {}) as Record<string, unknown>, q = (b.quick || {}) as Record<string, unknown>;
  return {
    slides: {
      mode: s.mode === 'manual' ? 'manual' : 'auto',
      items: (Array.isArray(s.items) ? s.items : []).slice(0, 10).map((x: Record<string, unknown>) => ({ code: Math.trunc(Number(x?.code)), tag: txt(x?.tag, 40) }))
        .filter((x) => x.code > 0),
    },
    quick: {
      mode: q.mode === 'manual' ? 'manual' : 'auto',
      items: (Array.isArray(q.items) ? q.items : []).slice(0, 3).map((x: Record<string, unknown>) => ({
        style: ['sale', 'srv', 'new'].includes(String(x?.style)) ? String(x.style) : 'new', title: txt(x?.title, 60), sub: txt(x?.sub, 80), url: url(x?.url),
      })),
    },
    tabs: (Array.isArray(b.tabs) ? b.tabs : []).map((x) => String(x)).filter((x) => /^[a-z0-9-]{1,60}$/.test(x)).slice(0, 12),
    hide: (Array.isArray(b.hide) ? b.hide : []).map((x) => String(x)).filter((x) => (HOME_BLOCKS as readonly string[]).includes(x)),
  };
}

function cleanInfo(b: Record<string, unknown>) {
  const out: Record<string, Record<string, Record<string, string>>> = {};
  for (const pg of INFO_PAGES) {
    const p = (b?.[pg] || {}) as Record<string, Record<string, unknown>>;
    for (const l of ['hy', 'ru', 'en']) {
      const x = p?.[l] || {};
      const v = { title: String(x.title ?? '').trim().slice(0, 120), h1: String(x.h1 ?? '').trim().slice(0, 160),
        lead: String(x.lead ?? '').trim().slice(0, 400), html: cleanHtml(String(x.html ?? '')) };
      const kept = Object.fromEntries(Object.entries(v).filter(([, y]) => y));
      if (Object.keys(kept).length) ((out[pg] ||= {})[l] = kept);
    }
  }
  return out;
}
const clean = (key: string, b: Record<string, unknown>) => (key === 'info' ? cleanInfo(b) : cleanHome(b));

@Controller('admin/site-blocks')
@UseGuards(JwtGuard)
export class SiteBlocksController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get(':key')
  async get(@Param('key') key: string) {
    if (!(KEYS as readonly string[]).includes(key)) throw new BadRequestException('Unknown block');
    const [r] = await this.ds.query(`SELECT data, updated_at AS "updatedAt", updated_by AS "updatedBy" FROM site_blocks WHERE key = $1`, [key]);
    return { data: clean(key, r?.data || {}), updatedAt: r?.updatedAt ?? null, updatedBy: r?.updatedBy ?? null, blocks: HOME_BLOCKS, pages: INFO_PAGES };
  }

  @Put(':key')
  async put(@Param('key') key: string, @Body() b: Record<string, unknown>, @Req() req: Req) {
    if (!(KEYS as readonly string[]).includes(key)) throw new BadRequestException('Unknown block');
    const data = clean(key, b || {});
    const who = req.user?.email ?? 'admin';
    const [old] = await this.ds.query(`SELECT data FROM site_blocks WHERE key = $1`, [key]);
    await this.ds.query(
      `INSERT INTO site_blocks (key, data, updated_at, updated_by) VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by`, [key, JSON.stringify(data), who]);
    await this.ds.query(`INSERT INTO change_log (entity, action, name, changes) VALUES ('site_block', 'updated', $1, $2)`,
      [key, JSON.stringify({ data: [old?.data ?? null, data], by: [null, who] })]);
    revalidateSite(['blocks']);
    return { data };
  }
}

@Controller('shop/blocks')
export class SiteBlocksPublicController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get(':key')
  @Header('Cache-Control', 'public, max-age=30')
  async get(@Param('key') key: string) {
    if (!(KEYS as readonly string[]).includes(key)) throw new BadRequestException('Unknown block');
    const [r] = await this.ds.query(`SELECT data FROM site_blocks WHERE key = $1`, [key]);
    return clean(key, r?.data || {});
  }
}
