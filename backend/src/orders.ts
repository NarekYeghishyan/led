/**
 * Storefront orders (plan step 10).
 *   POST /api/shop/orders               checkout or 1-click; guests allowed, linked to the customer when logged in.
 *                                       Prices, names and stock are taken from the DB (StorefrontController.orderLines),
 *                                       never from the browser; only in-stock products; qty 1–99, max 50 lines.
 *   GET  /api/shop/orders/track?n=&phone=  status of one site order; the phone must match the order's (last 8 digits),
 *                                       and only status, dates, delivery kind and items are returned (no name/address).
 *   /api/admin/orders                   list (status / search / page), card, status change with note (JwtGuard; logged in
 *                                       change_log entity 'order' and in customer_order_events).
 * Staff alert: e-mail to ORDER_NOTIFY_EMAIL (comma list) once SMTP is set; the customer gets a confirmation e-mail when they
 * gave one. Statuses: new → confirmed → shipped → done | cancelled.
 */
import { Body, Controller, Get, Header, HttpStatus, NotFoundException, Param, Patch, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
import { JwtGuard } from './auth';
import { fail, ip, limit, phone8, sessionOf } from './shop';
import { StorefrontController } from './storefront';
import { sendMail } from './mailer';

export const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'done', 'cancelled'] as const;
const LEGACY_STATUSES = ['received', 'process', 'resolved'] as const;
type Status = (typeof ORDER_STATUSES)[number];
const SHIP = ['pick', 'cour', 'reg'] as const;
const PAY = ['cash', 'card', 'idram', 'inst', 'bank'] as const;
const SLOTS = ['10:00–13:00', '13:00–16:00', '16:00–19:00'];

