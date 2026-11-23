import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Batch AI photo search (photo-batch.ts): one row per product search.
 *  queued → running → saved (clear case, saved by itself) | review (staff choose) | none (nothing found) | error
 *  review → accepted | skipped;  saved → undone (photos removed, back to review)
 */
export class PhotoJobs1764600000000 implements MigrationInterface {
  name = 'PhotoJobs1764600000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE product_photo_jobs (
        id serial PRIMARY KEY,
        product_id int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        status text NOT NULL CHECK (status IN ('queued', 'running', 'saved', 'review', 'none', 'error', 'accepted', 'skipped')),
        auto boolean NOT NULL DEFAULT true,   -- may save clear cases by itself
        url text,                             -- page / image link given by staff ("try with link")
        result jsonb,                         -- findPhotos() answer: candidates, scores, errors
        saved jsonb NOT NULL DEFAULT '[]',    -- /api/media paths this job added to the product
        error text,
        ms int,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        decided_by text,
        decided_at timestamptz
      );
      CREATE INDEX product_photo_jobs_status_idx ON product_photo_jobs (status, id);
      CREATE UNIQUE INDEX product_photo_jobs_open_idx ON product_photo_jobs (product_id) WHERE status IN ('queued', 'running', 'review');
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE product_photo_jobs`);
  }
}
