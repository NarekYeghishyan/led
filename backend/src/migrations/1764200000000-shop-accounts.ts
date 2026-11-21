import { MigrationInterface, QueryRunner } from 'typeorm';

/** Storefront accounts: phone login, saved addresses, logout-everywhere counter, password reset codes. */
export class ShopAccounts1764200000000 implements MigrationInterface {
  name = 'ShopAccounts1764200000000';

  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE customers
        ADD COLUMN source text NOT NULL DEFAULT 'legacy',      -- legacy (old led.am import) | site (registered on the new site)
        ADD COLUMN addresses jsonb NOT NULL DEFAULT '[]',      -- [{l, city, a, def}] saved by the customer
        ADD COLUMN token_version int NOT NULL DEFAULT 0;       -- +1 = every session of this customer is logged out
      UPDATE customers SET source = 'site' WHERE legacy_id IS NULL;
      -- phone match = last 8 digits (Armenian national number), works for 091…, +37491…, 374 91 …
      CREATE INDEX customers_phone8_idx ON customers (right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 8));

      CREATE TABLE customer_reset_codes (
        id serial PRIMARY KEY,
        customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        code_hash text NOT NULL,
        channel text NOT NULL,                  -- email | sms
        attempts int NOT NULL DEFAULT 0,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX customer_reset_codes_customer_idx ON customer_reset_codes (customer_id, created_at DESC);
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`
      DROP TABLE customer_reset_codes;
      DROP INDEX customers_phone8_idx;
      ALTER TABLE customers DROP COLUMN source, DROP COLUMN addresses, DROP COLUMN token_version;
    `);
  }
}
