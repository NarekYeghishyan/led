/**
 * Import of customers + order history from the old led.am site (MySQL dump, e.g. led_new.sql).
 * Safe to run again: rows are matched by their old ids. A re-run adds new users/orders and refreshes old ones,
 * but keeps customer profiles edited in the admin panel, the "blocked" flag and passwords already upgraded.
 * Reads only the MySQL dump and writes only to PostgreSQL — nothing is ever written to Access.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

type Val = string | number | null;
type Row = Record<string, Val>;

const WANTED = new Set([
  's1_siteusers', 's1_order', 's1_orderproducts', 's1_wishlist', 's1_product', 's1_product_ml',
  's1_address_ml', 's1_ordersstatus',
]);

/** Parses the INSERT statements of the wanted tables from a mysqldump / phpMyAdmin export. */
export function parseDump(text: string, wanted = WANTED) {
  const out: Record<string, Row[]> = {};
  const head = /INSERT INTO `([^`]+)` \(([^)]*)\) VALUES\s*/g;
  let m: RegExpExecArray | null;
  let nextBs = -1;
  while ((m = head.exec(text))) {
    const table = m[1];
    if (!wanted.has(table)) continue;
    const cols = m[2].split(',').map((c) => c.trim().replace(/`/g, ''));
    const rows = (out[table] ||= []);
    let i = head.lastIndex;
    // tuples: (v, v, ...),(...);
    for (;;) {
      while (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t' || text[i] === ',') i++;
      if (text[i] !== '(') break;
      i++;
      const vals: Val[] = [];
      for (;;) {
        while (text[i] === ' ' || text[i] === '\n' || text[i] === '\r') i++;
        if (text[i] === "'") {
          // copy plain runs with slice (char-by-char concatenation exhausts memory on a 160 MB dump)
          const parts: string[] = [];
          let start = ++i;
          for (;;) {
            const q = text.indexOf("'", i);
            if (nextBs !== Infinity && nextBs < i) { nextBs = text.indexOf('\\', i); if (nextBs < 0) nextBs = Infinity; }
            const b = nextBs; // cached position of the next backslash
            if (q < 0) throw new Error(`Unterminated string in ${table}`);
            if (b < q) {
              parts.push(text.slice(start, b));
              const n = text[b + 1];
              parts.push(n === 'n' ? '\n' : n === 'r' ? '\r' : n === 't' ? '\t' : n === '0' ? '\0' : n === 'Z' ? '\x1a' : n);
              i = start = b + 2;
            } else if (text[q + 1] === "'") {
              parts.push(text.slice(start, q + 1));
              i = start = q + 2;
            } else {
              parts.push(text.slice(start, q));
              i = q + 1;
              break;
            }
          }
          vals.push(parts.length === 1 ? parts[0] : parts.join(''));
        } else {
          let j = i;
          while (text[j] !== ',' && text[j] !== ')') j++;
          const raw = text.slice(i, j).trim();
          vals.push(raw.toUpperCase() === 'NULL' ? null : Number(raw));
          i = j;
        }
        while (text[i] === ' ') i++;
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ')') { i++; break; }
        throw new Error(`Bad tuple in ${table} near: ${text.slice(i, i + 60)}`);
      }
      const row: Row = {};
      cols.forEach((c, k) => { row[c] = vals[k] ?? null; });
      rows.push(row);
      while (text[i] === ' ' || text[i] === '\n' || text[i] === '\r') i++;
      if (text[i] === ';') { i++; break; }
    }
    head.lastIndex = i;
  }
  return out;
}

// ---------------------------------------------------------------- passwords

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');
/** MySQL 4.1+ PASSWORD(): '*' + upper(hex(sha1(sha1(pw)))) */
const mysql41 = (s: string) =>
  '*' + createHash('sha1').update(createHash('sha1').update(s, 'utf8').digest()).digest('hex').toUpperCase();

/** What the old site stored → scheme name; anything else cannot be checked and needs a reset. */
export function legacyScheme(old: string | null) {
  if (!old) return 'reset';
  if (/^[0-9a-f]{32}$/i.test(old)) return 'legacy-md5';
  if (/^\*[0-9A-F]{40}$/i.test(old)) return 'legacy-mysql41';
  return 'reset';
}
const normLegacy = (scheme: string, old: string) => (scheme === 'legacy-md5' ? old.toLowerCase() : old.toUpperCase());

