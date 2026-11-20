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
- 2026-11-20 — `category.html` uses the same top menu as home: logo → `/`, menu and catalog-menu links open
  `/category.html` (overrides the led.am link map for menu links). Keep the header block identical on both pages.
- 2026-11-20 — Container: 1280px, and 1530px on screens ≥1600px (`@media (min-width:1600px)` rule), on both pages.
  Client confirmed it. Keep this rule.
- 2026-11-20 — Less dark navy: "Կատալոգ" button is brand blue (`--blue-600`) on both pages; home hero slider background is a
  blue gradient (`#1257C4 → #2F7FEA → #6AA8F7`) instead of navy. Active tab buttons (home tabs, catalog subcategories and view toggle) are brand blue too. Published.
- 2026-11-20 — "Կատալոգ" button opens the mega menu on hover (120 ms delay; closes when the mouse leaves the menu/button area,
  same as the top-category hover). A click after a hover keeps it open. Both pages. Backup `led-static-backup-20261120c.tgz`. Published.
- 2026-11-20 — Admin sidebar uses the site palette: navy `#0E1A2E` with a soft blue glow, brand blue `#1468DC` accent and
  active menu item. Logo sits on a white card and links to the dashboard; the "Computers" text next to it is gone.
- 2026-11-20 — Admin login page: same navy + blue glows background, white form card, blue focus ring and button. Deployed.
- 2026-11-20 — Admin dashboard tiles use the site card style (14px radius, soft shadow, tinted icon box, hover lift; green/amber/red
  tones for in stock / out of stock / deleted). Admin light palette = site tokens (`--bg #F3F7FA`, `--line #E3E9F1`). Deployed.
- 2026-11-20 — Added product page `Design/site/product.html` (live at `/product.html`): gallery with zoom/lightbox/swipe,
  options that change the price, sticky buy box (price, instalment calculator, qty, cart, 1-click modal, favourite/compare),
  delivery/warranty perks, sticky section tabs under the header, spec table with search, description, store stock,
  bundle, reviews, similar products, bottom sticky buy bar, Product JSON-LD, RU/HY/EN strings. Category cards' "Подробнее"
  now open `/product.html`. Backup `led-static-backup-20261120d.tgz`. Reviews/ratings are placeholders — the store has no review data yet.
- 2026-11-20 — Catalog menu hover: stays open while the mouse is anywhere over the header or the menu, closes 250 ms after
  it leaves both (was closing on the way from the button to the menu). All three pages. product.html now has the hidden
  `#stubs` block like category.html: the shared script needs those elements, without them the catalog menu never started.
  **Any new page built from category.html must keep `#stubs`.** Backup `led-static-backup-20261120e.tgz`.
- 2026-11-20 — Home: clicking any product card (`.prod`) opens `/product.html` (Ctrl/middle-click → new tab); cart and
  heart buttons keep their own action. Card title turns blue on hover. Backup `led-static-backup-20261120f.tgz`.
- 2026-11-20 — Category: whole product card opens `/product.html`, same as home (cart, heart, compare and checkbox keep
  their own action). Backup `led-static-backup-20261120g.tgz`.
