# LED Computers — Store ↔ Website Sync Project

Status: draft v1 (2026-11-17)

## 1. Goal

The store runs a Microsoft Access database (`D:\LED\Data.mdb`) on a local **Windows Server 2016**. Staff use it every day: they sell items, receive stock, and change prices and products.

Those changes must appear on the **new website** automatically, within seconds or minutes:

- the stock count changes after a sale
- a product becomes "out of stock"
- a price changes
- a product is added or removed

The new website is built with **NestJS + PostgreSQL + React**.

## 2. Recommended changes to the original idea

| Original idea | Recommendation | Why |
|---|---|---|
| "Access changes are sent via API to the website" | Yes, but a small **Sync Agent** on the store server **pushes** the changes. The website never connects into the store. | The store server is behind a router/NAT, and opening the Access file to the internet is unsafe. Outgoing HTTPS from the store is simple and secure. |
| Export the whole table to CSV each time | Use CSV **only for the first import**. After that, send **only the changed rows** (delta). | This keeps traffic small and makes updates fast. |
| Access triggers the update | Access has no triggers and no change log, so the agent **polls**: it reads the tables every 30–60 s and compares them with the previous snapshot (a hash per row). | Polling is reliable and needs no changes to the store's program. |
| The website writes back into Access | **Not in phase 1.** Access stays the **single source of truth**. Online orders are stored in PostgreSQL and staff enter them in the store program (phase 2 can automate this). | Writing into a live `.mdb` file that the store program is using can cause locks and broken data. |
| The website reads the Access database directly | The website uses **its own PostgreSQL** copy. | The site keeps working when the store PC is off. PostgreSQL is fast and can store extra web data (images, SEO, descriptions). |

## 2a. Findings from the real database (2026-11-17)

Tables include: Товары, Товары1, Типы (categories), Группы, Валюты, Курсы, Склады, Склад2, Shops, Документы (122 MB), Операции (98 MB), Касса, Контрагенты, Штрихкоды, Прайсы, Скидки, Document Types, Document Numbers.

**Товары columns → website mapping**

| Access | Type | Website field | Public? |
|---|---|---|---|
| КодТовара | COUNTER | external_id | key |
| ШтрихКод | VARCHAR | barcode | yes |
| КодТипа | INTEGER | category (→ Типы) | yes |
| Марка | VARCHAR | name | yes |
| Производитель | VARCHAR | brand | yes |
| ЕдиницаИзмерения | VARCHAR | unit | yes |
| Цена | DOUBLE | price | yes |
| КодВалюты | INTEGER | currency (→ Валюты, Курсы) | yes |
| **НаСкладе** | DOUBLE | **quantity (stock)** | yes |
| Прайс-Лист | BIT | in_price_list (visibility?) | yes |
| ПоставкиПрекращены | BIT | discontinued | yes |
| Примечание | LONGCHAR | description | yes |
| Вес / Объем | DOUBLE | weight / volume | yes |
| ЦенаНаНас, Надбавка, Диллерская цена1/2, Бух* | | — | **never send** (cost and margin) |
| ОстатокНВС, МинимальныйЗапас, Log, ClearText, Марка2, ЕдиницаИзмерения2, Правый, ЦенаПрайса | | — | internal; clarify meaning |

**Sync conclusion:** stock is stored in `Товары.НаСкладе`, so the agent only needs to poll **Товары** (about 2 MB) every 3–5 s. It hashes each row and sends the changed rows. That puts a sale on the website within about 5–10 s. Документы and Операции are not needed for phase 1.

**To verify:** sell one item in the store program and check that `НаСкладе` decreases immediately. Also confirm whether there are several shops or warehouses (Склады, Shops) with separate stock, and which currency `Цена` uses.

## 3. Architecture

```
 STORE (Windows Server 2016)                     CLOUD (Linux VPS, Docker)
┌───────────────────────────┐                 ┌──────────────────────────────────┐
│ Store program (Access UI)  │                 │  nginx + HTTPS (certbot)          │
│        │ edits             │                 │     │                             │
│        ▼                   │   HTTPS POST    │     ▼                             │
│  D:\LED\Data.mdb ◄─read── Sync Agent ───────►│  NestJS API  ──►  PostgreSQL      │
│                   (pyodbc) │  /sync/*        │     ▲                             │
│                    Windows │  API key        │     │ REST /api/*                 │
│                    service │                 │  React site (shop) + Admin panel  │
└───────────────────────────┘                 └──────────────────────────────────┘
```

