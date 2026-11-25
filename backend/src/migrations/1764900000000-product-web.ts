import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin web fields of a product (plan step 8): `web` = { desc, title, meta: { hy, ru, en } } (description, SEO title,
 * meta description per language), `old_price` (֏, shown crossed out when above the current price), `spec_edit`
 * = { specKey: value } corrections of the name parser ('' hides the key). Old single-language columns are copied to web.*.hy.
 */
export class ProductWeb1764900000000 implements MigrationInterface {
  name = 'ProductWeb1764900000000';

  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE products
        ADD COLUMN web jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN old_price numeric(14,2),
        ADD COLUMN spec_edit jsonb NOT NULL DEFAULT '{}';
      UPDATE products SET web = jsonb_strip_nulls(jsonb_build_object(
          'desc', CASE WHEN web_description <> '' THEN jsonb_build_object('hy', web_description) END,
          'title', CASE WHEN seo_title <> '' THEN jsonb_build_object('hy', seo_title) END,
          'meta', CASE WHEN seo_description <> '' THEN jsonb_build_object('hy', seo_description) END))
        WHERE coalesce(web_description, '') <> '' OR coalesce(seo_title, '') <> '' OR coalesce(seo_description, '') <> '';
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE products DROP COLUMN web, DROP COLUMN old_price, DROP COLUMN spec_edit`);
  }
}
