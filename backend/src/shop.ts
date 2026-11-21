/**
 * Storefront accounts (/api/shop/*): registration by phone, login (phone / e-mail / old login), logout,
 * password reset by a 6-digit code, profile, saved addresses, password change, order history.
 * Uses the `customers` tables only (old led.am users are already there). The session is an httpOnly cookie
 * holding a JWT with kind = 'customer' — JwtGuard refuses such tokens, so they never open /api/admin.
 */
import {
  CanActivate, Controller, ExecutionContext, Get, HttpException, HttpStatus, Injectable, Patch, Post, Req, Res, UseGuards, Body,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { checkCustomerPassword, hashCustomerPassword } from './legacy';
import { mailConfigured, sendResetCode, smsConfigured } from './mailer';

export const COOKIE = 'led_s';
export const COOKIE_PATH = '/api/shop';
const DAY = 24 * 3600 * 1000;
const PHONE8 = `right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 8)`;

/** Error with a code the site translates (HY/RU/EN). */
const fail = (status: HttpStatus, code: string, message: string) => new HttpException({ statusCode: status, code, message }, status);

/** Armenian number → 8 national digits (91123456), or '' if it is not a phone number. */
export function phone8(v: unknown) {
  const s = String(v ?? '').trim();
  if (!s || /[^\d\s+()\-.]/.test(s)) return '';
  let d = s.replace(/\D/g, '');
  if (d.startsWith('00374')) d = d.slice(5);
  else if (d.startsWith('374') && d.length === 11) d = d.slice(3);
  else if (d.startsWith('0') && d.length === 9) d = d.slice(1);
  return d.length === 8 ? d : '';
}
const fmtPhone = (p8: string) => `+374${p8}`;

// ---------------------------------------------------------------- tiny in-memory rate limiter (one API instance)
const hits = new Map<string, number[]>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw fail(HttpStatus.TOO_MANY_REQUESTS, 'too_many', 'Too many attempts, try again later');
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 20000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600_000)) hits.delete(k);
}
const ip = (req: Request) => req.ip || 'unknown';

function readCookie(req: Request, name: string) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

type CustomerReq = Request & { customerId?: number; adminView?: string };

@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private jwt: JwtService, @InjectDataSource() private ds: DataSource) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<CustomerReq>();
    const token = readCookie(req, COOKIE);
    if (!token) throw fail(HttpStatus.UNAUTHORIZED, 'no_session', 'Not logged in');
    let p: { sub: number; kind: string; v: number; imp?: string };
    try { p = this.jwt.verify(token); } catch { throw fail(HttpStatus.UNAUTHORIZED, 'no_session', 'Not logged in'); }
    if (p?.kind !== 'customer') throw fail(HttpStatus.UNAUTHORIZED, 'no_session', 'Not logged in');
    const [c] = await this.ds.query(`SELECT blocked, token_version FROM customers WHERE id = $1`, [p.sub]);
    if (!c || c.blocked || c.token_version !== (p.v ?? 0)) throw fail(HttpStatus.UNAUTHORIZED, 'no_session', 'Not logged in');
    req.customerId = p.sub;
    if (p.imp) req.adminView = p.imp;
    return true;
  }
}

const ME_COLS = `c.id, c.name, c.phone, c.email, c.login, c.city, c.country, c.address, c.postal_code AS "postalCode", c.type,
  c.company, c.law_name AS "lawName", c.law_address AS "lawAddress", c.factual_address AS "factualAddress", c.taxcode, c.bankinfo,
  c.addresses, c.source, c.registered_at AS "registeredAt", c.created_at AS "createdAt"`;

/** Profile fields a customer may change: body key → column. Type and block status are admin-only. */
const SELF_EDIT: Record<string, string> = {
  name: 'name', email: 'email', phone: 'phone', city: 'city', country: 'country', address: 'address', postalCode: 'postal_code',
  company: 'company', lawName: 'law_name', lawAddress: 'law_address', factualAddress: 'factual_address', taxcode: 'taxcode',
  bankinfo: 'bankinfo',
};