### Components

1. **Sync Agent** (Python 3, runs as a Windows service on the store server)
   - Connects to `Data.mdb` **read-only** with pyodbc. This connection already works.
   - Every `N` seconds it reads the tables that are synced (products, groups/categories, maybe prices and stock).
   - It computes a hash for each row (by primary key) and compares it with the local state file (SQLite).
   - It sends the changes in batches: `upserts[]` and `deletes[]`.
   - If the website is offline, the changes stay queued and are re-sent later, so nothing is lost.
   - It writes a log file. Its health is visible in the admin panel (a "last sync" time).
   - Python is used because the working Access connection (32/64-bit ODBC driver) is already proven. Node can read Access too, but the drivers are harder to set up.

2. **Backend: NestJS + PostgreSQL** (TypeORM or Prisma)
   - Module `sync`: `POST /sync/products`, `POST /sync/categories`, `GET /sync/status`, protected by an API key and an IP allowlist.
     - All calls are **idempotent upserts** keyed by `external_id` (the Access `Код`), so sending the same data twice is safe.
   - Module `catalog`: public REST for the shop (list, filter, search, product page).
   - Module `admin`: JWT auth. Admins add web-only data (images, descriptions, SEO, show/hide) that is **not overwritten** by the sync.
   - Module `orders` (phase 2): checkout and order status.

3. **Frontend: React** (Vite, or Next.js if SEO matters, which it does for a shop)
   - The shop: catalog, product page, cart, contacts.
   - The admin panel: products, sync status/logs, orders.

### Data ownership rule

| Field | Owner | Updated by |
|---|---|---|
| code/SKU, name, price, stock, Access category (`Типы`) | **Access** | Sync Agent only |
| images, long description, SEO, `is_visible`, slug | **Website** | Admin panel only |
| site catalog (`site_categories`) and where each product is shown (`product_site_categories`) | **Website** | Admin (manual, rules) + server AI |

The sync **never** touches the fields the website owns.

**Site categories (done 2026-11-23).** The storefront shows only the admin's "Категории сайта" tree. The Access category
is only a hint for placing products, and it is often wrong. Placement order: manual (admin) > name rules per site category
> AI (server-side Gemini/OpenAI, in-stock products without an exact subcategory only; ≥ 90 % applied and marked "AI",
lower waits for review). Several categories per product are allowed. The starting rules were written once from the real
names; the staff own them from then on. Details: README "Products → site categories".

## 4. PostgreSQL schema (initial)

```sql
categories (
  id serial PK, external_id text UNIQUE, name text, parent_external_id text,
  synced_at timestamptz
)
products (
  id serial PK, external_id text UNIQUE,          -- Access [Код]
  sku text, name text, price numeric(12,2), quantity int,
  category_external_id text,
  -- web-only:
  slug text UNIQUE, description text, images jsonb, is_visible bool default true,
  seo_title text, seo_description text,
  raw jsonb,                                      -- full Access row, for debugging
  deleted_at timestamptz, synced_at timestamptz, updated_at timestamptz
)
sync_log (id serial PK, received_at timestamptz, entity text,
          upserts int, deletes int, agent_version text, error text)
```

Deleting a row in Access sets `deleted_at` (a soft delete), so links and orders stay valid.

## 5. Sync API contract

```http
POST /api/sync/products
X-Api-Key: <secret>
Content-Type: application/json

{
  "batchId": "2026-11-17T10:15:00Z-0001",
  "upserts": [
    {"externalId": "1042", "sku": "LED-1042", "name": "Монитор 24\"", "price": 9900,
     "quantity": 3, "categoryExternalId": "7", "raw": { ... }}
  ],
  "deletes": ["988"]
}
→ 200 {"ok": true, "upserted": 1, "deleted": 1}
```

- The batch size is 500 rows or fewer. The agent sends the batches in order and retries with backoff when one fails.
- `GET /api/sync/status` returns the last batch and the row counts. The agent uses it as a health check.
- A **full resync** mode (`agent --full`) sends every row. Use it for the first load and after problems.

## 6. Security

- Only outgoing HTTPS goes from the store. No ports are opened on the store server.
- A long random API key is stored in the agent config and in the server `.env`. The server can also allowlist the store's public IP.
- The agent opens Access **read-only**. Back up `Data.mdb` daily (a scheduled task copy).
- The Access password and the API key stay in a config file, not in git.

