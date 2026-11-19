import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from './auth';
import { Category, ChangeLog, Currency, Product, SyncLog } from './entities';
import { agentState } from './sync';

const SORTS: Record<string, string> = {
  name: 'p.name', price: 'p.price', quantity: 'p.quantity', externalId: 'p.external_id', syncedAt: 'p.synced_at',
};

@Controller('admin')
@UseGuards(JwtGuard)
export class AdminController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get('products')
  async products(@Query() q: Record<string, string>) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const qb = this.ds.getRepository(Product).createQueryBuilder('p')
      .leftJoin(Category, 'c', 'c.external_id = p.category_external_id')
      .leftJoin(Currency, 'cur', 'cur.external_id = p.currency_external_id')
      .select([
        'p.id AS id', 'p.external_id AS "externalId"', 'p.barcode AS barcode', 'p.name AS name',
        'p.brand AS brand', 'p.unit AS unit', 'p.price::float AS price', 'p.quantity::float AS quantity',
        'p.discontinued AS discontinued', 'p.in_price_list AS "inPriceList"', 'p.is_visible AS "isVisible"',
        'p.deleted_at AS "deletedAt"', 'p.synced_at AS "syncedAt"',
        'p.category_external_id AS "categoryExternalId"', 'c.name AS "categoryName"', 'cur.name AS "currencyName"',
      ]);

    if (q.deleted !== '1') qb.andWhere('p.deleted_at IS NULL');
    if (q.search?.trim()) {
      qb.andWhere('(p.name ILIKE :s OR p.barcode ILIKE :s OR p.brand ILIKE :s OR p.external_id::text = :exact)',
        { s: `%${q.search.trim()}%`, exact: q.search.trim() });
    }
    if (q.categoryId) qb.andWhere('p.category_external_id = :cat', { cat: Number(q.categoryId) });
    if (q.stock === 'in') qb.andWhere('p.quantity > 0');
    if (q.stock === 'out') qb.andWhere('p.quantity <= 0');
    if (q.discontinued === '0') qb.andWhere('p.discontinued = false');
    if (q.discontinued === '1') qb.andWhere('p.discontinued = true');

    const total = await qb.getCount();
    const sort = SORTS[q.sort] || 'p.name';
    const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
    const items = await qb.orderBy(sort, dir, 'NULLS LAST').addOrderBy('p.id')
      .offset((page - 1) * limit).limit(limit).getRawMany();
    return { items, total, page, limit };
  }

  @Get('products/:id')
  async product(@Param('id', ParseIntPipe) id: number) {
    const p = await this.ds.getRepository(Product).findOneBy({ id });
    if (!p) throw new NotFoundException();
    const category = p.categoryExternalId === null ? null
      : await this.ds.getRepository(Category).findOneBy({ externalId: p.categoryExternalId });
    const currency = p.currencyExternalId === null ? null
      : await this.ds.getRepository(Currency).findOneBy({ externalId: p.currencyExternalId });
    return { ...p, category, currency };
  }

  @Get('categories')
  categories() {
    return this.ds.query(`
      SELECT c.id, c.external_id AS "externalId", c.name, c.deleted_at AS "deletedAt", c.synced_at AS "syncedAt",
             COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS "productCount"
      FROM categories c LEFT JOIN products p ON p.category_external_id = c.external_id
      GROUP BY c.id ORDER BY c.name`);
  }

  @Get('currencies')
  currencies() {
    return this.ds.getRepository(Currency).find({ order: { externalId: 'ASC' } });
  }

  @Get('stats')
  async stats() {
    const [row] = await this.ds.query(`
      SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS products,
             COUNT(*) FILTER (WHERE deleted_at IS NULL AND quantity > 0)::int AS "inStock",
             COUNT(*) FILTER (WHERE deleted_at IS NULL AND quantity <= 0)::int AS "outOfStock",
             COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
      FROM products`);
    const [cat] = await this.ds.query(`SELECT COUNT(*)::int AS n FROM categories WHERE deleted_at IS NULL`);
    const last = await this.ds.getRepository(SyncLog).find({ order: { id: 'DESC' }, take: 1 });
    return { ...row, categories: cat.n, lastSyncAt: last[0]?.receivedAt ?? null,
      agentSeenAt: agentState.seenAt, agentVersion: agentState.version, agentError: agentState.error, serverNow: new Date() };
  }

  @Get('changes')
  async changes(@Query() q: Record<string, string>) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = 100;
    const qb = this.ds.getRepository(ChangeLog).createQueryBuilder('c').orderBy('c.id', 'DESC');
    if (q.entity && q.entity !== 'tables') qb.andWhere('c.entity = :entity', { entity: q.entity });
    if (q.action) qb.andWhere('c.action = :action', { action: q.action });
    if (q.from) qb.andWhere('c.at >= :from', { from: q.from });
    if (q.to) qb.andWhere("c.at < (:to::date + 1)", { to: q.to });
    if (q.entity === 'tables') qb.andWhere("c.entity LIKE 't:%'");
    if (q.key) qb.andWhere('c.row_key = :key', { key: q.key });
    if (q.search) {
      const s = q.search.trim();
      if (/^\d+$/.test(s)) qb.andWhere('(c.external_id = :id OR c.row_key = :s0 OR c.name ILIKE :s)', { id: Number(s), s0: s, s: `%${s}%` });
      else qb.andWhere('(c.name ILIKE :s OR c.row_key = :s0 OR c.changes::text ILIKE :s)', { s0: s, s: `%${s}%` });
    }
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit };
  }

  // ---- Copy of all Access tables ----

  @Get('tables')
  tables() {
    return this.ds.query(`
      SELECT t.name, t.columns, t.key_columns AS "keyColumns", t.loaded, t.synced_at AS "syncedAt",
             COALESCE(r.n, 0)::int AS rows,
             (SELECT COUNT(*)::int FROM change_log c WHERE c.entity = 't:' || t.name) AS changes,
             (SELECT MAX(c.at) FROM change_log c WHERE c.entity = 't:' || t.name) AS "lastChangeAt"
      FROM mirror_tables t
      LEFT JOIN (SELECT tbl, COUNT(*) AS n FROM mirror_rows WHERE deleted_at IS NULL GROUP BY tbl) r ON r.tbl = t.name
      ORDER BY t.name`);
  }

  @Get('tables/:name')
  async table(@Param('name') name: string, @Query() q: Record<string, string>) {
    const [meta] = await this.ds.query(
      `SELECT name, columns, key_columns AS "keyColumns", loaded, synced_at AS "syncedAt" FROM mirror_tables WHERE name = $1`, [name]);
    if (!meta) throw new NotFoundException();
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const where = ['tbl = $1', q.deleted === '1' ? 'TRUE' : 'deleted_at IS NULL'];
    const args: unknown[] = [name];
    if (q.search?.trim()) { args.push(`%${q.search.trim()}%`); where.push(`(key ILIKE $${args.length} OR data::text ILIKE $${args.length})`); }
    if (q.key) { args.push(q.key); where.push(`key = $${args.length}`); }
    const w = where.join(' AND ');
    const [{ n }] = await this.ds.query(`SELECT COUNT(*)::int AS n FROM mirror_rows WHERE ${w}`, args);
    let order = 'key';
    if (q.sort && (meta.columns as string[]).includes(q.sort)) { args.push(q.sort); order = `data -> $${args.length}`; }
    const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
    const items = await this.ds.query(
      `SELECT key, data, deleted_at AS "deletedAt", synced_at AS "syncedAt" FROM mirror_rows WHERE ${w}
       ORDER BY ${order} ${dir} NULLS LAST, key LIMIT ${limit} OFFSET ${(page - 1) * limit}`, args);
    return { ...meta, items, total: n, page, limit };
  }

  @Get('sync-log')
  async syncLog(@Query('page') pageQ?: string) {
    const page = Math.max(1, Number(pageQ) || 1);
    const [items, total] = await this.ds.getRepository(SyncLog).findAndCount({
      order: { id: 'DESC' }, skip: (page - 1) * 50, take: 50,
    });
    return { items, total, page, limit: 50 };
  }
}