- 2026-11-20 — Product page: removed the "Нужна консультация?" phone block (`.mgr`) under the buy-box perks. Backup `led-static-backup-20261120h.tgz`. Published.
- 2026-11-20 — Product page: description block (text, highlights, "Կոմպլեկտ" list) translated to Armenian. Backup `led-static-backup-20261120i.tgz`. Published.
- 2026-11-20 — Product page sidebar: delivery card values in Armenian; "Для бизнеса" (invoice) card removed. Backup `led-static-backup-20261120j.tgz`. Published.
- 2026-11-20 — Product page: store stock list (addresses, "հատ") in Armenian. Backup `led-static-backup-20261120k.tgz`. Published.
- 2026-11-20 — Product page: spec search + "copy list" hidden (`.spec-tools` display:none — kept in DOM, the script uses `#sq`/`#sCopy`). Backup `led-static-backup-20261120l.tgz`. Published.
- 2026-11-20 — New pages `cart.html` (Զամբյուղ), `favorites.html` (Ընտրյալներ), `compare.html` (Համեմատել), built from category.html's
  header/footer/`#stubs`. A shared store (localStorage `led-cart`/`led-fav`/`led-cmp`, demo seed data) is in all 6 pages: header icons link to
  the pages and show live counts, and card cart/♡/compare buttons on home/category save items. Cart: qty, remove+undo, free-delivery bar,
  delivery options, promo `LED5` (−5%), instalment line, upsell. Favourites: sort, add all to cart, share link (`?ids=`), price-drop badge.
  Compare: up to 4, sticky header, best value ★, "differences only" switch. Generator: `Design/site-src/build_shop.py` (rerun after editing
  category.html's header, then republish). Backup `led-static-backup-20261120m.tgz`. Published.
- 2026-11-20 — Product page "В корзину" buttons (buy box `#addc` and bottom bar `#sAdd`) now add the product to the shared cart with the chosen
  quantity and the current `#price` (follows options); header count updates, message links to `/cart.html`. Backup `led-static-backup-20261120n.tgz`. Published.
- 2026-11-20 — Product page "В избранное" / "Сравнить" (`.sec-act .fv/.cp`) toggle the shared favourites/compare store (state shown on load,
  header counts, compare bar links to `/compare.html`). Script `<!--pdp-store-->` runs on DOMContentLoaded because build_shop.py puts the
  shared store after it. Cart upsell heading → "Միասին հաճախ գնում են". Backup `led-static-backup-20261120o.tgz`. Published.
- 2026-11-20 — New page `assembly.html` (PC configurator, like led.am/ru/assembly.html): 16 component rows in 4 groups (required ones marked *),
  demo parts with prices, qty, compatibility checks (CPU socket ↔ motherboard, DDR4/DDR5, PSU wattage), recommended PSU, progress bar, sticky
  summary with total and cash price (−3%, demo), "Add to cart" puts every part in the shared cart, print, reset. Choices saved in localStorage
  `led-asm`. Built by `build_shop.py` (sources `site-src/assembly_page.html`, `site-src/asm_link.html`). Every "Собрать ПК"/configurator link
  on all pages (top-menu icon, mega menu) opens `/assembly.html`. Backup `led-static-backup-20261120p.tgz`. Published.
- 2026-11-20 — Category price filter: two-handle range slider (`#dRange`, 0–1 500 000 ֏, synced with the min/max inputs; script `<!--dual-range-->`).
  Product 1-click modal text translated (I18N entry). Assembly page follows the site language (HY/RU/EN, re-renders on switch; part units ԳԲ/Վտ…).
  Backup `led-static-backup-20261120q.tgz`. Published.
- 2026-11-20 — Category: price slider/inputs now filter the cards (by `.pr b` price, live; empty-state text; count updates; "Reset" clears it).
  Product page: reviews rating bars renamed `.bars` → `.rbars` — the old name broke the "Կատալոգ" button's hamburger icon.
  **Don't reuse the class `.bars` — it belongs to the catalog button.** Backup `led-static-backup-20261120r.tgz`. Published.
- 2026-11-20 — Category: all filters work on the cards: spec checkboxes in `#dynF` (now carry `data-g`/`data-v` = RU value; OR inside a group,
  AND between groups; matched against card text, ГБ/ТБ/Вт normalised, "Встроенная"/"Без ОС" special-cased), "in stock" and "instalment"
  toggles, price. Counts next to each value are real, toolbar chips show active filters (✕ removes), "Reset" clears all. Demo cards only.
  Backup `led-static-backup-20261120s.tgz`. Published.
- 2026-11-20 — Phone mask on every phone field (`input[inputmode=tel]`/`[type=tel]`, also ones added later): `+374 XX XXX XXX`, accepts
  pasted 0XX…/374…/+374…, a form won't submit until 8 digits are entered (red ring). Source `site-src/phone_mask.html`, added to all 7 pages
  by `build_shop.py` (which now also strips category's `<!--dual-range-->` block from generated pages). Backup `led-static-backup-20261120t.tgz`. Published.
- 2026-11-20 — Button hover system on all 7 pages (`site-src/btn_fx.html`, added by `build_shop.py`): primary blue buttons (`.btn.p`, `.addc`,
  `.sp-b.p`, `.asm-b.p`, card cart, "Подробнее"…) get the catalog-button look — gradient wake + light sweep + glow + lift, plus a cursor
  spotlight, slight magnetic pull and click ripple; secondary buttons a light blue version; header icons bounce. JS adds `.fx` and
  `span.fx-g/.fx-sh` on first hover. Honors reduced-motion. Backup `led-static-backup-20261120u.tgz`. Published.
- 2026-11-20 — Product cards (`.prod`, all pages): cursor spotlight + blue border glow that follows the cursor, light sweep over the photo,
  photo parallax, badge wiggle, price turns darker blue (`site-src/card_fx.html`, added by `build_shop.py`; spans `.pc-g/.pc-b/.pc-sh` added on
  first hover). Backup `led-static-backup-20261120v.tgz`. Published.
- 2026-11-20 — Same hover language extended to tiles (`.t` trust, `.feats>div`, `.brands a`, mega-menu `.mh`, `.c`) and banners (`.promo`,
  `.build`, `.credit`, `.b2b`): spotlight + border glow following the cursor, light sweep (slower on banners), icon/visual parallax; dark
  banners get a white glow. All in `site-src/card_fx.html`. Backup `led-static-backup-20261120w.tgz`. Published.
- 2026-11-20 — Fix: hover-effect spans are now appended at the END of buttons/cards (page scripts use `querySelector('span')`, e.g. product
  "add to cart" wrote ✓ into the effect span). Magnetic pull halved. **Effect markup must never be the first child.** Backup `led-static-backup-20261120x.tgz`. Published.
- 2026-11-20 — Product gallery: main photo (`.stage`) gets spotlight + border glow + slow sweep + slight zoom/parallax (all off while click-zoom
  is on); thumbnails lift, glow and zoom their image; prev/next arrows get the secondary button effect. Fix: `.fx` no longer forces
  `position:relative` (broke absolutely placed buttons). Backup `led-static-backup-20261120y.tgz`. Published.
- 2026-11-20 — Cart page hover effects: item rows (`.sp-row`) spotlight + slide + photo zoom; delivery options (`.sp-opt`) and upsell cards
  (`.sp-mi`) lift + glow; summary, free-delivery bar, delivery block and empty state get the banner spotlight/border glow; qty ± and promo
  "Apply" get the button effect. Also applies on favourites/compare where the same classes appear. Backup `led-static-backup-20261120z.tgz`. Published.
- 2026-11-20 — Assembly page hover effects: component rows spotlight + slide + icon spring + select highlight; summary and progress cards
  get banner glow; qty ± and remove × get the button effect (main buttons already had it). Backup `led-static-backup-20261120za.tgz`. Published.
- 2026-11-20 — Favourites/compare hover effects: favourite cards (`.sp-f`) and compare column heads (`.sp-pc`) use the product-card effect
  (spotlight, border glow, photo sweep/zoom/parallax, title blue, price-drop badge wiggle); "add product" slot lifts and glows; ♡/compare/×
  buttons get the button effect. Backup `led-static-backup-20261120zb.tgz`. Published.
- 2026-11-20 — Header/footer hover effects (CSS in `site-src/card_fx.html`): search box glow on focus, "Найти" gets the primary button effect,
  top-menu icons spring + blue underline grows + soft spotlight ("Акции" flame flickers), header icons tint blue, logo tilt + glow, top-bar
  links underline. Footer: links slide right with blue underline, contact icons spring, social buttons lift in brand colours
  (fb/ig/tg/wa/vb), payment chips lift, newsletter input glow. Backup `led-static-backup-20261120zc.tgz`. Published.
- 2026-11-20 — Top menu = catalog popup: the icon row (12 icons) is replaced by the popup's 6 sections, icon + name (`nav.cats` without
  `.icons`, `data-m=0..5`), plus the wrench (configurator) and "Акции". Names are copied from the popup buttons at runtime (`syncNav` in
  card_fx.html), so they always match in every language. Hovered item no longer turns vertical (`.act` class clash with header icons).
  Mega menu hover effects: section buttons spotlight/slide/icon spring, links slide with underline, popular tiles lift, brand tiles
  lift/glow, promo banner glow+sweep, ✕ rotates. Fix: mega brand logos were empty on category/product pages (hidden `#stubs` → getBBox 0 →
  viewBox "0 0 0 0"); now skipped when 0. Backup `led-static-backup-20261120zd.tgz`. Published.
- 2026-11-20 — Product section tabs (`.ptabs`): underline grows + soft spotlight + lift, count badge turns blue; home tab pills lift/glow.
  Top menu items all the same height on hover (stretch). Fix: banner border glow was offset on `.credit` (its `>*{grid-column:1}` shrank the
  effect layers) — effect layers now `grid-area:auto`. Backup `led-static-backup-20261120ze.tgz`. Published.
- 2026-11-20 — Product spec table: each group (`.sg`) gets the cursor spotlight + heading icon spring; rows fill with a blue wash from the
  left, slide 6px, a blue dot appears before the name. Backup `led-static-backup-20261120zf.tgz`. Published.
- 2026-11-20 — Product reviews hover: each review spotlight + slide, name blue, stars glow; rating summary number/stars pop; rating bars
  thicken and glow. Home side promo "Подобрать комплектующие" (Ընտրել մասերը) now links to `/assembly.html`. Backup `led-static-backup-20261120zg.tgz`. Published.
- 2026-11-20 — Product bundle hover: items (`.bi`) lift + spotlight/border glow, photo springs/parallax, name/price blue, checkbox pops;
  total card (`.bsum`, navy) gets the white banner glow + sweep, total pops; its button gets the primary button effect. Backup `led-static-backup-20261120zh.tgz`. Published.
- 2026-11-20 — Similar products already use the `.prod` card effect (checked live). Section heading links (`.sh>a`, "Все … →") slide with an
  underline on all pages. Published.
- 2026-11-20 — Mega menu group headings: hover no longer widens letter-spacing (made the last word wrap); now slide 4px + underline. **Hover
  effects must not change text size/spacing — use translate/colour/underline only.** Published.
- 2026-11-20 — Category tree hover: group headers spotlight + slide + arrow nudge, branch line turns blue, items slide with a blue wash and
  their count becomes a blue pill; active item gradient + glow. CSS only (tree re-renders). Backup `led-static-backup-20261120zi.tgz`. Published.
- 2026-11-20 — Category filters hover: group titles slide + "+/−" spins blue; options slide with a blue wash, count pill turns blue (also when
  checked), checkbox pops; toggles slide; price inputs glow on focus; slider handles grow with a halo, range bar glows; "Reset" underline;
  active-filter chips lift and ✕ spins. Backup `led-static-backup-20261120zj.tgz`. Published.
