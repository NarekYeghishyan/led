import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeLog1763900000000 implements MigrationInterface {
  name = 'ChangeLog1763900000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE change_log (
        id bigserial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        entity text NOT NULL,
        action text NOT NULL,
        external_id int NOT NULL,
        name text,
        changes jsonb NOT NULL DEFAULT '{}'
      );
      CREATE INDEX change_log_at_idx ON change_log (at);
      CREATE INDEX change_log_ext_idx ON change_log (entity, external_id);
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE change_log`);
  }
}
