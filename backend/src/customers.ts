import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Res, NotFoundException, Param, ParseIntPipe, Patch, Post,
  Query, Req, UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { COOKIE, COOKIE_PATH } from './shop';
import { DataSource } from 'typeorm';
import { JwtGuard } from './auth';
import { hashCustomerPassword } from './legacy';

const SORTS: Record<string, string> = {
  name: 'c.name', registered: 'c.registered_at', lastOrder: '"lastOrderAt"', orders: '"orderCount"', spent: '"totalSpent"', id: 'c.id',
};
/** Fields an admin may change. */
const EDITABLE = ['name', 'email', 'login', 'phone', 'address', 'postal_code', 'city', 'country', 'type', 'company',
  'law_name', 'law_address', 'factual_address', 'taxcode', 'bankinfo', 'confirmed', 'blocked', 'blocked_reason', 'admin_note'];
const BOOL = new Set(['confirmed', 'blocked']);

const CUSTOMER_COLS = `c.id, c.legacy_id AS "legacyId", c.name, c.email, c.login, c.phone, c.address, c.postal_code AS "postalCode",
  c.city, c.country, c.type, c.company, c.law_name AS "lawName", c.law_address AS "lawAddress",
  c.factual_address AS "factualAddress", c.taxcode, c.bankinfo, c.password_scheme AS "passwordScheme", c.confirmed, c.blocked,
  c.blocked_reason AS "blockedReason", c.admin_note AS "adminNote", c.registered_at AS "registeredAt",
  c.last_visit_at AS "lastVisitAt", c.last_login_at AS "lastLoginAt", c.edited_at AS "editedAt"`;

@Controller('admin/customers')
@UseGuards(JwtGuard)
export class CustomersController {
  constructor(@InjectDataSource() private ds: DataSource, private jwt: JwtService) {}

