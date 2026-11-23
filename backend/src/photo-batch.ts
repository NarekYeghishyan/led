/**
 * Batch AI photo search (admin "Фото товаров (AI)", README "AI product photos" → Batch).
 *
 * Staff start a batch for N in-stock products without photos. The worker runs findPhotos() for one product at a time:
 *  - clear case (auto on): main photo from Icecat or the brand's own site, match ≥ 95, quality ≥ 80 → saved by itself
 *    (+ up to 3 official gallery photos), status "saved" — can be undone;
 *  - otherwise status "review": staff pick photos, paste a link and retry, or skip;
 *  - nothing found → "none", failure → "error" (both can be retried, also with a link).
 * A product is taken into a batch only once (it has no job yet); later tries go through "retry".
 */
import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, NotFoundException, OnApplicationBootstrap,
  OnApplicationShutdown, Param, ParseIntPipe, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from './auth';
import { Product } from './entities';
import { addPhotos, findPhotos, PhotoCandidate, PhotoSearchResult, removePhotoFiles } from './photos';

type Req = { user?: { email?: string } };
const STATUSES = ['queued', 'running', 'saved', 'review', 'none', 'error', 'accepted', 'skipped'] as const;
const MAX_BATCH = 300;
const AUTO_MATCH = 95, AUTO_QUALITY = 80, AUTO_GALLERY = 3;
const PAUSE_MS = 1500;
const ELIGIBLE = `p.deleted_at IS NULL AND p.quantity > 0 AND p.images = '[]'::jsonb
  AND NOT EXISTS (SELECT 1 FROM product_photo_jobs j WHERE j.product_id = p.id)`;

/** Photos a clear case saves by itself, or [] when staff must decide. */
export function autoPick(r: PhotoSearchResult): PhotoCandidate[] {
  const best = r.best >= 0 ? r.candidates[r.best] : null;
  if (!best || !best.official || (best.match ?? 0) < AUTO_MATCH || (best.quality ?? 0) < AUTO_QUALITY) return [];
  const extra = r.candidates.filter((c) => c !== best && c.gallery && c.official && c.kind === 'product' && (c.match ?? 0) >= AUTO_MATCH);
  return [best, ...extra.slice(0, AUTO_GALLERY)];
}

@Injectable()
export class PhotoBatchService implements OnApplicationBootstrap, OnApplicationShutdown {
  private log = new Logger('PhotoBatch');
  private working = false;
  private stopping = false;
  current: { jobId: number; productId: number; name: string; since: Date } | null = null;
  constructor(@InjectDataSource() private ds: DataSource) {}

  async onApplicationBootstrap() {
    // a restart in the middle of a job: run it again
    await this.ds.query(`UPDATE product_photo_jobs SET status = 'queued' WHERE status = 'running'`).catch(() => undefined);
    setTimeout(() => this.kick(), 20_000);
  }
  onApplicationShutdown() { this.stopping = true; }

  get running() { return this.working; }

  /** Queues up to `limit` in-stock products without photos (newest first). */
  async start(limit: number, auto: boolean, by: string | null) {
    const n = Math.max(1, Math.min(MAX_BATCH, Math.floor(Number(limit) || 10)));
    const rows: { id: number }[] = await this.ds.query(
      `INSERT INTO product_photo_jobs (product_id, status, auto, created_by)
       SELECT p.id, 'queued', $2, $3 FROM products p WHERE ${ELIGIBLE} ORDER BY p.id DESC LIMIT $1
       RETURNING id`, [n, !!auto, by]);
    this.log.log(`${by || '?'} queued ${rows.length} products (auto=${!!auto})`);
    this.kick();
    return { queued: rows.length };
  }

  /** Removes the jobs that have not started yet. The running one finishes. */
  async stop() {
    // TypeORM returns [rows, count] for DELETE / UPDATE
    const [, count] = await this.ds.query(`DELETE FROM product_photo_jobs WHERE status = 'queued'`) as [unknown, number];
    return { removed: count || 0 };
  }

