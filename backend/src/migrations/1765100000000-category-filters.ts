import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per-category filter list (plan step 8): null = automatic (storefront specFacets rule); array = these spec keys, in order. */
export class CategoryFilters1765100000000 implements MigrationInterface {
  name = 'CategoryFilters1765100000000';

  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE site_categories ADD COLUMN filter_keys text[]`);
  }

  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE site_categories DROP COLUMN filter_keys`);
  }
}