  @Get()
  async list(@Query() q: Record<string, string>) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const where: string[] = ['TRUE'];
    const args: unknown[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      args.push(`%${s}%`);
      const p = `$${args.length}`;
      args.push(s.replace(/\D/g, '') ? `%${s.replace(/\D/g, '')}%` : '');
      const d = `$${args.length}`;
      args.push(s);
      const e = `$${args.length}`;
      where.push(`(c.name ILIKE ${p} OR c.email ILIKE ${p} OR c.login ILIKE ${p} OR c.company ILIKE ${p} OR c.taxcode ILIKE ${p}
        OR (${d} <> '' AND regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') LIKE ${d})
        OR c.id::text = ${e} OR c.legacy_id::text = ${e})`);
    }
    if (q.type) { args.push(q.type); where.push(`c.type = $${args.length}`); }
    if (q.status === 'blocked') where.push('c.blocked');
    if (q.status === 'active') where.push('NOT c.blocked AND c.confirmed');
    if (q.status === 'unconfirmed') where.push('NOT c.confirmed');
    if (q.orders === '1') where.push('EXISTS (SELECT 1 FROM customer_orders o WHERE o.customer_id = c.id)');
    const w = where.join(' AND ');
    const [{ n }] = await this.ds.query(`SELECT COUNT(*)::int AS n FROM customers c WHERE ${w}`, args);
    const sort = SORTS[q.sort] || 'c.registered_at';
    const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
    const items = await this.ds.query(`
      SELECT c.id, c.legacy_id AS "legacyId", c.name, c.email, c.login, c.phone, c.city, c.type, c.company,
             c.confirmed, c.blocked, c.registered_at AS "registeredAt",
             COALESCE(o.n, 0)::int AS "orderCount", COALESCE(o.spent, 0)::float AS "totalSpent", o.last AS "lastOrderAt"
      FROM customers c
      LEFT JOIN (SELECT customer_id, COUNT(*) AS n, SUM(total) AS spent, MAX(ordered_at) AS last
                 FROM customer_orders GROUP BY customer_id) o ON o.customer_id = c.id
      WHERE ${w}
      ORDER BY ${sort} ${dir} NULLS LAST, c.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, args);
    return { items, total: n, page, limit };
  }

  @Get('stats')
  async stats() {
    const [row] = await this.ds.query(`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE blocked)::int AS blocked,
             COUNT(*) FILTER (WHERE NOT confirmed)::int AS unconfirmed,
             COUNT(*) FILTER (WHERE password_scheme = 'reset')::int AS "needReset",
             (SELECT COUNT(*)::int FROM customer_orders) AS orders
      FROM customers`);
    const imports = await this.ds.query(`SELECT id, at, file, stats, error FROM customer_import_log ORDER BY id DESC LIMIT 10`);
    return { ...row, imports };
  }

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number) {
    const [c] = await this.ds.query(`SELECT ${CUSTOMER_COLS} FROM customers c WHERE c.id = $1`, [id]);
    if (!c) throw new NotFoundException();
    const orders = await this.ds.query(`
      SELECT o.id, o.legacy_id AS "legacyId", o.source, o.ordered_at AS "orderedAt", o.contact_person AS "contactPerson",
             o.contact_phone AS "contactPhone", o.contact_email AS "contactEmail", o.country, o.city, o.address,
             o.address_extra AS "addressExtra", o.total::float AS total, o.shipping, o.shipping_cost::float AS "shippingCost",
             o.currency, o.payment_type AS "paymentType", o.shop_address AS "shopAddress", o.status, o.paid, o.paid_at AS "paidAt",
             COALESCE((SELECT json_agg(json_build_object(
               'id', i.id, 'article', i.article, 'name', i.name, 'price', i.price::float, 'qty', i.qty, 'total', i.total::float,
               'currency', i.currency, 'productId', p.id, 'productName', p.name, 'productDeleted', p.deleted_at IS NOT NULL
             ) ORDER BY i.id) FROM customer_order_items i LEFT JOIN products p ON p.external_id = i.product_external_id
             WHERE i.order_id = o.id), '[]') AS items
      FROM customer_orders o WHERE o.customer_id = $1 ORDER BY o.ordered_at DESC NULLS LAST, o.id DESC`, [id]);
    const favorites = await this.ds.query(`
      SELECT f.article, f.name, p.id AS "productId", p.name AS "productName"
      FROM customer_favorites f LEFT JOIN products p ON p.external_id = f.product_external_id
      WHERE f.customer_id = $1 ORDER BY f.name`, [id]);
    const history = await this.ds.query(`
      SELECT id, at, action, changes FROM change_log WHERE entity = 'customer' AND external_id = $1 ORDER BY id DESC LIMIT 50`, [id]);
    return { ...c, orders, favorites, history };
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @Req() req: { user: { email: string } }) {
    const [cur] = await this.ds.query(`SELECT * FROM customers WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException();
    const sets: string[] = [];
    const args: unknown[] = [id];
    const changes: Record<string, [unknown, unknown]> = {};
    for (const k of EDITABLE) {
      if (!(k in (body || {}))) continue;
      let v = body[k];
      if (BOOL.has(k)) v = v === true || v === 'true' || v === 1;
      else v = v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim();
      if (k === 'name' && !v) v = '';
      if (k === 'type' && !['consumer', 'dealer', 'corporate'].includes(String(v))) throw new BadRequestException('Bad type');
      if (v === cur[k]) continue;
      changes[k] = [cur[k], v];
      args.push(v);
      sets.push(`${k} = $${args.length}`);
    }
    if (!sets.length) return this.one(id);
    if ('blocked' in changes && !changes.blocked[1]) sets.push('blocked_reason = NULL');
    await this.ds.query(`UPDATE customers SET ${sets.join(', ')}, edited_at = now(), updated_at = now() WHERE id = $1`, args);
    await this.ds.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('customer', $1, $2, $3, $4)`,
      ['updated', id, cur.name, JSON.stringify({ ...changes, by: [null, req.user?.email ?? 'admin'] })]);
    return this.one(id);
  }

  /** Admin sets a new password for the customer (e.g. on a phone call). */
  @Post(':id/password')
  async setPassword(@Param('id', ParseIntPipe) id: number, @Body() body: { password?: string }, @Req() req: { user: { email: string } }) {
    const pw = String(body?.password || '');
    if (pw.length < 6) throw new BadRequestException('Password must be at least 6 characters');
    const [cur] = await this.ds.query(`SELECT name FROM customers WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException();
    await this.ds.query(`UPDATE customers SET password_hash = $2, password_scheme = 'bcrypt', edited_at = now(), updated_at = now()
      WHERE id = $1`, [id, await hashCustomerPassword(pw)]);
    await this.ds.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('customer', $1, $2, $3, $4)`,
      ['updated', id, cur.name, JSON.stringify({ password: ['•••', '•••'], by: [null, req.user?.email ?? 'admin'] })]);
    return { ok: true };
  }

  /** "Log in as this customer": sets the storefront session cookie in the admin's browser (2 h, ends with the browser).
   *  Admin role only, not logged (owner's decision 2026-11-22); the site shows a banner and the customer's last-login date is not touched. */
  @Post(':id/login-as')
  async loginAs(@Param('id', ParseIntPipe) id: number, @Req() req: Request & { user: { email: string; role: string } },
    @Res({ passthrough: true }) res: Response) {
    if (req.user?.role !== 'admin') throw new ForbiddenException('Admins only');
    const [c] = await this.ds.query(`SELECT name, blocked, token_version FROM customers WHERE id = $1`, [id]);
    if (!c) throw new NotFoundException();
    if (c.blocked) throw new BadRequestException('Customer is blocked — unblock first');
    const token = this.jwt.sign({ sub: id, kind: 'customer', v: c.token_version, imp: req.user.email || 'admin' }, { expiresIn: '2h' });
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: COOKIE_PATH });
    return { ok: true, url: '/account.html' };
  }
}
