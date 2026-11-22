# LED Computers — store ↔ website

The store's Microsoft Access database (`Data.mdb`, Windows Server 2016) is synced to the website in near real time. The website is built with NestJS, PostgreSQL and React. Plan and decisions: [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

```
agent/     Python sync agent (runs on the store server, reads Access, pushes changes)
backend/   NestJS API + PostgreSQL (TypeORM)
admin/     React admin panel (served at /admin)
deploy/    docker-compose, .env example, host nginx config for led.creativeweb.am
```

## How the sync works

1. Every 5 s the agent reads `Товары` (and `Типы` / `Валюты` every 2 min) from Access.
2. It hashes every row and compares the hashes with `state.sqlite`. Only new, changed or removed rows are sent.
3. The agent sends them with `POST /api/sync/{products|categories|currencies}`, protected by the `X-Api-Key` header. The API upserts them by `external_id`.
4. A row is marked as sent only after the API accepts it. If the internet goes down, the changes are sent later.
5. At start and every hour, the agent compares its ids with `GET /api/sync/ids/{entity}` and deletes site rows that are gone from Access. If Access returns 0 rows or fewer than half, it refuses to delete them.

Fields from Access are read-only on the website. Web fields (images, SEO, visibility) are never overwritten by the sync. Internal columns (`ЦенаНаНас`, `Надбавка`, dealer prices, `Бух*`, `Log`) are never sent to the storefront. Exception (owner's decision 2026-11-22): the admin product card shows `ЦенаПрайса` and `Диллерская цена1/2`, read from the admin-only Access mirror — never expose them in `/api/shop`.

## Local development

```bash
# API (needs PostgreSQL)
cd backend && npm install && npm run build
DATABASE_URL=postgres://... JWT_SECRET=dev SYNC_API_KEY=dev-key-at-least-16-chars \
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... PORT=3999 npm start

# Admin panel (proxies /api to :3999)
cd admin && npm install && npm run dev     # http://localhost:5173/admin/
```

## Install the agent on the store server (Windows Server 2016)

1. Install **Python 3.12** with the **same bitness as the Access ODBC driver**. The bitness the existing export script already works with is the right one.
2. Copy the `agent/` folder to e.g. `D:\led-agent\`.
3. Run `pip install -r requirements.txt`.
4. Copy `config.example.ini` to `config.ini`, then fill in the Access password and the API key (`SYNC_API_KEY` from the server).
5. **First load from CSV:**
   ```
   python export_access_to_csv.py --site    # D:\python-script\products.csv, Типы.csv, Валюты.csv
   python import_csv.py D:\python-script     # uploads them to the website (safe to repeat)
   ```
   Check the result in the admin panel.
6. Test the live sync with `python agent.py --check`. It prints what it would send and how many site rows are no longer in Access.
   Then run `python agent.py --once`. The first pass sends every row once (state.sqlite is still empty, so this is a harmless upsert) and removes rows deleted from Access since the CSV export.
7. Install it as a Windows service with [NSSM](https://nssm.cc):
   ```
   nssm install LedSyncAgent "C:\Python312\python.exe" "D:\led-agent\agent.py"
   nssm set LedSyncAgent AppDirectory D:\led-agent
   nssm set LedSyncAgent Start SERVICE_AUTO_START
   nssm start LedSyncAgent
   ```
   Logs are written to `D:\led-agent\logs\agent.log`.

### On the store server today

- Service `LedSyncAgent` (NSSM) runs `D:\python-script\agent\agent.py`, log `D:\python-script\agent\logs\agent.log`.
  `nssm.exe` is not on PATH, so use `net stop LedSyncAgent` / `net start LedSyncAgent`.
- **To update the agent:** replace `agent.py` in that folder and restart the service. Don't also run `python agent.py` by hand, or two agents will run at the same time.

### Copy of all Access tables (agent 0.4+)

The agent also copies **every** Access table to the site (admin → "Таблицы Access") and logs every changed field. The change log is kept forever.
Settings are in the `[mirror]` section of `config.ini`, and the defaults work without it:

- Tables with 50 000+ rows (Операции, Документы, Касса) are read every `big_interval_seconds` (default 300), other tables every 30 s.
- Each table needs a key: its primary key, else `DEFAULT_KEYS` in `agent.py` (Документы → КодДокумента) or `keys =`, else the first column with unique values. Without a key, a changed row shows as deleted + added.
- `NEVER_MIRROR` in `agent.py` (Computers, Vazgen, РасчетныеСчета, Скидки) is never copied, on the store owner's request. Use `exclude =` to skip more tables.
- If a damaged row makes a table unreadable (error HY109), the table is copied without its memo columns (Товары: Примечание, Log).
- `python agent.py --tables` lists each table with its row count and the key it will use.

The agent opens Access **read-only** and never writes to it: if a read-only connection fails, it stops. `export_access_to_csv.py` (same folder, same `config.ini`) exports one table to CSV and lists tables and columns.

## Deploy (Mynewserver, led.creativeweb.am)

Pushing to `main` builds `ghcr.io/narekyeghishyan/led-api` and `led-admin` with GitHub Actions. On the server:

```bash
cd /opt/led-computers   # docker-compose.yml + .env from deploy/
docker compose pull && docker compose up -d
```

## AI product photos (admin → product → "Подобрать фото (AI)")

`backend/src/photos.ts`. One click: candidate images are collected, downloaded and checked (public http(s) only —
private/metadata IPs blocked on every redirect hop; JPEG/PNG/WebP/GIF by magic bytes; ≤ 8 MB; ≥ 250 px), then
**Gemini vision** sees all of them with the product name/code and scores each for *exact model match* and *shop-photo
quality* (clean background, no watermark/banner); its pick is preselected. "Save" downloads it to the `media` volume
(`/data/media/products/<id>/<sha1>.ext`, served at `/api/media/...`) and puts it first in `products.images`.
Nothing is written until the admin presses Save. Photos can be reordered ("make main") and removed.

Candidate sources (env in `/opt/led-computers/.env`, see `deploy/.env.example`):
- `AI_PROVIDER=gemini|openai` = who judges the photos (now **gemini**); `AI_SEARCH=openai|gemini` = who searches the web
  (now **openai**; unset = OpenAI whenever its key is set). Both keys stay in `.env`.
- **`OPENAI_API_KEY`** — OpenAI web search finds product pages, OpenAI vision ranks the photos (`OPENAI_MODEL`, default gpt-5.4-mini). Without it Gemini is used;
- **only `GEMINI_API_KEY`** — Gemini suggests official product-page URLs from its own knowledge (manufacturer,
  then big retailers); each is really fetched, wrong ones are dropped. Used when none of the search keys below is set;
- a pasted product-page or image link — always works (page: og:image, JSON-LD Product.image, gallery images with the model code);
- `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` — Google Custom Search, image mode (100 free queries/day);
- `BRAVE_SEARCH_KEY` — Brave Search images;
- `GEMINI_SEARCH=1` — Gemini's Google Search grounding finds product pages. **Needs billing on the Gemini key**; the
  current key is free tier (grounding → 429), so it is off.

Free-tier Gemini has per-minute limits; busy/limited models fall back to `gemini-3.5-flash` → `gemini-flash-lite-latest`.
Free-tier requests may be used by Google to improve its models — only public product photos and names are sent.

## Products → site categories (admin → "Привязка товаров")

The site shows **only** the admin's "Категории сайта" tree (`site_categories`). The Access categories (`categories`, admin
"Категории") are old and mixed up (e.g. "Мат.платы/Socket 1200" holds AM5 boards) — they are only one hint.
Code: `backend/src/product-categories.ts` (engine + API), `backend/src/category-rules.ts` (rule matching),
`backend/src/category-rules-seed.ts` (starting rules), admin `product-categories.tsx`, `rules.tsx`.

Where a product goes, first wins:
1. **manual** — set on the product card or in bulk on "Привязка товаров" (`products.site_cats_manual = true`); rules and AI
   leave the product alone until "Вернуть на автомат".
2. **rule** — every site category has name rules (`site_categories.match_rules`, edited in "Категории сайта" → category →
   "Правила по названию товара", with a "Проверить" preview) plus optional linked Access categories. A rule = *name starts
   with* any of … AND *contains* any of … AND *does not contain* … (plain text, any case; `/…/` = regex). Recomputed 30 s
   after an Access sync batch, after a category edit, every 15 min, and by "Пересчитать". A rule on a group/section means
   "somewhere in here".
3. **ai** — only **in-stock** products the rules left without an exact (leaf) subcategory. The AI picks one leaf inside the
   group the rules found (else from the whole tree). Confidence **≥ 90 %** → applied, marked "AI"; lower → waits on
   "AI на проверку" (✓ accept / ✕ reject). Runs by itself every 30 min for new or renamed products; a product is not asked
   again with the same name. Env: `AI_CATEGORIES=gemini|openai|off` (default: same AI as the photos, `AI_PROVIDER`),
   `AI_CATEGORIES_AUTO=0` turns the automatic run off. Gemini free plan: a run waits between requests and on 429.

Tables: `product_site_categories` (product, category, source manual|rule|ai, confidence), `product_ai_categories` (last AI
answer per product: category, confidence, reason, status applied|pending|accepted|rejected|none|replaced). Manual changes,
accepts and rejects are in the change log (entity `product_site_category`). `/api/shop/categories` counts (`k`) = in-stock
products in the category or below. Products may sit in several categories (e.g. a case in "ATX" and "Игровые").

## Customers from the old led.am site

The admin panel's **Customers** page holds the registered users of the old site with their orders, order lines and
favourites (tables `customers`, `customer_orders`, `customer_order_items`, `customer_favorites`). Admins can edit a
profile, block or unblock a customer, and set a new password; every edit goes to `change_log` (entity `customer`).

- **Passwords.** The old site stored MD5 hashes (a few use MySQL `PASSWORD()`). The import keeps them only wrapped in bcrypt,
  so customers log in with their old password (`POST /api/shop/login`), and on that first login it is replaced with a plain
  bcrypt hash. The one customer whose old hash can't be checked has `password_scheme = 'reset'`. Customer tokens are
  rejected by the admin API.
- **Order lines** keep a snapshot (article code, name, price, qty) and link to the current product by code
  (`product_external_id` = Access `КодТовара`). Nothing is written to Access.
- Only registered users' orders are imported. Guest orders are skipped.

**Run / re-run the import** (do it once more when the new site goes live — it is safe to repeat; it adds new users and
orders, refreshes old ones, and keeps admin edits, the blocked flag and upgraded passwords):

```bash
# from the PC: the dump is private (ignored by git) — copy it to /root, never to a web folder
gzip -c Design/led_new.sql > led_new.sql.gz && scp led_new.sql.gz mynewserver:/root/
# on the server: back up first
cd /opt/led-computers
docker compose exec -T db pg_dump -U led -Fc led > /root/led-db-backup-$(date +%Y%m%d-%H%M).dump
gunzip -c /root/led_new.sql.gz > /root/led_new.sql && docker compose cp /root/led_new.sql api:/tmp/led_new.sql
docker compose exec -T api node dist/legacy-cli.js /tmp/led_new.sql      # ~1.5 min, prints counts
docker compose exec -T -u root api rm -f /tmp/led_new.sql
```
Each run is recorded in `customer_import_log`; the Customers page shows the last one.
