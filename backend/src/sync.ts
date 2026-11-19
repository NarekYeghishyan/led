import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
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

interface MirrorBatch extends Batch<{ key: unknown; data: Record<string, unknown> }> {
  columns?: string[];
  keyColumns?: string[];
  /** last batch of the agent's first full read of this table */
  final?: boolean;
}

/** A readable name for a mirrored row: the first text column that looks like a name, else the first text. */
const NAME_HINT = /назв|наимен|марка|имя|фио|name|клиент|фирма/i;
function rowLabel(d: Record<string, unknown>, keyCols: string[] = []) {
  const entries = Object.entries(d).filter(([k, v]) => !keyCols.includes(k) && typeof v === 'string' && v.trim());
  const hit = entries.find(([k]) => NAME_HINT.test(k)) || entries[0];
  return hit ? String(hit[1]).slice(0, 200) : null;
}

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
// Round like the database column does, so 124.0727 from Access and 124.07 stored are not a "change".
const round = (v: number | null, d: number) => (v === null || Number.isNaN(v) ? v : Math.round(v * 10 ** d) / 10 ** d);
const toBool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === -1;

/** Last heartbeat from the Access agent (in memory; the agent re-sends it every minute). */
export const agentState: { seenAt: Date | null; version: string | null; error: string | null } = { seenAt: null, version: null, error: null };

@Injectable()
export class SyncService {
  constructor(@InjectDataSource() private ds: DataSource) {}

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
        price: round(toNum(r.price), 2),
        currencyExternalId: toInt(r.currencyExternalId),
        quantity: round(toNum(r.quantity), 3) ?? 0,
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

  /**
   * Any Access table, stored as-is (jsonb per row). Every changed field goes to the change log.
   * "created" rows are logged only after the table's first full load (final=true), so the
   * initial upload does not fill the log with thousands of "added" entries.
   */
  async mirror(table: string, b: MirrorBatch) {
    this.check(b);
    if (!table || table.length > 128) throw new BadRequestException('table name');
    const now = new Date();
    const entity = `t:${table}`;
    const rows = (b.upserts || []).map((r) => {
      const key = toStr(r?.key);
      if (!key) throw new BadRequestException('key required');
      return { key, data: (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown> };
    });
    const deletes = (b.deletes || []).map((k) => String(k));
    await this.ds.transaction(async (m) => {
      const [meta] = await m.query(`SELECT loaded FROM mirror_tables WHERE name = $1`, [table]);
      const loaded = !!meta?.loaded;
      const keys = [...rows.map((r) => r.key), ...deletes];
      const existing = new Map<string, { data: Record<string, unknown>; deleted_at: Date | null }>();
      if (keys.length) {
        for (const e of await m.query(`SELECT key, data, deleted_at FROM mirror_rows WHERE tbl = $1 AND key = ANY($2)`, [table, keys])) {
          existing.set(e.key, e);
        }
      }
      const log: Partial<ChangeLog>[] = [];
      const label = (d: Record<string, unknown>) => rowLabel(d, b.keyColumns);
      for (const r of rows) {
        const old = existing.get(r.key);
        if (!old || old.deleted_at) {
          if (loaded || old) log.push({ entity, action: old ? 'restored' : 'created', rowKey: r.key, name: label(r.data), changes: {} });
          continue;
        }
        const changes: Record<string, [unknown, unknown]> = {};
        for (const f of new Set([...Object.keys(old.data), ...Object.keys(r.data)])) {
          const a = norm(old.data[f]); const c = norm(r.data[f]);
          if (a !== c) changes[f] = [a, c];
        }
        if (Object.keys(changes).length) log.push({ entity, action: 'updated', rowKey: r.key, name: label(r.data), changes });
      }
      for (const k of deletes) {
        const old = existing.get(k);
        if (old && !old.deleted_at) log.push({ entity, action: 'deleted', rowKey: k, name: label(old.data), changes: {} });
      }
      if (log.length) await m.getRepository(ChangeLog).insert(log as any[]);
      if (rows.length) {
        await m.query(
          `INSERT INTO mirror_rows (tbl, key, data, deleted_at, synced_at)
           SELECT $1, x.key, x.data, NULL, $3 FROM jsonb_to_recordset($2::jsonb) AS x(key text, data jsonb)
           ON CONFLICT (tbl, key) DO UPDATE SET data = EXCLUDED.data, deleted_at = NULL, synced_at = EXCLUDED.synced_at`,
          [table, JSON.stringify(rows), now]);
      }
      if (deletes.length) {
        await m.query(`UPDATE mirror_rows SET deleted_at = $3 WHERE tbl = $1 AND key = ANY($2) AND deleted_at IS NULL`, [table, deletes, now]);
      }
      await m.query(
        `INSERT INTO mirror_tables (name, columns, key_columns, loaded, synced_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET
           columns = CASE WHEN jsonb_array_length(EXCLUDED.columns) > 0 THEN EXCLUDED.columns ELSE mirror_tables.columns END,
           key_columns = CASE WHEN jsonb_array_length(EXCLUDED.columns) > 0 THEN EXCLUDED.key_columns ELSE mirror_tables.key_columns END,
           loaded = mirror_tables.loaded OR EXCLUDED.loaded, synced_at = EXCLUDED.synced_at`,
        [table, JSON.stringify(b.columns || []), JSON.stringify(b.keyColumns || []), !!b.final, now]);
      if (rows.length || deletes.length) {
        await m.getRepository(SyncLog).insert({
          entity, batchId: toStr(b.batchId), agentVersion: toStr(b.agentVersion), upserts: rows.length, deletes: deletes.length,
        });
      }
    });
    return { ok: true, upserted: rows.length, deleted: deletes.length };
  }

  async mirrorKeys(table: string) {
    const rows = await this.ds.query(`SELECT key FROM mirror_rows WHERE tbl = $1 AND deleted_at IS NULL`, [table]);
    return rows.map((r: { key: string }) => r.key);
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
  @Post('heartbeat') heartbeat(@Body() b: { version?: unknown; error?: unknown }) {
    agentState.seenAt = new Date();
    agentState.version = typeof b?.version === 'string' ? b.version.slice(0, 32) : null;
    agentState.error = typeof b?.error === 'string' && b.error ? b.error.slice(0, 500) : null;
    return { ok: true };
  }
  @Post('mirror/:table') mirror(@Param('table') t: string, @Body() b: MirrorBatch) { return this.sync.mirror(t, b); }
  @Get('mirror-keys/:table') mirrorKeys(@Param('table') t: string) { return this.sync.mirrorKeys(t); }
  @Get('status') status() { return this.sync.status(); }
  @Get('ids/:entity') ids(@Param('entity') e: string) { return this.sync.ids(e); }
}