/** Checks a password typed by a customer. Old-site hashes are kept wrapped in bcrypt, never in plain md5. */
export async function checkCustomerPassword(password: string, scheme: string, hash: string | null) {
  if (!hash || !password) return false;
  if (scheme === 'bcrypt') return bcrypt.compare(password, hash);
  if (scheme === 'legacy-md5') return bcrypt.compare(md5(password), hash);
  if (scheme === 'legacy-mysql41') return bcrypt.compare(mysql41(password), hash);
  return false;
}
export const hashCustomerPassword = (password: string) => bcrypt.hash(password, 10);

// ---------------------------------------------------------------- import

const str = (v: Val) => (v === null || v === undefined ? null : String(v).trim() || null);
const int = (v: Val) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)));
const numv = (v: Val) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
/** Old site stored Yerevan local time without zone. */
const date = (v: Val) => {
  const s = str(v);
  if (!s || s.startsWith('0000')) return null;
  return `${s.length === 10 ? `${s} 00:00:00` : s}+04`;
};
const STATUS: Record<string, string> = { order_received: 'received', order_process: 'process', order_resolved: 'resolved' };

export interface ImportStats {
  customers: { inDump: number; inserted: number; updated: number; keptAdminEdits: number; needReset: number };
  orders: { inDump: number; imported: number; skippedGuest: number };
  items: { imported: number; linkedToProducts: number };
  favorites: number;
  seconds: number;
}

