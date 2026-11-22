import { MigrationInterface, QueryRunner } from 'typeorm';
import { SITE_ICONS_SEED } from '../site-icons-seed';

/** Icons for site categories: the site's built-in sprite (read-only) + icons added in the admin. */
export class SiteIcons1764400000000 implements MigrationInterface {
  name = 'SiteIcons1764400000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE site_icons (
        id serial PRIMARY KEY,
        key text NOT NULL UNIQUE,            -- SVG symbol id on the site; site_categories.icon refers to it
        name text NOT NULL DEFAULT '',
        view_box text NOT NULL DEFAULT '0 0 24 24',
        body text NOT NULL,                  -- cleaned inner SVG markup (site-icons.ts cleanSvg)
        builtin boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    for (const i of SITE_ICONS_SEED) {
      await q.query(`INSERT INTO site_icons (key, name, view_box, body, builtin) VALUES ($1, $1, $2, $3, true)`, [i.key, i.viewBox, i.body]);
    }
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE site_icons`);
  }
}
