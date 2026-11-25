import { MigrationInterface, QueryRunner } from 'typeorm';

/** Editable site blocks (plan step 8): one JSON document per key, e.g. 'home' = slider / quick links / tabs / hidden blocks. */
export class SiteBlocks1765000000000 implements MigrationInterface {
  name = 'SiteBlocks1765000000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE site_blocks (
        key text PRIMARY KEY,
        data jsonb NOT NULL DEFAULT '{}',
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text
      );
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE site_blocks`);
  }
}