const checkPassword = (pw: string) => {
  if (pw.length < 6) throw fail(HttpStatus.BAD_REQUEST, 'weak_password', 'Password must be at least 6 characters');
  if (pw.length > 200) throw fail(HttpStatus.BAD_REQUEST, 'weak_password', 'Password is too long');
};

@Controller('shop')
export class ShopController {
  constructor(@InjectDataSource() private ds: DataSource, private jwt: JwtService) {}

  private async startSession(req: Request, res: Response, id: number, remember = true) {
    await this.ds.query(`UPDATE customers SET last_login_at = now(), last_visit_at = now() WHERE id = $1`, [id]);
    // TypeORM returns [rows, count] for UPDATE … RETURNING, so read it with a SELECT
    const [c] = await this.ds.query(`SELECT token_version FROM customers WHERE id = $1`, [id]);
    const token = this.jwt.sign({ sub: id, kind: 'customer', v: c.token_version }, { expiresIn: '30d' });
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: req.secure, path: COOKIE_PATH, ...(remember ? { maxAge: 30 * DAY } : {}),
    });
    return this.profile(id);
  }

  private async profile(id: number) {
    const [c] = await this.ds.query(`SELECT ${ME_COLS},
      (SELECT COUNT(*)::int FROM customer_orders o WHERE o.customer_id = c.id) AS "orderCount"
      FROM customers c WHERE c.id = $1`, [id]);
    return c;
  }

  private async changeLog(id: number, name: string, changes: Record<string, unknown>) {
    await this.ds.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('customer', 'updated', $1, $2, $3)`,
      [id, name, JSON.stringify({ ...changes, by: [null, 'customer (site)'] })]);
  }

  // ---------------------------------------------------------------- registration / login

  @Post('register')
  async register(@Body() b: { phone?: string; password?: string; city?: string; remember?: boolean }, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    limit(`reg:${ip(req)}`, 5, 3600_000);
    const p8 = phone8(b?.phone);
    if (!p8) throw fail(HttpStatus.BAD_REQUEST, 'bad_phone', 'Enter a valid phone number');
    const password = String(b?.password || '');
    checkPassword(password);
    const city = String(b?.city || '').trim().slice(0, 120);
    const [taken] = await this.ds.query(`SELECT id FROM customers c WHERE ${PHONE8} = $1 LIMIT 1`, [p8]);
    if (taken) throw fail(HttpStatus.CONFLICT, 'phone_taken', 'This phone number is already registered');
    const [c] = await this.ds.query(`
      INSERT INTO customers (name, phone, city, country, type, password_hash, password_scheme, confirmed, source, registered_at)
      VALUES ('', $1, $2, 'Armenia', 'consumer', $3, 'bcrypt', true, 'site', now()) RETURNING id`,
      [fmtPhone(p8), city, await hashCustomerPassword(password)]);
    await this.ds.query(`INSERT INTO change_log (entity, action, external_id, name, changes) VALUES ('customer', 'created', $1, $2, $3)`,
      [c.id, fmtPhone(p8), JSON.stringify({ phone: [null, fmtPhone(p8)], city: [null, city], by: [null, 'customer (site)'] })]);
    return this.startSession(req, res, c.id, b?.remember !== false);
  }

  @Post('login')
  async login(@Body() b: { login?: string; password?: string; remember?: boolean }, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    const login = String(b?.login || '').trim().toLowerCase();
    const password = String(b?.password || '');
    limit(`login-ip:${ip(req)}`, 30, 15 * 60_000);
    limit(`login:${login}`, 10, 15 * 60_000);
    if (!login || !password) throw fail(HttpStatus.UNAUTHORIZED, 'bad_login', 'Wrong login or password');
    const p8 = phone8(login);
    const rows = await this.ds.query(`
      SELECT c.id, c.blocked, c.password_hash, c.password_scheme FROM customers c
      WHERE lower(c.email) = $1 OR lower(c.login) = $1 OR ($2 <> '' AND ${PHONE8} = $2)
      ORDER BY c.last_login_at DESC NULLS LAST, c.last_visit_at DESC NULLS LAST, c.id DESC LIMIT 20`, [login, p8]);
    for (const c of rows) {
      if (!(await checkCustomerPassword(password, c.password_scheme, c.password_hash))) continue;
      if (c.blocked) throw fail(HttpStatus.FORBIDDEN, 'blocked', 'Account is blocked');
      if (c.password_scheme !== 'bcrypt') {   // old led.am hash → plain bcrypt
        await this.ds.query(`UPDATE customers SET password_hash = $2, password_scheme = 'bcrypt' WHERE id = $1`,
          [c.id, await hashCustomerPassword(password)]);
      }
      return this.startSession(req, res, c.id, b?.remember !== false);
    }
    if (rows.length && rows.every((c: { password_scheme: string }) => c.password_scheme === 'reset')) {
      throw fail(HttpStatus.UNAUTHORIZED, 'reset_required', 'Please set a new password');
    }
    throw fail(HttpStatus.UNAUTHORIZED, 'bad_login', 'Wrong login or password');
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: COOKIE_PATH });
    return { ok: true };
  }

  /** Logs out every device (also this one). */
  @Post('logout-all')
  @UseGuards(CustomerGuard)
  async logoutAll(@Req() req: CustomerReq, @Res({ passthrough: true }) res: Response) {
    await this.ds.query(`UPDATE customers SET token_version = token_version + 1 WHERE id = $1`, [req.customerId]);
    return this.logout(req, res);
  }

  // ---------------------------------------------------------------- password reset

  @Post('password/forgot')
  async forgot(@Body() b: { login?: string; lang?: string }, @Req() req: Request) {
    const login = String(b?.login || '').trim().toLowerCase();
    if (!login) throw fail(HttpStatus.BAD_REQUEST, 'no_login', 'Enter your phone or e-mail');
    limit(`forgot-ip:${ip(req)}`, 10, 3600_000);
    limit(`forgot:${login}`, 3, 15 * 60_000);
    const p8 = phone8(login);
    const [c] = await this.ds.query(`
      SELECT c.id, c.email, c.phone FROM customers c
      WHERE NOT c.blocked AND (lower(c.email) = $1 OR lower(c.login) = $1 OR ($2 <> '' AND ${PHONE8} = $2))
      ORDER BY (c.email IS NOT NULL AND c.email LIKE '%@%') DESC, c.last_login_at DESC NULLS LAST, c.last_visit_at DESC NULLS LAST, c.id DESC
      LIMIT 1`, [login, p8]);
    // Same answer whether or not the account exists.
    if (!c) return { ok: true, channel: p8 ? 'sms' : 'email' };
    const hasEmail = !!c.email && /\S+@\S+\.\S+/.test(c.email);
    // Typed a phone and an SMS provider exists → SMS; otherwise e-mail when the account has one.
    const channel: 'email' | 'sms' = (p8 && smsConfigured()) || !hasEmail ? 'sms' : 'email';
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.ds.query(`UPDATE customer_reset_codes SET used_at = now() WHERE customer_id = $1 AND used_at IS NULL`, [c.id]);
    await this.ds.query(`INSERT INTO customer_reset_codes (customer_id, code_hash, channel, expires_at)
      VALUES ($1, $2, $3, now() + interval '15 minutes')`, [c.id, await bcrypt.hash(code, 8), channel]);
    const to = channel === 'email' ? c.email : c.phone;
    await sendResetCode(channel, to, code, ['hy', 'ru', 'en'].includes(String(b?.lang)) ? String(b?.lang) : 'hy')
      .catch((e) => console.error('reset code send failed', e?.message));
    const masked = channel === 'email' ? c.email.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : `***${String(c.phone).slice(-3)}`;
    return { ok: true, channel, to: masked, configured: channel === 'email' ? mailConfigured() : smsConfigured() };
  }

  @Post('password/reset')
  async reset(@Body() b: { login?: string; code?: string; password?: string }, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    const login = String(b?.login || '').trim().toLowerCase();
    const code = String(b?.code || '').trim();
    const password = String(b?.password || '');
    limit(`reset-ip:${ip(req)}`, 20, 3600_000);
    if (!/^\d{6}$/.test(code)) throw fail(HttpStatus.BAD_REQUEST, 'bad_code', 'Wrong or expired code');
    checkPassword(password);
    const p8 = phone8(login);
    const [r] = await this.ds.query(`
      SELECT r.id, r.customer_id, r.code_hash, r.attempts FROM customer_reset_codes r JOIN customers c ON c.id = r.customer_id
      WHERE r.used_at IS NULL AND r.expires_at > now() AND NOT c.blocked
        AND (lower(c.email) = $1 OR lower(c.login) = $1 OR ($2 <> '' AND ${PHONE8} = $2))
      ORDER BY r.created_at DESC LIMIT 1`, [login, p8]);
    if (!r || r.attempts >= 5) throw fail(HttpStatus.BAD_REQUEST, 'bad_code', 'Wrong or expired code');
    if (!(await bcrypt.compare(code, r.code_hash))) {
      await this.ds.query(`UPDATE customer_reset_codes SET attempts = attempts + 1 WHERE id = $1`, [r.id]);
      throw fail(HttpStatus.BAD_REQUEST, 'bad_code', 'Wrong or expired code');
    }
    await this.ds.query(`UPDATE customer_reset_codes SET used_at = now() WHERE id = $1`, [r.id]);
    await this.ds.query(`UPDATE customers SET password_hash = $2, password_scheme = 'bcrypt', token_version = token_version + 1,
      updated_at = now() WHERE id = $1`, [r.customer_id, await hashCustomerPassword(password)]);
    const [c] = await this.ds.query(`SELECT name FROM customers WHERE id = $1`, [r.customer_id]);
    await this.changeLog(r.customer_id, c.name, { password: ['•••', 'reset by code'] });
    return this.startSession(req, res, r.customer_id);
  }

  // ---------------------------------------------------------------- account

  @Get('me')
  @UseGuards(CustomerGuard)
  async me(@Req() req: CustomerReq) {
    return { ...(await this.profile(req.customerId!)), adminView: req.adminView || null };
  }

  @Patch('me')
  @UseGuards(CustomerGuard)
  async updateMe(@Body() body: Record<string, unknown>, @Req() req: CustomerReq) {
    const id = req.customerId!;
    const [cur] = await this.ds.query(`SELECT * FROM customers WHERE id = $1`, [id]);
    const sets: string[] = [];
    const args: unknown[] = [id];
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [key, col] of Object.entries(SELF_EDIT)) {
      if (!(key in (body || {}))) continue;
      let v: string | null = body[key] === null || body[key] === undefined ? null : String(body[key]).trim().slice(0, 300) || null;
      if (col === 'name') v = v || '';
      if (col === 'phone') {
        const p8 = phone8(v);
        if (!p8) throw fail(HttpStatus.BAD_REQUEST, 'bad_phone', 'Enter a valid phone number');
        v = fmtPhone(p8);
        if (phone8(cur.phone) === p8) continue;
        const [t] = await this.ds.query(`SELECT 1 FROM customers c WHERE ${PHONE8} = $1 AND c.id <> $2 LIMIT 1`, [p8, id]);
        if (t) throw fail(HttpStatus.CONFLICT, 'phone_taken', 'This phone number is already registered');
      }
      if (col === 'email' && v) {
        v = v.toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(v)) throw fail(HttpStatus.BAD_REQUEST, 'bad_email', 'Enter a valid e-mail');
        if (v !== (cur.email || '').toLowerCase()) {
          const [t] = await this.ds.query(`SELECT 1 FROM customers WHERE lower(email) = $1 AND id <> $2 LIMIT 1`, [v, id]);
          if (t) throw fail(HttpStatus.CONFLICT, 'email_taken', 'This e-mail is already used by another account');
        }
      }
      if (v === cur[col]) continue;
      changes[col] = [cur[col], v];
      args.push(v);
      sets.push(`${col} = $${args.length}`);
    }
    if (Array.isArray(body?.addresses)) {
      const list = (body.addresses as Record<string, unknown>[]).slice(0, 20).map((a) => ({
        l: String(a?.l ?? '').trim().slice(0, 60), city: String(a?.city ?? '').trim().slice(0, 120),
        a: String(a?.a ?? '').trim().slice(0, 300), def: a?.def ? 1 : 0,
      })).filter((a) => a.city || a.a);
      if (list.length && !list.some((a) => a.def)) list[0].def = 1;
      args.push(JSON.stringify(list));
      sets.push(`addresses = $${args.length}::jsonb`);
    }
    if (sets.length) {
      // edited_at makes a later re-import of the old site keep what the customer typed here
      await this.ds.query(`UPDATE customers SET ${sets.join(', ')}, edited_at = now(), updated_at = now() WHERE id = $1`, args);
      if (Object.keys(changes).length) await this.changeLog(id, cur.name, changes);
    }
    return this.profile(id);
  }

  @Post('me/password')
  @UseGuards(CustomerGuard)
  async changePassword(@Body() b: { old?: string; password?: string }, @Req() req: CustomerReq, @Res({ passthrough: true }) res: Response) {
    const id = req.customerId!;
    limit(`pwd:${id}`, 10, 15 * 60_000);
    const [c] = await this.ds.query(`SELECT name, password_hash, password_scheme FROM customers WHERE id = $1`, [id]);
    if (!(await checkCustomerPassword(String(b?.old || ''), c.password_scheme, c.password_hash))) {
      throw fail(HttpStatus.BAD_REQUEST, 'bad_old_password', 'Current password is wrong');
    }
    const password = String(b?.password || '');
    checkPassword(password);
    await this.ds.query(`UPDATE customers SET password_hash = $2, password_scheme = 'bcrypt', token_version = token_version + 1,
      updated_at = now() WHERE id = $1`, [id, await hashCustomerPassword(password)]);
    await this.changeLog(id, c.name, { password: ['•••', '•••'] });
    await this.startSession(req, res, id);   // other devices are logged out, this one stays in
    return { ok: true };
  }

  @Get('me/orders')
  @UseGuards(CustomerGuard)
  orders(@Req() req: CustomerReq) {
    return this.ds.query(`
      SELECT o.id, o.legacy_id AS "legacyId", o.source, o.ordered_at AS "orderedAt", o.contact_person AS "contactPerson",
             o.contact_phone AS "contactPhone", o.city, o.address, o.total::float AS total, o.shipping,
             o.shipping_cost::float AS "shippingCost", o.currency, o.payment_type AS "paymentType", o.shop_address AS "shopAddress",
             o.status, o.paid,
             COALESCE((SELECT json_agg(json_build_object('article', i.article, 'name', COALESCE(i.name, p.name), 'price', i.price::float,
               'qty', i.qty, 'total', i.total::float) ORDER BY i.id)
               FROM customer_order_items i LEFT JOIN products p ON p.external_id = i.product_external_id WHERE i.order_id = o.id), '[]') AS items
      FROM customer_orders o WHERE o.customer_id = $1 ORDER BY o.ordered_at DESC NULLS LAST, o.id DESC`, [req.customerId]);
  }
}
