import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1763380000000 implements MigrationInterface {
  name = 'Init1763380000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE categories (
        id serial PRIMARY KEY,
        external_id int NOT NULL UNIQUE,
        name text NOT NULL DEFAULT '',
        raw jsonb NOT NULL DEFAULT '{}',
        deleted_at timestamptz,
        synced_at timestamptz
      );
      CREATE TABLE currencies (
        id serial PRIMARY KEY,
        external_id int NOT NULL UNIQUE,
        name text NOT NULL DEFAULT '',
        raw jsonb NOT NULL DEFAULT '{}',
        deleted_at timestamptz,
        synced_at timestamptz
      );
      CREATE TABLE products (
        id serial PRIMARY KEY,
        external_id int NOT NULL UNIQUE,
        barcode text,
        category_external_id int,
        name text NOT NULL DEFAULT '',
        brand text,
        unit text,
        price numeric(14,2),
        currency_external_id int,
        quantity numeric(14,3) NOT NULL DEFAULT 0,
        in_price_list boolean NOT NULL DEFAULT false,
        discontinued boolean NOT NULL DEFAULT false,
        note text,
        weight double precision,
        volume double precision,
        raw jsonb NOT NULL DEFAULT '{}',
        deleted_at timestamptz,
        synced_at timestamptz,
        slug text UNIQUE,
        web_description text,
        images jsonb NOT NULL DEFAULT '[]',
        is_visible boolean NOT NULL DEFAULT true,
        seo_title text,
        seo_description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX products_barcode_idx ON products (barcode);
      CREATE INDEX products_category_idx ON products (category_external_id);
      CREATE TABLE sync_log (
        id serial PRIMARY KEY,
        received_at timestamptz NOT NULL DEFAULT now(),
        entity text NOT NULL,
        batch_id text,
        upserts int NOT NULL DEFAULT 0,
        deletes int NOT NULL DEFAULT 0,
        agent_version text,
        error text
      );
      CREATE INDEX sync_log_received_idx ON sync_log (received_at);
      CREATE TABLE admin_users (
        id serial PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role text NOT NULL DEFAULT 'admin',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE admin_users, sync_log, products, currencies, categories`);
  }
}
