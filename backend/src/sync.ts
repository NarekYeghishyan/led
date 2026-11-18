import { OnModuleInit, BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { ApiKeyGuard } from './auth';
import { Category, ChangeLog, Currency, Product, SyncLog } from './entities';

interface Batch<T> {
  batchId?: string;
  agentVersion?: string;
  upserts?: T[];
  deletes?: (number | string)[];
}

const MAX_BATCH = 2000;
const LOG_DAYS = 30;

// Fields compared for the change log (entity property names).
const PRODUCT_TRACKED = [
  'name', 'barcode', 'categoryExternalId', 'brand', 'unit', 'price', 'currencyExternalId',
  'quantity', 'inPriceList', 'discontinued', 'note', 'weight', 'volume',
];
const LOOKUP_TRACKED = ['name'];

const norm = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  const n = Number(v);
  return typeof v !== 'string' || (v.trim() !== '' && !Number.isNaN(n)) ? (Number.isNaN(n) ? String(v) : n) : v;
};

// Columns the agent may update. Web fields (slug, images, SEO, is_visible...) are never touched here.
const PRODUCT_COLUMNS = [
  'barcode', 'category_external_id', 'name', 'brand', 'unit', 'price', 'currency_external_id',
  'quantity', 'in_price_list', 'discontinued', 'note', 'weight', 'volume', 'raw', 'deleted_at', 'synced_at',
];

const toInt = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.parseInt(String(v), 10));
const toNum = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const toStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const toBool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === -1;

@Injectable()
export class SyncService implements OnModuleInit {
  constructor(@InjectDataSource() private ds: DataSource) {}

  // Keep the change log small: drop entries older than LOG_DAYS, once at start and then hourly.
  onModuleInit() {
    const clean = () => this.ds.query(`DELETE FROM change_log WHERE at < now() - interval '${LOG_DAYS} days'`).catch(() => undefined);
    setTimeout(clean, 60_000);
    setInterval(clean, 3600_000).unref();
  }

  private check(batch: Batch<unknown>) {
    const n = (batch?.upserts?.length || 0) + (batch?.deletes?.length || 0);
    if (!batch || n > MAX_BATCH) throw new BadRequestException(`Batch must have 0..${MAX_BATCH} rows`);
  }

  async products(batch: Batch<Record<string, unknown>>) {
    this.check(batch);
    const now = new Date();
    const rows = (batch.upserts || []).map((r) => {
      const externalId = toInt(r.externalId);
      if (externalId === null || Number.isNaN(externalId)) throw new BadRequestException('externalId required');
      const p: Partial<Product> = {
        externalId,
        barcode: toStr(r.barcode),
        categoryExternalId: toInt(r.categoryExternalId),
        name: toStr(r.name) ?? '',
        brand: toStr(r.brand),
        unit: toStr(r.unit),
        price: toNum(r.price),
        currencyExternalId: toInt(r.currencyExternalId),
        quantity: toNum(r.quantity) ?? 0,
        inPriceList: toBool(r.inPriceList),
        discontinued: toBool(r.discontinued),
        note: toStr(r.note),
        weight: toNum(r.weight),
        volume: toNum(r.volume),
        raw: (r.raw as Record<string, unknown>) ?? {},
        deletedAt: null,
        syncedAt: now,
      };
      return p;
    });
    return this.apply(Product, 'products', batch, rows, PRODUCT_COLUMNS, now, PRODUCT_TRACKED);
  }

  async lookup(entity: typeof Category | typeof Currency, name: string, batch: Batch<Record<string, unknown>>) {
    this.check(batch);
    const now = new Date();
    const rows = (batch.upserts || []).map((r) => {
      const externalId = toInt(r.externalId);
      if (externalId === null || Number.isNaN(externalId)) throw new BadRequestException('externalId required');
      return { externalId, name: toStr(r.name) ?? '', raw: (r.raw as object) ?? {}, deletedAt: null, syncedAt: now };
    });
    return this.apply(entity, name, batch, rows, ['name', 'raw', 'deleted_at', 'synced_at'], now, LOOKUP_TRACKED);
  }