  kick() {
    if (this.working || this.stopping) return;
    this.working = true;
    this.loop().catch((e) => this.log.error(`worker stopped: ${(e as Error).message}`)).finally(() => { this.working = false; this.current = null; });
  }

  private async loop() {
    while (!this.stopping) {
      const [rows] = await this.ds.query(
        `UPDATE product_photo_jobs SET status = 'running'
         WHERE id = (SELECT id FROM product_photo_jobs WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id, product_id AS "productId", auto, url`) as [{ id: number; productId: number; auto: boolean; url: string | null }[], number];
      const job = rows?.[0];
      if (!job) return;
      await this.runJob(job);
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  private async runJob(job: { id: number; productId: number; auto: boolean; url: string | null }) {
    const t0 = Date.now();
    const finish = (status: string, fields: { result?: unknown; saved?: string[]; error?: string | null } = {}) => this.ds.query(
      `UPDATE product_photo_jobs SET status = $2, result = COALESCE($3::jsonb, result), saved = COALESCE($4::jsonb, saved),
         error = $5, ms = $6, finished_at = now() WHERE id = $1`,
      [job.id, status, fields.result === undefined ? null : JSON.stringify(fields.result),
        fields.saved === undefined ? null : JSON.stringify(fields.saved), fields.error ?? null, Date.now() - t0]);
    const p = await this.ds.getRepository(Product).findOneBy({ id: job.productId });
    if (!p) return finish('error', { error: 'Product not found' });
    this.current = { jobId: job.id, productId: p.id, name: p.name, since: new Date() };
    try {
      const r = await findPhotos(p, job.url || undefined);
      if (!r.candidates.length) return await finish('none', { result: r, error: r.errors.join('; ') || null });
      const pick = job.auto && !job.url ? autoPick(r) : [];
      // staff may have added photos meanwhile: then never save by itself
      const fresh = await this.ds.getRepository(Product).findOneBy({ id: p.id });
      if (pick.length && !(fresh?.images || []).length) {
        const { added } = await addPhotos(this.ds, p.id, pick.map((c) => c.url), true);
        this.log.log(`product ${p.id}: auto-saved ${added.length} photo(s)`);
        return await finish('saved', { result: r, saved: added });
      }
      return await finish('review', { result: r });
    } catch (e) {
      return finish('error', { error: String((e as Error).message || e).slice(0, 500) });
    } finally {
      this.current = null;
    }
  }

  async job(id: number) {
    const [j] = await this.ds.query(`SELECT * FROM product_photo_jobs WHERE id = $1`, [id]);
    if (!j) throw new NotFoundException();
    return j as { id: number; product_id: number; status: string; saved: string[] };
  }
}

@Controller('admin/photo-batch')
@UseGuards(JwtGuard)
export class PhotoBatchController {
  constructor(@InjectDataSource() private ds: DataSource, private svc: PhotoBatchService) {}

  @Get('stats')
  async stats() {
    const counts: { status: string; n: number }[] = await this.ds.query(`SELECT status, COUNT(*)::int AS n FROM product_photo_jobs GROUP BY status`);
    const [{ eligible, inStock, withPhotos }] = await this.ds.query(`
      SELECT (SELECT COUNT(*)::int FROM products p WHERE ${ELIGIBLE}) AS eligible,
             COUNT(*)::int AS "inStock",
             COUNT(*) FILTER (WHERE images <> '[]'::jsonb)::int AS "withPhotos"
      FROM products WHERE deleted_at IS NULL AND quantity > 0`);
    const by = Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n || 0]));
    return { running: this.svc.running, current: this.svc.current, counts: by, eligible, inStock, withPhotos };
  }

  /** Jobs of one status (or all), newest first. */
  @Get('jobs')
  async jobs(@Query('status') status = 'review', @Query('page') page = '1') {
    const st = (STATUSES as readonly string[]).includes(status) ? status : null;
    const pg = Math.max(1, Number(page) || 1), size = 20;
    const rows = await this.ds.query(`
      SELECT j.id, j.product_id AS "productId", j.status, j.auto, j.url, j.result, j.saved, j.error, j.ms,
             j.created_at AS "createdAt", j.finished_at AS "finishedAt", j.decided_by AS "decidedBy",
             p.name, p.external_id AS "externalId", p.barcode, p.images, p.quantity
      FROM product_photo_jobs j JOIN products p ON p.id = j.product_id
      WHERE ($1::text IS NULL OR j.status = $1)
      ORDER BY j.finished_at DESC NULLS FIRST, j.id DESC LIMIT ${size} OFFSET ${(pg - 1) * size}`, [st]);
    const [{ total }] = await this.ds.query(`SELECT COUNT(*)::int AS total FROM product_photo_jobs WHERE ($1::text IS NULL OR status = $1)`, [st]);
    return { items: rows, total, page: pg, size };
  }

  @Post('start')
  start(@Body() b: { limit?: number; auto?: boolean }, @Req() req: Req) {
    return this.svc.start(Number(b?.limit) || 10, b?.auto !== false, req.user?.email || null);
  }

  @Post('stop')
  stop() { return this.svc.stop(); }

  /** Saves the photos staff picked. Body: { urls, main? }. */
  @Post('jobs/:id/accept')
  async accept(@Param('id', ParseIntPipe) id: number, @Body() b: { urls?: string[]; main?: boolean }, @Req() req: Req) {
    const j = await this.svc.job(id);
    if (!['review', 'none', 'saved', 'accepted', 'skipped'].includes(j.status)) throw new BadRequestException(`Job is ${j.status}`);
    const urls = Array.isArray(b?.urls) ? b.urls.map(String) : [];
    if (!urls.length) throw new BadRequestException('Pick at least one photo');
    const { images, added } = await addPhotos(this.ds, j.product_id, urls, b?.main !== false);
    await this.ds.query(
      `UPDATE product_photo_jobs SET status = 'accepted', saved = saved || $2::jsonb, decided_by = $3, decided_at = now() WHERE id = $1`,
      [id, JSON.stringify(added), req.user?.email || null]);
    return { images };
  }

  @Post('jobs/:id/skip')
  async skip(@Param('id', ParseIntPipe) id: number, @Req() req: Req) {
    const j = await this.svc.job(id);
    if (['queued', 'running'].includes(j.status)) throw new BadRequestException(`Job is ${j.status}`);
    await this.ds.query(`UPDATE product_photo_jobs SET status = 'skipped', decided_by = $2, decided_at = now() WHERE id = $1`, [id, req.user?.email || null]);
    return { ok: true };
  }

  /** Search again, optionally only on a pasted page / image link. Body: { url? }. */
  @Post('jobs/:id/retry')
  async retry(@Param('id', ParseIntPipe) id: number, @Body() b: { url?: string }) {
    const j = await this.svc.job(id);
    if (['queued', 'running'].includes(j.status)) throw new BadRequestException(`Job is ${j.status}`);
    const url = String(b?.url || '').trim() || null;
    if (url && !/^https?:\/\//i.test(url)) throw new BadRequestException('Link must start with http(s)://');
    await this.ds.query(`UPDATE product_photo_jobs SET status = 'queued', url = $2, error = NULL, finished_at = NULL WHERE id = $1`, [id, url]);
    this.svc.kick();
    return { ok: true };
  }

  /** Removes the photos this job saved (if still on the product) and puts the job back to review. */
  @Post('jobs/:id/undo')
  async undo(@Param('id', ParseIntPipe) id: number, @Req() req: Req) {
    const j = await this.svc.job(id);
    if (!['saved', 'accepted'].includes(j.status)) throw new BadRequestException(`Job is ${j.status}`);
    const repo = this.ds.getRepository(Product);
    const p = await repo.findOneBy({ id: j.product_id });
    const saved = j.saved || [];
    if (p) {
      await repo.update({ id: p.id }, { images: (p.images || []).filter((x) => !saved.includes(x)) });
      await removePhotoFiles(p.id, saved.filter((x) => (p.images || []).includes(x)));
    }
    await this.ds.query(`UPDATE product_photo_jobs SET status = 'review', saved = '[]', decided_by = $2, decided_at = now() WHERE id = $1`, [id, req.user?.email || null]);
    return { ok: true };
  }
}
