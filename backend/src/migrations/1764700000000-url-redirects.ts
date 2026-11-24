import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permanent (301) redirects of the storefront, so indexed URLs keep working:
 *  - 'slug':    a site category was renamed / moved / deleted in the admin (old path → new path)
 *  - 'old-led': old led.am category pages (/products/category/<alias>) → new site category
 *  - 'manual':  added by hand
 * Paths have no language prefix and no ".html": "/laptops/gaming", "/products/category/pc_intel".
 * Old product URLs need no rows: they end with "_<Access code>" and are resolved by rule (storefront.ts resolve()).
 */
export class UrlRedirects1764700000000 implements MigrationInterface {
  name = 'UrlRedirects1764700000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE url_redirects (
        from_path text PRIMARY KEY,
        to_path text NOT NULL,
        source text NOT NULL CHECK (source IN ('slug', 'old-led', 'manual')),
        note text,
        hits int NOT NULL DEFAULT 0,
        last_hit_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX url_redirects_to_idx ON url_redirects (to_path);
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE url_redirects`);
  }
}
