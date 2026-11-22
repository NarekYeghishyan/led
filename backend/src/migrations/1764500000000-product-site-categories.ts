import { MigrationInterface, QueryRunner } from 'typeorm';
import { CATEGORY_RULES_SEED } from '../category-rules-seed';

/**
 * Products → site categories (admin "Site categories" tree; the Access categories stay only a hint).
 *  - site_categories.match_rules: name rules (category-rules.ts), seeded from category-rules-seed.ts
 *  - product_site_categories: where each product is shown; source = manual (admin) | rule | ai (+ confidence)
 *  - products.site_cats_manual: the admin set this product's categories by hand → rules and AI leave it alone
 *  - product_ai_categories: last AI answer per product (applied ≥ 90 %, else waits for review)
 */
export class ProductSiteCategories1764500000000 implements MigrationInterface {
  name = 'ProductSiteCategories1764500000000';

  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE site_categories ADD COLUMN match_rules jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE products ADD COLUMN site_cats_manual boolean NOT NULL DEFAULT false;
      CREATE TABLE product_site_categories (
        product_id int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        site_category_id int NOT NULL REFERENCES site_categories(id) ON DELETE CASCADE,
        source text NOT NULL CHECK (source IN ('manual', 'rule', 'ai')),
        confidence smallint,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (product_id, site_category_id)
      );
      CREATE INDEX product_site_categories_cat_idx ON product_site_categories (site_category_id);
      CREATE TABLE product_ai_categories (
        product_id int PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        site_category_id int REFERENCES site_categories(id) ON DELETE SET NULL,
        confidence smallint NOT NULL DEFAULT 0,
        reason text,
        status text NOT NULL CHECK (status IN ('applied', 'pending', 'accepted', 'rejected', 'none', 'replaced')),
        product_name text NOT NULL,   -- the name the AI saw: a renamed product is asked again
        model text,
        checked_at timestamptz NOT NULL DEFAULT now(),
        decided_by text,
        decided_at timestamptz
      );
      CREATE INDEX product_ai_categories_status_idx ON product_ai_categories (status);
    `);

    // seed the rules by RU path (categories renamed/removed in the admin since the tree seed are skipped)
    const rows: { id: number; parent_id: number | null; name_ru: string }[] = await q.query(`SELECT id, parent_id, name_ru FROM site_categories`);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const path = (r: (typeof rows)[number]): string => (r.parent_id === null ? r.name_ru : `${path(byId.get(r.parent_id)!)} › ${r.name_ru}`);
    const byPath = new Map(rows.map((r) => [path(r), r.id]));
    for (const [p, rules] of Object.entries(CATEGORY_RULES_SEED)) {
      const id = byPath.get(p);
      if (id) await q.query(`UPDATE site_categories SET match_rules = $2 WHERE id = $1 AND match_rules = '[]'`, [id, JSON.stringify(rules)]);
    }
  }

  async down(q: QueryRunner) {
    await q.query(`
      DROP TABLE product_ai_categories;
      DROP TABLE product_site_categories;
      ALTER TABLE products DROP COLUMN site_cats_manual;
      ALTER TABLE site_categories DROP COLUMN match_rules;
    `);
  }
}
