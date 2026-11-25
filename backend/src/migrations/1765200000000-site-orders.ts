import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Real orders from the storefront (plan step 10). They live in the same `customer_orders` / `customer_order_items` tables
 * as the old led.am orders (source = 'site'), so the account and the admin customer card show both. Guests may order:
 * customer_id becomes nullable. Status of site orders: new → confirmed → shipped → done, or cancelled; every change in
 * customer_order_events.
 */
export class SiteOrders1765200000000 implements MigrationInterface {
  name = 'SiteOrders1765200000000';

  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE customer_orders ALTER COLUMN customer_id DROP NOT NULL;
      ALTER TABLE customer_orders
        ADD COLUMN number text UNIQUE,                 -- LED-105001 (site orders only)
        ADD COLUMN kind text,                          -- checkout | oneclick
        ADD COLUMN lang text,
        ADD COLUMN customer_type text,                 -- person | company
        ADD COLUMN company text,
        ADD COLUMN tax_code text,
        ADD COLUMN delivery text,                      -- pick | cour | reg
        ADD COLUMN region text,
        ADD COLUMN delivery_day date,
        ADD COLUMN delivery_slot text,
        ADD COLUMN comment text,
        ADD COLUMN call_me boolean NOT NULL DEFAULT true,
        ADD COLUMN staff_note text,
        ADD COLUMN updated_at timestamptz,
        ADD COLUMN client_ip text;
      CREATE SEQUENCE customer_order_number_seq START 105001;
      CREATE INDEX customer_orders_site_idx ON customer_orders (ordered_at DESC) WHERE source = 'site';
      CREATE TABLE customer_order_events (
        id serial PRIMARY KEY,
        order_id int NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
        at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL,
        note text,
        by text
      );
      CREATE INDEX customer_order_events_order_idx ON customer_order_events (order_id, at);
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`
      DROP TABLE customer_order_events;
      DROP SEQUENCE customer_order_number_seq;
      DROP INDEX customer_orders_site_idx;
      ALTER TABLE customer_orders DROP COLUMN number, DROP COLUMN kind, DROP COLUMN lang, DROP COLUMN customer_type, DROP COLUMN company,
        DROP COLUMN tax_code, DROP COLUMN delivery, DROP COLUMN region, DROP COLUMN delivery_day, DROP COLUMN delivery_slot,
        DROP COLUMN comment, DROP COLUMN call_me, DROP COLUMN staff_note, DROP COLUMN updated_at, DROP COLUMN client_ip;
    `);
  }
}