  private async apply(entity: any, name: string, batch: Batch<unknown>, rows: any[], cols: string[], now: Date, tracked: string[]) {
    const deletes = (batch.deletes || []).map(toInt).filter((x): x is number => x !== null && !Number.isNaN(x));
    await this.ds.transaction(async (m) => {
      // Compare with what the site has now, so the log shows exactly what changed.
      const ids = [...rows.map((r) => r.externalId), ...deletes];
      const existing = new Map<number, any>();
      if (ids.length) {
        for (const e of await m.getRepository(entity).find({ where: { externalId: In(ids) } })) existing.set(e.externalId, e);
      }
      const log: Partial<ChangeLog>[] = [];
      for (const r of rows) {
        const old = existing.get(r.externalId);
        if (!old || old.deletedAt) {
          log.push({ entity: name, action: old ? 'restored' : 'created', externalId: r.externalId, name: r.name, changes: {} });
          continue;
        }
        const changes: Record<string, [unknown, unknown]> = {};
        for (const f of tracked) {
          const a = norm(old[f]); const b = norm(r[f]);
          if (a !== b) changes[f] = [a, b];
        }
        if (Object.keys(changes).length) log.push({ entity: name, action: 'updated', externalId: r.externalId, name: r.name, changes });
      }
      for (const id of deletes) {
        const old = existing.get(id);
        if (old && !old.deletedAt) log.push({ entity: name, action: 'deleted', externalId: id, name: old.name, changes: {} });
      }
      if (log.length) await m.getRepository(ChangeLog).insert(log as any[]);
      if (rows.length) {
        await m.createQueryBuilder().insert().into(entity).values(rows).orUpdate(cols, ['external_id']).execute();
      }
      if (deletes.length) {
        await m.getRepository(entity).update({ externalId: In(deletes) }, { deletedAt: now });
      }
      await m.getRepository(SyncLog).insert({
        entity: name,
        batchId: toStr(batch.batchId),
        agentVersion: toStr(batch.agentVersion),
        upserts: rows.length,
        deletes: deletes.length,
      });
    });
    return { ok: true, upserted: rows.length, deleted: deletes.length };
  }

  // External ids that are live on the site; the agent uses them to find rows already removed from Access.
  async ids(name: string) {
    const entity = ({ products: Product, categories: Category, currencies: Currency } as Record<string, any>)[name];
    if (!entity) throw new NotFoundException();
    const rows = await this.ds.getRepository(entity).createQueryBuilder('x')
      .select('x.external_id', 'id').where('x.deleted_at IS NULL').getRawMany();
    return rows.map((r) => Number(r.id));
  }

  async status() {
    const last = await this.ds.getRepository(SyncLog).find({ order: { id: 'DESC' }, take: 1 });
    const count = (e: any) => this.ds.getRepository(e).createQueryBuilder('x').where('x.deleted_at IS NULL').getCount();
    return {
      lastSyncAt: last[0]?.receivedAt ?? null,
      products: await count(Product),
      categories: await count(Category),
      currencies: await count(Currency),
    };
  }
}

@Controller('sync')
@UseGuards(ApiKeyGuard)
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('products') products(@Body() b: Batch<Record<string, unknown>>) { return this.sync.products(b); }
  @Post('categories') categories(@Body() b: Batch<Record<string, unknown>>) { return this.sync.lookup(Category, 'categories', b); }
  @Post('currencies') currencies(@Body() b: Batch<Record<string, unknown>>) { return this.sync.lookup(Currency, 'currencies', b); }
  @Get('status') status() { return this.sync.status(); }
  @Get('ids/:entity') ids(@Param('entity') e: string) { return this.sync.ids(e); }
}
