import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Site favourites of logged-in customers, by Access product code (plan step 6). `customer_favorites` stays as the read-only
 * copy of old led.am favourites; its rows that point to a known product are copied here once, so old users see them.
 */
export class Wishlist1764800000000 implements MigrationInterface {
  name = 'Wishlist1764800000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE customer_wishlist (
        customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_external_id int NOT NULL,
        added_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (customer_id, product_external_id)
      );
      INSERT INTO customer_wishlist (customer_id, product_external_id)
        SELECT DISTINCT customer_id, product_external_id FROM customer_favorites WHERE product_external_id IS NOT NULL
        ON CONFLICT DO NOTHING;
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE customer_wishlist`);
  }
}