## 5a. Test server

- Domain: **led.creativeweb.am**. It is on the studio's shared Docker server (Ubuntu 24.04, Docker + host nginx + certbot, Cloudflare proxied). It currently serves the static homepage concept from `/var/www/led.creativeweb.am`.
- Follow the server's own rules document (kept privately, outside this repo).
- Planned layout (not deployed yet):
  - `/opt/led-computers`, compose name `led-computers-prod`: postgres 17, api (NestJS), admin (React build served by nginx)
  - ports on 127.0.0.1 only: **5000 admin/web, 5100 api**
- URLs: `https://led.creativeweb.am/` (concept page now, the shop later), `/admin` (admin panel), `/api` (API, including `/api/sync/*` for the agent)
- Images are built on GitHub Actions (ghcr.io), not on the server
- Keep `noindex` while it is a test

## 6a. Implementation plan: sync + admin panel first (agreed 2026-11-17)

The first deliverable is the **admin panel showing live Access data**. The public shop comes after it.

| Step | What | Done when |
|---|---|---|
| 1 | Confirm the data: the `НаСкладе` test, the Типы/Валюты columns, which products are published, the currency | Field mapping is final |
| 2 | Backend: NestJS + PostgreSQL (Docker), `products`, `categories`, `sync_log`, `admin_users`; `/api/sync/*` with API key; `/api/admin/*` with JWT login | Test JSON via curl appears in the DB |
| 3 | Agent v1: full load of Типы + Товары | Product count on the site = count in Access |
| 4 | **Admin panel v1 (React)**: login; **Products** table (search, filter by category, stock, price, sorting, paging); product detail with all Access fields (read-only); **Categories**; **Sync** page (last sync, log, errors) | Manager sees all Access items in the browser |
| 5 | Agent v2: delta sync every 5 s (hash per row, SQLite state, retry when offline) | Sale in the store → admin panel updates in ≤10 s |
| 6 | Agent as a Windows service (NSSM), logs, daily `.mdb` backup | Survives a reboot |
| 7 | Monitoring: "last sync" indicator + Telegram/email alert after 10 min of silence | Alert fires when the agent stops |
| 8 | Admin panel v2 = CMS: product images, descriptions, SEO, show/hide on site, pages (About, Contacts), banners, menu, users/roles | Content editable without code |
| 9 | Public React shop: catalog, search, product page, contacts | Site live |
| 10 | Orders (phase 2): checkout, order list in admin, notification to staff | — |

**Admin panel rule:** fields from Access (name, price, stock, barcode, category) are **read-only** in the panel and marked "from Access". Only web fields (images, descriptions, SEO, visibility) can be edited. This prevents conflicts with the store.

**Customers (done 2026-11-21).** Registered users of the old led.am site (MySQL dump) are in PostgreSQL: `customers`,
`customer_orders`, `customer_order_items`, `customer_favorites`, `customer_import_log`. Decisions:
- Only registered users and their orders; guest orders are not imported. Inactive (unconfirmed) users are imported too.
- Old MD5 / MySQL `PASSWORD()` hashes are kept only wrapped in bcrypt (`password_scheme` = `legacy-md5` / `legacy-mysql41`),
  so old passwords keep working; first login via `POST /api/shop/login` turns them into plain bcrypt. `reset` = must set a new one.
- Order lines keep a snapshot (code, name, price, qty) and link to products by code (`product_external_id` = Access `КодТовара`).
  Customers/orders live only in PostgreSQL — never written to Access.
- Admins edit profiles, block/unblock, set passwords; edits set `edited_at` and go to `change_log` (entity `customer`).
- The import (`node dist/legacy-cli.js <dump.sql>`) is re-runnable and must be run **once more at go-live**. It keeps admin
  edits, the blocked flag and upgraded passwords. When the storefront gets accounts/checkout (step 10), it must use these
  tables (new orders with `source = 'site'`) and `/api/shop/login`, not a second user table.

