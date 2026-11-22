import { MigrationInterface, QueryRunner } from 'typeorm';
import { SITE_CATEGORIES_SEED, type SeedCat } from '../site-categories-seed';

/**
 * Storefront catalog tree (admin "Site categories"): section → group → item, RU/HY/EN names.
 * Not the Access categories (`categories` table, written by the agent); a site category can be linked to Access
 * categories (`access_category_ids`) so the future storefront knows which products it shows.
 * Seeded with the tree the static site had on 2026-11-22.
 */
export class SiteCategories1764300000000 implements MigrationInterface {
  name = 'SiteCategories1764300000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE site_categories (
        id serial PRIMARY KEY,
        parent_id int REFERENCES site_categories(id) ON DELETE CASCADE,
        sort int NOT NULL DEFAULT 0,
        slug text NOT NULL,
        name_ru text NOT NULL DEFAULT '',
        name_hy text NOT NULL DEFAULT '',
        name_en text NOT NULL DEFAULT '',
        icon text,                                   -- sections only: id of an SVG symbol on the site (pc, laptop, cpu…)
        promo_ru text, promo_hy text, promo_en text, -- sections only: offer line in the catalog popup
        is_visible boolean NOT NULL DEFAULT true,
        access_category_ids int[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX site_categories_slug_idx ON site_categories (coalesce(parent_id, 0), slug);
      CREATE INDEX site_categories_parent_idx ON site_categories (parent_id, sort);
    `);
    const insert = async (c: SeedCat, parent: number | null, sort: number) => {
      const [row] = await q.query(
        `INSERT INTO site_categories (parent_id, sort, slug, name_ru, name_hy, name_en, icon, promo_ru, promo_hy, promo_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [parent, sort, c.slug, c.name[0], c.name[1], c.name[2], c.icon ?? null, c.promo?.[0] ?? null, c.promo?.[1] ?? null, c.promo?.[2] ?? null]);
      for (const [i, ch] of (c.children || []).entries()) await insert(ch, row.id, (i + 1) * 10);
    };
    for (const [i, c] of SITE_CATEGORIES_SEED.entries()) await insert(c, null, (i + 1) * 10);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE site_categories`);
  }
}
