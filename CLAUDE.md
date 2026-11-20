# LED Computers — project notes for Claude

Read this first. The project is worked on from **two places**: Claude Code (VS Code, this repo) and
**Claude desktop** (design work). Both must leave notes here so the other side knows what changed.

## What the project is

Website for the LED Computers store (led.am). The store's Access database (`Data.mdb`, Windows Server 2016)
is synced to the site in near real time by a Python agent. Stack: NestJS + PostgreSQL + React admin.
Details: [README.md](README.md), plan and decisions: [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

| Folder | What | Tracked in git |
|---|---|---|
| `agent/` | Python sync agent (NSSM service `LedSyncAgent` on the store server) | yes |
| `backend/` | NestJS API + PostgreSQL | yes |
| `admin/` | React admin panel (`/admin`) | yes |
| `deploy/` | docker-compose, nginx config, .env example | yes |
| `docs/` | plan, workflow, changelog of decisions | yes |
| `Design/site/` | **static HTML templates made in Claude desktop** (home, category) | **no** (`Design/` is gitignored) |
| `Contracts/` | contracts | no |

## Testing domain: led.creativeweb.am (Mynewserver 176.118.198.60)

Read `D:\Projects\SERVER-mynewserver.md` before server work. `ssh mynewserver`.
The server rate-limits SSH: batch commands into one connection, wait ~30 s if it times out.

| URL | Served from |
|---|---|
| `/` , `/category.html`, `/img/*` | static files in `/var/www/led.creativeweb.am/` (copied from `Design/site/`) |
| `/top-picks/` | static, older concept page |
| `/admin/` | container `led-admin` → 127.0.0.1:5000 |
| `/api/` | container `led-api` → 127.0.0.1:5100 |

Host nginx: `/etc/nginx/conf.d/led.creativeweb.am.conf` (copy in `deploy/`). The site sends `noindex`.

## Working process

### Design (Claude desktop)
1. Edit templates in `D:\Projects\744.Led-Computers\Design\site\` (`index.html`, `category.html`, `img/`).
   Keep relative paths (`img/...`) so files work both locally and on the server.
2. Add a line to "Log" below: date, what changed.
3. Ask Claude Code (or do it yourself) to publish to the testing domain.

### Publish templates to the testing domain
```powershell
# back up first
ssh mynewserver "cd /var/www && tar czf /root/led-static-backup-$(date +%Y%m%d-%H%M).tgz led.creativeweb.am"
scp -r Design\site\* mynewserver:/var/www/led.creativeweb.am/
```
Check: `https://led.creativeweb.am/` and `/category.html` return 200, images load.

### Code (Claude Code)
- Backend/admin: commit to `main` → GitHub Actions builds images → on server
  `cd /opt/led-computers && docker compose pull && docker compose up -d`.
- Agent: replace `agent.py` in `D:\python-script\agent\` on the store server, then
  `net stop LedSyncAgent && net start LedSyncAgent`. Never run a second copy by hand.

### Next step (planned)
Turn the static templates into the real storefront (React/SSR) fed by `/api` — products, categories,
stock and prices from the Access sync. Until then the templates are design references.

## Rules
- Access is read-only, always. Never send cost/margin columns (see README).
- Back up before changing anything on the server; don't touch other projects there.
- Update this file (Log + any changed URL/process) at the end of every work session, on either side.

## Log
- 2026-11-20 — Claude desktop made home (`index.html`) and category (`category.html`) templates in
  `Design/site/`. Claude Code published them to led.creativeweb.am (`/`, `/category.html`, `img/logo.png`);
  backup `/root/led-static-backup-20261120.tgz` on the server. Added this file.
- 2026-11-20 — Client chose v2 (`Design/concept/homepage-v2.html`, the "top-picks" slider) as the home page.
  `Design/site/index.html` = v2 + v1 top menu (icon row) + v1 container width (1280px) + PNG logo; every
  category link (top menu, mega menu, tiles) opens `/category.html`. Old v1 kept as `Design/site/index-v1.html`
  (live at `/v1/`). Admin panel now shows the logo (`admin/public/logo.png`). Backup `led-static-backup-20261120b.tgz`.
  **Edit `Design/site/index.html` from now on, not the concept files.**
