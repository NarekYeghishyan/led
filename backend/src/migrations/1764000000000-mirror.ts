import { MigrationInterface, QueryRunner } from 'typeorm';

/** Copy of every Access table (one jsonb row per Access row), so the admin can see everything the store program does. */
export class Mirror1764000000000 implements MigrationInterface {
  name = 'Mirror1764000000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE mirror_tables (
        name text PRIMARY KEY,
        columns jsonb NOT NULL DEFAULT '[]',
        key_columns jsonb NOT NULL DEFAULT '[]',
        loaded boolean NOT NULL DEFAULT false,
        synced_at timestamptz
      );
      CREATE TABLE mirror_rows (
        tbl text NOT NULL,
        key text NOT NULL,
        data jsonb NOT NULL DEFAULT '{}',
        deleted_at timestamptz,
        synced_at timestamptz,
        PRIMARY KEY (tbl, key)
      );
      ALTER TABLE change_log ALTER COLUMN external_id DROP NOT NULL;
      ALTER TABLE change_log ADD COLUMN row_key text;
      CREATE INDEX change_log_key_idx ON change_log (entity, row_key);
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`
      DROP INDEX change_log_key_idx;
      ALTER TABLE change_log DROP COLUMN row_key;
      DROP TABLE mirror_rows;
      DROP TABLE mirror_tables;
    `);
  }
}