async function batched<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function importLegacy(ds: DataSource, file: string, log: (s: string) => void = () => {}): Promise<ImportStats> {
  const t0 = Date.now();
  log(`Reading ${file}…`);
  const d = parseDump(readFileSync(file, 'utf8'));
  const users = d.s1_siteusers || [];
  if (!users.length) throw new Error('No s1_siteusers rows found — is this the old led.am dump?');
  log(`Parsed: ${users.length} users, ${(d.s1_order || []).length} orders, ${(d.s1_orderproducts || []).length} order lines`);

  // product id -> article + name (ru, then hy, then en)
  const prodArticle = new Map<number, string | null>();
  for (const p of d.s1_product || []) prodArticle.set(Number(p.id), str(p.articule));
  const prodName = new Map<number, string>();
  for (const lng of [2, 3, 1]) {
    for (const p of d.s1_product_ml || []) if (Number(p.lng_id) === lng && str(p.name)) prodName.set(Number(p.id), str(p.name)!);
  }
  const shopAddr = new Map<number, string>();
  for (const lng of [2, 1, 3]) {
    for (const a of d.s1_address_ml || []) if (Number(a.lng_id) === lng && str(a.label)) shopAddr.set(Number(a.id), str(a.label)!);
  }
  const statusById = new Map<number, string>();
  for (const s of d.s1_ordersstatus || []) statusById.set(Number(s.id), STATUS[String(s.value)] || String(s.value));

  const stats: ImportStats = {
    customers: { inDump: users.length, inserted: 0, updated: 0, keptAdminEdits: 0, needReset: 0 },
    orders: { inDump: (d.s1_order || []).length, imported: 0, skippedGuest: 0 },
    items: { imported: 0, linkedToProducts: 0 },
    favorites: 0, seconds: 0,
  };

  // ---- customers
  const existing = new Map<number, { scheme: string; hash: string | null; edited: boolean }>();
  for (const r of await ds.query(`SELECT legacy_id, password_scheme, password_hash, edited_at FROM customers WHERE legacy_id IS NOT NULL`)) {
    existing.set(r.legacy_id, { scheme: r.password_scheme, hash: r.password_hash, edited: !!r.edited_at });
  }
  const custRows: Record<string, unknown>[] = [];
  let n = 0;
  for (const u of users) {
    const id = Number(u.id);
    const old = str(u.password);
    let scheme = legacyScheme(old);
    let hash: string | null = null;
    const ex = existing.get(id);
    if (ex && (ex.scheme === 'bcrypt' || ex.edited)) {
      scheme = ex.scheme; hash = ex.hash; // logged in on the new site or set by admin: keep
    } else if (scheme !== 'reset') {
      const legacy = normLegacy(scheme, old!);
      hash = ex?.hash && ex.scheme === scheme && (await bcrypt.compare(legacy, ex.hash)) ? ex.hash : await bcrypt.hash(legacy, 8);
    }
    if (scheme === 'reset') stats.customers.needReset++;
    if (ex) { stats.customers.updated++; if (ex.edited) stats.customers.keptAdminEdits++; } else stats.customers.inserted++;
    custRows.push({
      legacy_id: id, name: str(u.fname) || '', email: str(u.email), login: str(u.login), phone: str(u.phone),
      address: str(u.address), postal_code: str(u.postal_code), city: str(u.city), country: str(u.country),
      type: str(u.type) || 'consumer', company: str(u.dealer_company), law_name: str(u.law_name),
      law_address: str(u.law_address), factual_address: str(u.factual_address), taxcode: str(u.taxcode), bankinfo: str(u.bankinfo),
      password_hash: hash, password_scheme: scheme, confirmed: Number(u.active) === 1,
      registered_at: date(u.reg_date), last_visit_at: date(u.last_visit),
      raw: { ip: u.ip, position: u.position, account_text: u.account_text, profile_text: u.profile_text, confirm_code_set: !!str(u.confirm_code) },
    });
    if (++n % 500 === 0) log(`  passwords ${n}/${users.length}`);
  }
  const PROFILE = ['name', 'email', 'login', 'phone', 'address', 'postal_code', 'city', 'country', 'type', 'company',
    'law_name', 'law_address', 'factual_address', 'taxcode', 'bankinfo', 'confirmed'];
  await batched(custRows, 500, async (chunk) => {
    await ds.query(`
      INSERT INTO customers (legacy_id, ${PROFILE.join(', ')}, password_hash, password_scheme, registered_at, last_visit_at, raw)
      SELECT legacy_id, ${PROFILE.join(', ')}, password_hash, password_scheme, registered_at, last_visit_at, raw
      FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id int, name text, email text, login text, phone text, address text,
        postal_code text, city text, country text, type text, company text, law_name text, law_address text,
        factual_address text, taxcode text, bankinfo text, confirmed boolean, password_hash text, password_scheme text,
        registered_at timestamptz, last_visit_at timestamptz, raw jsonb)
      ON CONFLICT (legacy_id) DO UPDATE SET
        ${PROFILE.map((c) => `${c} = CASE WHEN customers.edited_at IS NULL THEN EXCLUDED.${c} ELSE customers.${c} END`).join(',\n        ')},
        password_hash = EXCLUDED.password_hash, password_scheme = EXCLUDED.password_scheme,
        registered_at = EXCLUDED.registered_at,
        last_visit_at = GREATEST(customers.last_visit_at, EXCLUDED.last_visit_at),
        raw = EXCLUDED.raw, updated_at = now()`, [JSON.stringify(chunk)]);
  });
  const custId = new Map<number, number>();
  for (const r of await ds.query(`SELECT id, legacy_id FROM customers WHERE legacy_id IS NOT NULL`)) custId.set(r.legacy_id, r.id);
  log(`Customers: ${stats.customers.inserted} new, ${stats.customers.updated} updated`);

  // ---- orders (registered users only)
  const orderRows: Record<string, unknown>[] = [];
  for (const o of d.s1_order || []) {
    const cid = custId.get(int(o.user_id) ?? -1);
    if (!cid) { stats.orders.skippedGuest++; continue; }
    orderRows.push({
      legacy_id: Number(o.id), customer_id: cid, ordered_at: date(o.date),
      contact_person: str(o.contact_person), contact_phone: str(o.contact_phone), contact_email: str(o.email_address),
      country: str(o.country), city: str(o.city), address: str(o.address), address_extra: str(o.extention),
      total: numv(o.total), shipping: String(o.shipping) === '1', shipping_cost: numv(o.shipping_cost),
      currency: str(o.order_currency), payment_type: str(o.payment_type),
      shop_address: shopAddr.get(int(o.shop_address) ?? -1) ?? null,
      status: statusById.get(int(o.ordersstatus) ?? -1) ?? str(o.ordersstatus),
      paid: String(o.payed) === '1', paid_at: date(o.payed_date),
      raw: { active: o.active, ip: o.ip, shop_address_id: o.shop_address },
    });
  }
  await batched(orderRows, 500, async (chunk) => {
    await ds.query(`
      INSERT INTO customer_orders (legacy_id, customer_id, ordered_at, contact_person, contact_phone, contact_email, country,
        city, address, address_extra, total, shipping, shipping_cost, currency, payment_type, shop_address, status, paid, paid_at, raw)
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id int, customer_id int, ordered_at timestamptz,
        contact_person text, contact_phone text, contact_email text, country text, city text, address text, address_extra text,
        total numeric, shipping boolean, shipping_cost numeric, currency text, payment_type text, shop_address text,
        status text, paid boolean, paid_at timestamptz, raw jsonb)
      ON CONFLICT (legacy_id) DO UPDATE SET customer_id = EXCLUDED.customer_id, ordered_at = EXCLUDED.ordered_at,
        contact_person = EXCLUDED.contact_person, contact_phone = EXCLUDED.contact_phone, contact_email = EXCLUDED.contact_email,
        country = EXCLUDED.country, city = EXCLUDED.city, address = EXCLUDED.address, address_extra = EXCLUDED.address_extra,
        total = EXCLUDED.total, shipping = EXCLUDED.shipping, shipping_cost = EXCLUDED.shipping_cost, currency = EXCLUDED.currency,
        payment_type = EXCLUDED.payment_type, shop_address = EXCLUDED.shop_address, status = EXCLUDED.status,
        paid = EXCLUDED.paid, paid_at = EXCLUDED.paid_at, raw = EXCLUDED.raw`, [JSON.stringify(chunk)]);
  });
  stats.orders.imported = orderRows.length;
  const orderId = new Map<number, number>();
  for (const r of await ds.query(`SELECT id, legacy_id FROM customer_orders WHERE legacy_id IS NOT NULL`)) orderId.set(r.legacy_id, r.id);

  // ---- order lines
  const itemRows: Record<string, unknown>[] = [];
  for (const it of d.s1_orderproducts || []) {
    const oid = orderId.get(int(it.order_id) ?? -1);
    if (!oid) continue;
    const pid = int(it.product_id);
    const article = str(it.articule) ?? (pid !== null ? prodArticle.get(pid) ?? null : null);
    itemRows.push({
      legacy_id: Number(it.id), order_id: oid, article,
      product_external_id: article && /^\d{1,9}$/.test(article) ? Number(article) : null,
      legacy_product_id: pid, name: pid !== null ? prodName.get(pid) ?? null : null,
      price: numv(it.price), qty: int(it.qty) ?? 1, total: numv(it.total), currency: str(it.order_currency),
    });
  }
  await batched(itemRows, 1000, async (chunk) => {
    await ds.query(`
      INSERT INTO customer_order_items (legacy_id, order_id, article, product_external_id, legacy_product_id, name, price, qty, total, currency)
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id int, order_id int, article text, product_external_id int,
        legacy_product_id int, name text, price numeric, qty int, total numeric, currency text)
      ON CONFLICT (legacy_id) DO UPDATE SET order_id = EXCLUDED.order_id, article = EXCLUDED.article,
        product_external_id = EXCLUDED.product_external_id, legacy_product_id = EXCLUDED.legacy_product_id,
        name = COALESCE(EXCLUDED.name, customer_order_items.name), price = EXCLUDED.price, qty = EXCLUDED.qty,
        total = EXCLUDED.total, currency = EXCLUDED.currency`, [JSON.stringify(chunk)]);
  });
  stats.items.imported = itemRows.length;
  const [{ n: linked }] = await ds.query(`
    SELECT COUNT(*)::int AS n FROM customer_order_items i JOIN products p ON p.external_id = i.product_external_id`);
  stats.items.linkedToProducts = linked;

  // ---- favourites (replaced for old-site customers on every run)
  const favRows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const w of d.s1_wishlist || []) {
    const cid = custId.get(int(w.user_id) ?? -1);
    const pid = int(w.product_id);
    if (!cid || pid === null || seen.has(`${cid}:${pid}`)) continue;
    seen.add(`${cid}:${pid}`);
    const article = prodArticle.get(pid) ?? null;
    favRows.push({
      customer_id: cid, legacy_product_id: pid, article,
      product_external_id: article && /^\d{1,9}$/.test(article) ? Number(article) : null, name: prodName.get(pid) ?? null,
    });
  }
  await ds.transaction(async (tx) => {
    await tx.query(`DELETE FROM customer_favorites f USING customers c WHERE c.id = f.customer_id AND c.legacy_id IS NOT NULL`);
    await batched(favRows, 1000, async (chunk) => {
      await tx.query(`
        INSERT INTO customer_favorites (customer_id, legacy_product_id, article, product_external_id, name)
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(customer_id int, legacy_product_id int, article text,
          product_external_id int, name text)`, [JSON.stringify(chunk)]);
    });
  });
  stats.favorites = favRows.length;

  stats.seconds = Math.round((Date.now() - t0) / 1000);
  await ds.query(`INSERT INTO customer_import_log (file, stats) VALUES ($1, $2)`, [file.split(/[\\/]/).pop(), JSON.stringify(stats)]);
  return stats;
}