**Admin roles:** `admin` (everything, users, settings), `manager` (content, products' web fields, orders).

## 7. Phases and milestones

| Phase | Deliverable | Estimate |
|---|---|---|
| 0. Discovery | Run `export_access_to_csv.py --list` / `--columns`. Agree on which tables and fields go to the site. Note how the store program changes stock: does a sale update `Товары.Количество` directly, or is stock computed from movement tables? | 2–3 days |
| 1. Backend core | NestJS project, PostgreSQL, Docker, `sync` + `catalog` modules, API key auth | 1–2 weeks |
| 2. Sync Agent | Python agent with polling + diff + queue + retries, Windows service (NSSM), logs. First full load, then deltas | 1 week |
| 3. Website | React shop: catalog, search, product page. Admin panel: images/descriptions, sync status | 2–4 weeks |
| 4. Launch | Deploy to the VPS (Docker, nginx, HTTPS), monitoring, backups | 3–5 days |
| 5. Phase 2 (optional) | Online orders, Telegram/email notifications to staff, optional write-back of orders into Access | later |

## 8. Repository layout (proposal)

```
led-computers/
  agent/            # Python sync agent (Windows)
    agent.py, config.example.ini, requirements.txt
  backend/          # NestJS
  frontend/         # React shop + admin
  docker-compose.yml
  docs/
```

## 9. Open questions for the company

1. Which tables hold the **products, stock, prices and categories**? Is stock a column, or is it calculated from sales and receipts?
2. Is there **one store or several warehouses**? (Stock per location?)
3. How fast must the site update: is 1 minute OK?
4. Does the website take **online orders/payments** at launch, or is it a catalog plus "call to order"?
5. Where do **product images** come from? Does Access have them, or do admins upload them?
6. Is the store server **on 24/7** with internet access? Can we install Python and a Windows service on it?
7. Domain and hosting: is there an existing VPS?

## 10. Risks

| Risk | Mitigation |
|---|---|
| Stock is computed (not stored) in Access | The agent runs the same calculation query. This is found in phase 0. |
| The `.mdb` is locked or busy | Read-only short queries, retry on lock, avoid long transactions |
| The store PC or internet is down | The site shows the last known data. The agent catches up automatically (it re-diffs on start). |
| A large table makes polling slow | Hash only the needed columns. Use an Access "modified date" column if one exists. |
| The ODBC driver bitness doesn't match | Use the Python bitness that matches the installed Access driver (already working) |

## 11. Storefront plan (agreed 2026-11-25)

**Stack.** Storefront = **Next.js 16 + React 19** (server-side rendering, for SEO), new folder `web/`, container `led-web`
on 127.0.0.1:5200. Backend stays **NestJS + TypeORM** (`led-api`), admin stays **React + Vite** (`led-admin`). Same pattern
as cvweb.ru and onlineajurd.am. Next.js never touches the database: it only calls `/api/shop/*` (inside the Docker network).
The static templates in `Design/site/` are the design reference; pages move to Next.js one by one (nginx routes the ported
ones), cart/favourites/compare keep the same localStorage keys (`led-cart`, `led-fav`, `led-cmp`) during the move.

**Decisions (owner: "use your defaults", 2026-11-25).**

| Question | Decision |
|---|---|
| Currency | Show ֏. Products priced in $ (16 011 of 16 774) = price × latest USD rate from Access `Курсы` (365 on 2026-11-22), rounded to 100 ֏. ֏ products keep their price. **Check a few prices against led.am before go-live.** |
| Out of stock | **For now the site uses in-stock products only** (owner, 2026-11-25): catalog, search, product pages, cart re-check. An out-of-stock product has no page (404) and the cart marks it gone. Discontinued, deleted, hidden or zero-price products are never shown. Which out-of-stock items become orderable later = open question 1 below. |
| Stock per shop | Access has only one total (`ОстатокНВС`), no per-showroom stock → the site shows the total ("in stock" / "last N" for ≤ 3). |
| Reviews | Block hidden until real reviews exist. |
| URLs | `/` HY, `/ru/…`, `/en/…`; `/<section>/<group>/<sub>` (no prefix, reserved words blocked); `/product/<slug>-<code>` (code = Access КодТовара, so a renamed product keeps working: wrong slug → 301 to the right one). 301 from old led.am URLs and the current `.html` test pages. |

**Steps.**

| # | Step | Done when |
|---|---|---|
| 1 ✅ | Product API (NestJS): `GET /api/shop/products` (site category, search, brand, price, stock, sort, pages, facet counts), `/api/shop/products/:slug`, `/api/shop/products/by-ids` (cart re-check). Fixed field allow-list — never cost/margin/`raw`. Prices in ֏, slugs, visibility rules | curl returns real products for a site category |
| 2 ✅ | Specs and filters (done 2026-11-25): name parser `backend/src/specs.ts` (no AI, no table yet: cached in memory), filters chosen automatically per category (key on ≥ 30 % of its products, ≥ 2 values), facet counts, grouped spec table on the product page. Later: admin spec overrides + per-category filter choice (step 8), Icecat specs when photos/AI come back | Laptops filter by CPU/RAM/SSD/screen on real data |
| 3 ✅ | Next.js base (done 2026-11-25, live at /catalog): `web/`, CSS/tokens from the templates, layout (top bar, header, catalog popup, top menu, footer), HY/RU/EN routing, API client, page cache + refresh trigger from NestJS after a sync, Docker image + GitHub Actions, nginx route | Empty layout live on the test domain |
| 4 ✅ | Category page `/<section>/<group>/<item>` (done 2026-11-25): tree, filters in the URL, sort, pages, server-rendered cards, breadcrumb, meta | Category pages show live products |
| 5 ✅ | Product page `/product/...` (done 2026-11-25; bought together/1-click wait for real data/orders): gallery, specs, description, stock, JSON-LD, similar, bought together, cart/♡/compare/1-click | Product pages live |
| 6 ✅ | (done 2026-11-25: in-memory search `backend/src/search.ts`, no trigram/DB extension needed at this size) Shared shop state: cart/favourites/compare with real ids, price/stock re-check, favourites saved to the account, real search (full-text + trigram, RU/HY/EN synonyms) | Cart and search on real data |
| 7 | Port the remaining pages: home (real New/Sale/Best sellers), search, brand, cart, checkout, account, login/registration/forgot, info pages, assembly. Then retire the static site | Whole site in Next.js |
| 8 | Admin web fields: descriptions HY/RU/EN, SEO, specs, hide on site, sale/old price (part 1 done 2026-11-25: product card "Данные сайта"), home banners and blocks (part 2 done 2026-11-25: admin "Главная страница"), per-category filters (part 3 done 2026-11-25) | Content editable without code |
| 9 | SEO and the move from led.am: sitemap, canonical, hreflang, 404, **301 from every old led.am URL**, caching | seo-check passes |
| 10 | Orders: checkout and 1-click write `customer_orders` (`source='site'`), admin Orders page, staff alerts, real order tracking | Order reaches the staff |
| 11 | Go-live: re-import old customers, SMTP/SMS, remove `MAIL_DEV_LOG`, analytics, remove `noindex`, Search Console, domain switch | led.am on the new site |

Later: back-in-stock / price-drop alerts, real reviews with moderation, configurator compatibility from the specs.

**Open questions (to agree with the client).**

1. **Which out-of-stock products the site shows (raised 2026-11-25, not decided).** Access keeps every product forever:
   16 774 products, 1 167 in stock, 15 607 out of stock. Most are very old (codes 0–10 000: ~9 200 products, 20 in stock —
   Pentium 4 / Athlon PCs, Core 2 Duo, 2010 laptops), but some are current popular items that are only sold out now (MSI Thin 15,
   WD SN850X 2TB, Ryzen 7 7800X3D), and customers should be able to order them. The "Прайс-Лист" flag does not separate the two.
   To decide: which old items are dropped, which stay orderable ("on order") when out of stock, and who decides later
   (automatic rule from the last sale/receipt in `Операции`/`Документы` — join still to be checked —, an admin flag, or both).
   **Until then:** the site uses in-stock products only (no page for out-of-stock ones).
2. **Delivery prices (raised 2026-11-25, not decided).** The cart template had demo numbers (courier in Yerevan 1 000 ֏, free
   from 100 000 ֏; across Armenia 2 500 ֏). To decide: real courier / region prices, free-delivery threshold, pick-up points.
   **Until then:** the cart shows the three ways without a price ("the manager confirms the delivery cost"); pick-up is free.

**Keeping the old led.am Google index (2026-11-25, owner's priority).** Old URLs: `/{am,ru,en}/products/category/<alias>.html` for
categories and `/{lang}/products/category/<name>_<Access code>.html` for products (the suffix = Access КодТовара), plus `/{lang}/about.html`,
`help_up_menu/*.html`, `users/*.html`. All 301 to the new pages (see CLAUDE.md log). Re-run `tools/old-led-urls/` (dump → mapping SQL)
before go-live so new categories are included; check Search Console "Pages" after the switch.
