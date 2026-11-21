import { MigrationInterface, QueryRunner } from 'typeorm';

/** Site customers + their order history (imported from the old led.am MySQL site, later also new site orders). */
export class Customers1764100000000 implements MigrationInterface {
  name = 'Customers1764100000000';

  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE customers (
        id serial PRIMARY KEY,
        legacy_id int UNIQUE,                       -- s1_siteusers.id on the old site
        name text NOT NULL DEFAULT '',
        email text,
        login text,
        phone text,
        address text,
        postal_code text,
        city text,
        country text,
        type text NOT NULL DEFAULT 'consumer',      -- consumer | dealer | corporate
        company text,                               -- dealer company name
        law_name text, law_address text, factual_address text, taxcode text, bankinfo text,
        -- bcrypt hash. password_scheme says what was hashed:
        --   bcrypt        = the password itself
        --   legacy-md5    = md5(password) from the old site (upgraded to bcrypt on first login)
        --   legacy-mysql41 = MySQL PASSWORD() from the old site
        --   reset         = no usable password, customer must reset it
        password_hash text,
        password_scheme text NOT NULL DEFAULT 'reset',
        confirmed boolean NOT NULL DEFAULT true,    -- old site "active" flag (e-mail confirmed)
        blocked boolean NOT NULL DEFAULT false,
        blocked_reason text,
        admin_note text,
        registered_at timestamptz,
        last_visit_at timestamptz,
        last_login_at timestamptz,
        raw jsonb NOT NULL DEFAULT '{}',
        edited_at timestamptz,                      -- last edit in the admin panel (import then keeps the profile)
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX customers_email_idx ON customers (lower(email));
      CREATE INDEX customers_login_idx ON customers (lower(login));
      CREATE INDEX customers_phone_idx ON customers (phone);

      CREATE TABLE customer_orders (
        id serial PRIMARY KEY,
        legacy_id int UNIQUE,                       -- s1_order.id
        customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        source text NOT NULL DEFAULT 'legacy',      -- legacy | site
        ordered_at timestamptz,
        contact_person text, contact_phone text, contact_email text,
        country text, city text, address text, address_extra text,
        total numeric(14,2),
        shipping boolean NOT NULL DEFAULT false,
        shipping_cost numeric(14,2),
        currency text,
        payment_type text,
        shop_address text,
        status text,                                -- received | process | resolved
        paid boolean NOT NULL DEFAULT false,
        paid_at timestamptz,
        raw jsonb NOT NULL DEFAULT '{}'
      );
      CREATE INDEX customer_orders_customer_idx ON customer_orders (customer_id, ordered_at DESC);

      CREATE TABLE customer_order_items (
        id serial PRIMARY KEY,
        legacy_id int UNIQUE,                       -- s1_orderproducts.id
        order_id int NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
        article text,                               -- product code at the time of the order (= Access КодТовара)
        product_external_id int,                    -- link to products.external_id when the code is numeric
        legacy_product_id int,
        name text,                                  -- product name at the time of the order
        price numeric(14,2),
        qty int NOT NULL DEFAULT 1,
        total numeric(14,2),
        currency text
      );
      CREATE INDEX customer_order_items_order_idx ON customer_order_items (order_id);
      CREATE INDEX customer_order_items_product_idx ON customer_order_items (product_external_id);

      CREATE TABLE customer_favorites (
        customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        legacy_product_id int NOT NULL,
        article text,
        product_external_id int,
        name text,
        PRIMARY KEY (customer_id, legacy_product_id)
      );

      CREATE TABLE customer_import_log (
        id serial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        file text,
        stats jsonb NOT NULL DEFAULT '{}',
        error text
      );
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`
      DROP TABLE customer_import_log;
      DROP TABLE customer_favorites;
      DROP TABLE customer_order_items;
      DROP TABLE customer_orders;
      DROP TABLE customers;
    `);
  }
}
