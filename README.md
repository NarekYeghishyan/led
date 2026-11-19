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

Fields from Access are read-only on the website. Web fields (images, SEO, visibility) are never overwritten by the sync. Internal columns (`ЦенаНаНас`, `Надбавка`, dealer prices, `Бух*`, `Log`) are never sent.

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