const str = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T => ((list as readonly string[]).includes(String(v)) ? (v as T) : def);
const fmt = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ֏`;

type Line = { code: number; name: string; price: number; qty: number };

@Controller('shop/orders')
export class OrdersPublicController {
  constructor(@InjectDataSource() private ds: DataSource, private jwt: JwtService, private shop: StorefrontController) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Body() b: Record<string, unknown>, @Req() req: Request) {
    limit(`order:${ip(req)}`, 10, 3600_000);
    const kind = b?.kind === 'oneclick' ? 'oneclick' : 'checkout';
    const lang = oneOf(b?.lang, ['hy', 'ru', 'en'] as const, 'hy');

    // items: [{ code, q }] → merged by code, re-priced from the DB
    const want = new Map<number, number>();
    for (const x of (Array.isArray(b?.items) ? b.items : []).slice(0, 50) as { code?: unknown; q?: unknown }[]) {
      const code = parseInt(String(x?.code), 10), q = Math.max(1, Math.min(99, parseInt(String(x?.q), 10) || 1));
      if (code > 0 && code < 1e9) want.set(code, Math.min(99, (want.get(code) || 0) + q));
    }
    if (!want.size) throw fail(HttpStatus.BAD_REQUEST, 'empty', 'No products');
    const rows = await this.shop.orderLines([...want.keys()]);
    const gone = [...want.keys()].filter((c) => !rows.some((r) => r.code === c));
    if (gone.length) throw new BadRequestException({ statusCode: 400, code: 'gone', message: 'Some products are no longer on sale', gone });
    const lines: Line[] = rows.map((r) => ({ code: r.code, name: r.name, price: r.price, qty: want.get(r.code)! }));
    const total = lines.reduce((s, x) => s + x.price * x.qty, 0);

    // contact
    const p8 = phone8(b?.phone);
    if (!p8) throw fail(HttpStatus.BAD_REQUEST, 'bad_phone', 'Phone number is wrong');
    const name = str(b?.name, 120);
    const email = str(b?.email, 160);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw fail(HttpStatus.BAD_REQUEST, 'bad_email', 'E-mail is wrong');
    let who: 'person' | 'company' = 'person', company = '', tax = '';
    let ship: (typeof SHIP)[number] = 'pick', region = '', city = '', address = '', day: string | null = null, slot = '';
    let pay: (typeof PAY)[number] = 'cash';
    if (kind === 'checkout') {
      if (name.length < 2) throw fail(HttpStatus.BAD_REQUEST, 'required', 'Name is required');
      who = b?.who === 'company' ? 'company' : 'person';
      if (who === 'company') {
        company = str(b?.company, 160); tax = str(b?.tax, 8).replace(/\D/g, '');
        if (!company || tax.length !== 8) throw fail(HttpStatus.BAD_REQUEST, 'required', 'Company name and 8-digit tax code are required');
      }
      ship = oneOf(b?.ship, SHIP, 'pick');
      if (ship !== 'pick') {
        address = str(b?.address, 240);
        if (address.length < 3) throw fail(HttpStatus.BAD_REQUEST, 'required', 'Address is required');
        if (ship === 'reg') { region = str(b?.region, 60); city = str(b?.city, 80); if (!region || !city) throw fail(HttpStatus.BAD_REQUEST, 'required', 'Province and city are required'); }
        else city = 'Երևան';
        if (ship === 'cour') {
          const d = str(b?.day, 10);
          const max = new Date(Date.now() + 8 * 86400_000).toISOString().slice(0, 10), min = new Date().toISOString().slice(0, 10);
          day = /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= min && d <= max ? d : null;
          slot = SLOTS.includes(str(b?.slot, 20)) ? str(b?.slot, 20) : '';
        }
      }
      pay = oneOf(b?.pay, PAY, 'cash');
      if (pay === 'bank' && who !== 'company') pay = 'cash';
    }
    const comment = str(b?.comment, 1000);
    const callMe = b?.call !== false;
    const s = await sessionOf(this.jwt, this.ds, req);
    const customerId = s && !s.imp ? s.sub : null; // an admin "viewing as" the customer doesn't order in their name

    const number = await this.ds.transaction(async (m) => {
      const [{ n }] = await m.query(`SELECT 'LED-' || nextval('customer_order_number_seq') AS n`);
      const [o] = await m.query(`
        INSERT INTO customer_orders (customer_id, source, ordered_at, contact_person, contact_phone, contact_email, country, city, address,
          total, shipping, currency, payment_type, shop_address, status, number, kind, lang, customer_type, company, tax_code, delivery, region,
          delivery_day, delivery_slot, comment, call_me, updated_at, client_ip)
        VALUES ($1, 'site', now(), $2, $3, $4, 'Armenia', $5, $6, $7, $8, 'AMD', $9, $10, 'new', $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, now(), $23) RETURNING id`,
        [customerId, name || null, `+374${p8}`, email || null, city || null, address || null, total, ship !== 'pick', pay,
          ship === 'pick' ? 'Կիևյան 11' : null, n, kind, lang, who, company || null, tax || null, ship, region || null, day, slot || null,
          comment || null, callMe, ip(req)]);
      for (const x of lines) {
        await m.query(`INSERT INTO customer_order_items (order_id, article, product_external_id, name, price, qty, total, currency)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'AMD')`, [o.id, String(x.code), x.code, x.name, x.price, x.qty, x.price * x.qty]);
      }
      await m.query(`INSERT INTO customer_order_events (order_id, status, by) VALUES ($1, 'new', 'site')`, [o.id]);
      return n as string;
    });

    this.notify(number, { kind, name, phone: `+374${p8}`, email, ship, address: [region, city, address].filter(Boolean).join(', '), pay, comment, lines, total, company, tax, lang })
      .catch(() => { /* mail problems never fail the order */ });
    return { number, total, items: lines.map((x) => ({ code: x.code, name: x.name, price: x.price, qty: x.qty })) };
  }

  private async notify(number: string, o: { kind: string; name: string; phone: string; email: string; ship: string; address: string; pay: string;
    comment: string; lines: Line[]; total: number; company: string; tax: string; lang: string }) {
    const list = o.lines.map((x) => `${x.qty} × ${x.name} (${x.code}) — ${fmt(x.price * x.qty)}`).join('\n');
    const staff = String(process.env.ORDER_NOTIFY_EMAIL || '').split(',').map((x) => x.trim()).filter(Boolean);
    const text = `${o.kind === 'oneclick' ? '1-click' : 'Checkout'} ${number}\n${o.name} ${o.phone} ${o.email}\n${o.company ? `${o.company} ${o.tax}\n` : ''}` +
      `Delivery: ${o.ship} ${o.address}\nPayment: ${o.pay}\n${o.comment ? `Comment: ${o.comment}\n` : ''}\n${list}\n\nTotal: ${fmt(o.total)}\n` +
      `${process.env.SITE_URL || 'https://led.creativeweb.am'}/admin/orders`;
    for (const to of staff) await sendMail(to, `New order ${number} — ${fmt(o.total)}`, text);
    if (o.email) {
      const H = { hy: ['Ձեր պատվերը', 'ընդունված է։ Մենեջերը շուտով կզանգի։', 'Ընդամենը'], ru: ['Ваш заказ', 'принят. Менеджер скоро позвонит.', 'Итого'],
        en: ['Your order', 'is received. A manager will call you soon.', 'Total'] }[o.lang as 'hy'] || ['Your order', 'is received.', 'Total'];
      await sendMail(o.email, `LED Computers — ${number}`, `${H[0]} ${number} ${H[1]}\n\n${list}\n\n${H[2]}: ${fmt(o.total)}\n\n+374 10 502802 · led.am`);
    }
  }

  @Get('track')
  @Header('Cache-Control', 'no-store')
  async track(@Query('n') n: string, @Query('phone') phone: string, @Req() req: Request) {
    limit(`track:${ip(req)}`, 30, 15 * 60_000);
    const num = String(n || '').trim().toUpperCase().replace(/^(LED-?)?/, 'LED-');
    const p8 = phone8(phone);
    if (!/^LED-\d{4,9}$/.test(num) || !p8) throw fail(HttpStatus.BAD_REQUEST, 'bad_query', 'Order number and phone are required');
    const [o] = await this.ds.query(`
      SELECT o.id, o.number, o.status, o.ordered_at AS "orderedAt", o.updated_at AS "updatedAt", o.kind, o.delivery, o.payment_type AS pay,
             o.delivery_day AS "day", o.delivery_slot AS slot, o.total::float AS total, o.contact_phone AS phone,
             COALESCE((SELECT json_agg(json_build_object('code', i.product_external_id, 'name', i.name, 'price', i.price::float, 'qty', i.qty) ORDER BY i.id)
               FROM customer_order_items i WHERE i.order_id = o.id), '[]') AS items,
             COALESCE((SELECT json_agg(json_build_object('status', e.status, 'at', e.at) ORDER BY e.at) FROM customer_order_events e WHERE e.order_id = o.id), '[]') AS history
      FROM customer_orders o WHERE o.source = 'site' AND o.number = $1`, [num]);
    if (!o || phone8(o.phone) !== p8) throw new NotFoundException({ statusCode: 404, code: 'not_found', message: 'Order not found' });
    delete o.phone; delete o.id;
    return o;
  }
}

@Controller('admin/orders')
@UseGuards(JwtGuard)
export class OrdersAdminController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get()
  async list(@Query() q: { status?: string; q?: string; page?: string; src?: string }) {
    // src=legacy → orders imported from the old led.am (read-only, statuses received / process / resolved)
    const legacy = q.src === 'legacy';
    const where = [legacy ? `o.source = 'legacy'` : `o.source = 'site'`], args: unknown[] = [];
    const sts: readonly string[] = legacy ? LEGACY_STATUSES : ORDER_STATUSES;
    if (sts.includes(String(q.status))) { args.push(q.status); where.push(`o.status = $${args.length}`); }
    const s = String(q.q || '').trim();
    if (s) {
      args.push(`%${s.toLowerCase()}%`);
      const d = s.replace(/\D/g, '');
      where.push(`(lower(coalesce(o.number, o.legacy_id::text)) LIKE $${args.length} OR lower(coalesce(o.contact_person,'')) LIKE $${args.length} OR lower(coalesce(o.contact_email,'')) LIKE $${args.length}
        OR lower(coalesce(o.company,'')) LIKE $${args.length}${d.length >= 4 ? ` OR regexp_replace(coalesce(o.contact_phone,''), '\\D', '', 'g') LIKE '%${d}%'` : ''})`);
    }
    const page = Math.max(1, parseInt(String(q.page), 10) || 1), per = 50;
    const W = where.join(' AND ');
    const items = await this.ds.query(`
      SELECT o.id, COALESCE(o.number, 'led.am #' || o.legacy_id) AS number, o.source, o.shipping, o.status, o.kind, o.ordered_at AS "orderedAt", o.contact_person AS name, o.contact_phone AS phone, o.company,
             o.total::float AS total, o.delivery, o.payment_type AS pay, o.customer_id AS "customerId",
             (SELECT COALESCE(SUM(qty), 0)::int FROM customer_order_items i WHERE i.order_id = o.id) AS qty
      FROM customer_orders o WHERE ${W} ORDER BY o.ordered_at DESC, o.id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, args);
    const [{ total }] = await this.ds.query(`SELECT COUNT(*)::int AS total FROM customer_orders o WHERE ${W}`, args);
    const counts = await this.ds.query(`SELECT status, COUNT(*)::int AS n FROM customer_orders WHERE source = $1 GROUP BY status`, [legacy ? 'legacy' : 'site']);
    const [{ legacyN }] = await this.ds.query(`SELECT COUNT(*)::int AS "legacyN" FROM customer_orders WHERE source = 'legacy'`);
    return { items, total, page, per, counts: Object.fromEntries(counts.map((c: { status: string; n: number }) => [c.status, c.n])), statuses: sts, legacyN };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const [o] = await this.ds.query(`
      SELECT o.id, COALESCE(o.number, 'led.am #' || o.legacy_id) AS number, o.source, o.shipping, o.status, o.kind, o.lang, o.shop_address AS shop, o.paid, o.ordered_at AS "orderedAt", o.updated_at AS "updatedAt", o.customer_id AS "customerId",
             c.name AS "customerName", o.contact_person AS name, o.contact_phone AS phone, o.contact_email AS email, o.customer_type AS "customerType",
             o.company, o.tax_code AS tax, o.delivery, o.region, o.city, o.address, o.delivery_day AS "day", o.delivery_slot AS slot,
             o.payment_type AS pay, o.comment, o.call_me AS "callMe", o.staff_note AS "staffNote", o.total::float AS total,
             COALESCE((SELECT json_agg(json_build_object('code', i.product_external_id, 'name', i.name, 'price', i.price::float, 'qty', i.qty,
               'total', i.total::float, 'article', i.article, 'productId', p.id, 'stock', p.quantity::float) ORDER BY i.id)
               FROM customer_order_items i LEFT JOIN products p ON p.external_id = i.product_external_id WHERE i.order_id = o.id), '[]') AS items,
             COALESCE((SELECT json_agg(json_build_object('status', e.status, 'at', e.at, 'note', e.note, 'by', e.by) ORDER BY e.at)
               FROM customer_order_events e WHERE e.order_id = o.id), '[]') AS history
      FROM customer_orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND o.source IN ('site', 'legacy')`, [parseInt(id, 10) || 0]);
    if (!o) throw new NotFoundException();
    return o;
  }

  /** PATCH { status?, note?, staffNote? } — status change (with an optional note for the history) and/or the internal staff note. */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() b: { status?: string; note?: string; staffNote?: string }, @Req() req: { user?: { email?: string } }) {
    const o = await this.one(id);
    if (o.source !== 'site') throw new BadRequestException('Old led.am orders are read-only');
    const who = req.user?.email ?? 'admin';
    const changes: Record<string, [unknown, unknown]> = {};
    if (b?.status !== undefined && b.status !== o.status) {
      if (!(ORDER_STATUSES as readonly string[]).includes(String(b.status))) throw new BadRequestException('Unknown status');
      await this.ds.query(`UPDATE customer_orders SET status = $2, updated_at = now(), paid = CASE WHEN $2 = 'done' THEN true ELSE paid END WHERE id = $1`, [o.id, b.status as Status]);
      await this.ds.query(`INSERT INTO customer_order_events (order_id, status, note, by) VALUES ($1, $2, $3, $4)`, [o.id, b.status, str(b.note, 500) || null, who]);
      changes.status = [o.status, b.status];
    }
    if (b?.staffNote !== undefined && str(b.staffNote, 2000) !== (o.staffNote || '')) {
      await this.ds.query(`UPDATE customer_orders SET staff_note = $2, updated_at = now() WHERE id = $1`, [o.id, str(b.staffNote, 2000) || null]);
      changes.staffNote = [o.staffNote, str(b.staffNote, 2000)];
    }
    if (Object.keys(changes).length) {
      await this.ds.query(`INSERT INTO change_log (entity, action, name, changes) VALUES ('order', 'updated', $1, $2)`,
        [o.number, JSON.stringify({ ...changes, by: [null, who] })]);
    }
    return this.one(id);
  }
}
