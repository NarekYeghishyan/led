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
| `Design/site/` | **static HTML pages** (generated output, published to the testing domain) | yes |
| `Design/site-src/` | page generator `build_shop.py` + shared snippets (`responsive.html`, `card_fx.html`…) | yes |
| `web/` | **Next.js 16 storefront** (SSR, React 19): pages move here one by one; design imported by `web/scripts/import_design.py` | yes |
| `Design/` (rest) | concepts, drafts | no |
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
| any path that is **not** a static file (`/laptops/...`, `/product/...`, `/catalog`, `/ru/...`, `/en/...`, old led.am URLs), `/_next/` | **Next.js storefront**, container `led-web` → 127.0.0.1:5200 (`web/`); nginx `try_files $uri $uri/ @web` |

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

### Next step: the real storefront (agreed 2026-11-25)
**Next.js 16 + React 19 (SSR)** in `web/` (container `led-web`, 127.0.0.1:5200), fed only by `/api/shop/*` (NestJS +
TypeORM). Plan, decisions (֏ prices, stock, URLs) and the 11 steps: [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) section 11.
Pages move to Next.js one by one. **Once a page lives in `web/`, design changes go into its React components there, not
into `Design/site` / `build_shop.py`** — the static templates are then only references.

## Rules
- Access is read-only, always. Never send cost/margin columns (see README).
- Back up before changing anything on the server; don't touch other projects there.
- Update this file (Log + any changed URL/process) at the end of every work session, on either side.
- Customer data (old led.am users, orders) is personal data: dumps (`*.sql`) never go to git or a web folder; on the server only
  `/root`, chmod 600. Back up the DB (`pg_dump`) before every customer import. Site accounts/orders must use the `customers`
  tables and `/api/shop/login` (see docs/PROJECT_PLAN.md "Customers"), never a new user table; customer tokens must never open `/api/admin`.
- Two category trees: **"Категории сайта"** (`site_categories`, edited in the admin) is the **only** catalog the site shows.
  **"Категории"** in the admin = Access `Типы` (`categories`, 362 rows, many legacy, synced, read-only): used only to find which
  products go into a site category, never shown on the site. Storefront code must read categories from `site_categories` only.
- Product → site category placement runs on the server by itself: manual > name rules > AI (Gemini, in-stock products only,
  ≥ 90 % applied). Never send prices/cost/customer data to the AI, only names/brands/category names. Storefront reads the stored
  `product_site_categories`, never calls the AI. Renaming "Игровые"/"Офисные"/"Для дома" → update the hints in `ask()`.

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
- 2026-11-20 — Category toolbar hover: sort button glow ring + chevron nudge, sort options cascade in, slide with blue wash and icon spring;
  grid/list toggle glow + icon pop; pager buttons lift; compare checkbox tint. (Sort/view buttons also have the secondary button effect.)
  Backup `led-static-backup-20261120zk.tgz`. Published.
- 2026-11-20 — Armenian catalog section names = led.am: Համակարգիչներ, նոութբուքեր, սերվերներ · Պլանշետներ, սմարթֆոններ, գաջեթներ ·
  Համալրող սարքեր · Համալրող պարագաներ · Աքսեսուարներ · Ցանցային սարքեր (in `CAT` on index/category/product; top row copies them).
  Backup `led-static-backup-20261120zl.tgz`. Published.
- 2026-11-20 — Mega menu fits the screen: `.mega-in` max-height = viewport minus its top (`--mtop`, set by JS on scroll/hover), only the
  category list (`.mega-g`) scrolls, "Popular"/"Brands" row stays visible at the bottom (`<!--mega-fit-->` in card_fx.html). Backup `led-static-backup-20261120zm.tgz`. Published.
- 2026-11-20 — Compare: column head hover glow no longer hugs the content edge (`.sp-pc.pc` padding 10px + margin -10px). Backup `led-static-backup-20261120zn.tgz`. Published.
- 2026-11-20 — Info pages from old led.am (Armenian text, restyled): `credit.html` (Ապառիկ), `about.html`, `how-to-buy.html`, `how-to-order.html`,
  `how-to-pay.html`, `delivery.html`, `warranty.html`, `exchange.html`, `contacts.html` (cards, Google map, form with department select — demo
  submit). Top bar on every page = Ապառիկ · Մեր մասին · Օգնություն ▾ (6 help pages) · Կոնտակտներ; footer "Покупателям" items and old led.am
  help/contacts links point to the new pages. Sidebar menu + breadcrumb built by JS. Sources `site-src/info_content.html` (bodies, one
  `<!--@key|title|icon|h1|lead-->` block per page) and `site-src/info_shared.html` (CSS/JS, HY/RU/EN for chrome only; page bodies are HY).
  Built by `build_shop.py`. Old-site client/partner logos are 404 on led.am, so not used. Backup `led-static-backup-20261120zo.tgz`. Published.
- 2026-11-20 — Info pages now in HY/RU/EN: page bodies switch with the language buttons (`.ipl[data-l]` blocks, page title follows).
  RU/EN text from old led.am/ru and /en, in `site-src/info_content_i18n.html` (block key `<page>.ru` / `<page>.en`); build asserts all 3 exist.
  Backup `led-static-backup-20261120zp.tgz`. Published.
- 2026-11-20 — Exchange page (HY): added the RU/EN rule that single-use-packaging goods and goods unusable once opened (cartridges, cleaning products) are not exchangeable. Backup `led-static-backup-20261120zq.tgz`. Published.
- 2026-11-20 — Responsive pass, all 16 pages (`site-src/responsive.html`, added last by `build_shop.py`): checked with no horizontal
  overflow at 320/375/414/600/768/900/1024/1280/1600 px. Phones: top bar keeps phone + language (help links are in the footer), header
  is one row (burger, logo, icons), grid tracks `minmax(0,1fr)` (cart/favourites/similar/assembly/contacts overflowed), compare bar
  full width and lifts above the sticky buy bar / call button, catalog menu full screen with a fixed ✕ and page scroll locked.
  **Filters button on category now opens a full-screen drawer** (✕, Esc, "Show (N)") — before, it did nothing. Tablets 761–1000 px:
  search on its own row; top menu wraps instead of overflowing. Backup `led-static-backup-20261120zr.tgz`. Published.
- 2026-11-20 — Git: `Design/site/` and `Design/site-src/` are now tracked (`.gitignore` keeps the rest of `Design/` private; root
  `logo.png` ignored). **Commit both after design changes: edit `site-src`, run `build_shop.py`, commit `site` + `site-src`.**
- 2026-11-20 — New page `registration.html` (Գրանցում, like led.am/ru/users/registration.html), HY/RU/EN: personal info, address, customer
  type (private / dealer → company name / company → name, legal & actual address, tax code, bank account), login/password; repeat email and
  password must match, min 3 chars, demo submit. Info-page layout (sidebar item "Գրանցում"); header "Кабинет" icon links to it. Source
  `site-src/register_content.html` (generated block, read by `build_shop.py`). Backup `led-static-backup-20261120zs.tgz`. Published.
- 2026-11-20 — New page `login.html` (Մուտք), HY/RU/EN: login/email + password, "remember me", "forgot password" panel on the same page
  (`/login.html#forgot`, e-mail → demo "link sent"), card with account benefits + "Register" → `/registration.html`. Header "Кабинет" icon now
  opens `/login.html`; registration page's login/forgot links point here. Source `site-src/login_content.html`. Backup `led-static-backup-20261120zt.tgz`. Published.
- 2026-11-20 — New page `account.html` (Անձնական էջ / Личный кабинет), HY/RU/EN, demo session in localStorage `led-user` (addresses `led-adr`,
  last registration `led-reg`). Login (any login/password) and registration save the session and open the account; not logged in → "please
  log in" card. Tabs (`#ov`, `#orders`, `#profile`, `#adr`, `#pwd`): overview (greeting, bonus points, live counts of orders/favourites/
  compare/cart, 2 recent orders), orders (5 demo orders, status filter, expandable items, progress steps, payment/delivery, repeat order →
  cart, invoice = print), profile edit (saved), addresses (add/edit/delete/make default), password change (match check), logout. Header
  "Кабинет" → account when logged in, else login. Shared form validation is now `window.LEDInfoForm(form)` and fires an `ok` event with the
  form data. Source `site-src/account_content.html` (CSS + JS in the HY block). Backup `led-static-backup-20261120zu.tgz`. Published.
- 2026-11-20 — New page `checkout.html` (Պատվերի ձևակերպում), 4th shop page in `shop_pages.html` (`checkout()`), HY/RU/EN. Cart "Оформить
  заказ" opens it and carries delivery choice + LED5 promo (sessionStorage `led-co`, form values kept there too). Steps: 1 contacts (private /
  company → name + 8-digit TIN; prefilled from `led-user`, "log in" link), 2 delivery (pick-up showroom card / courier with address, date,
  time slot / Armenia with province + city; saved addresses from `led-adr` as chips), 3 payment (cash, card, Idram/TelCell, instalments with
  6/12/24/36-month monthly amount, bank transfer for companies), 4 comment + "call me". Sticky summary with items, totals, terms checkbox.
  Validation marks every missing field (runs before the phone mask). Success screen: order number, next steps, items; order saved to
  localStorage `led-orders` and shown in the account's orders; cart emptied. Demo — nothing is sent. Backup `led-static-backup-20261120zv.tgz`. Published.
- 2026-11-20 — 1-click buy works: shared modal `site-src/oneclick.html` (all pages via `build_shop.py`, `window.LEDOneClick(items,{clear})`),
  HY/RU/EN. Product page "Купить в 1 клик" (`#oneclick`) → this product with current price (follows options) and qty (± in the modal);
  cart "Գնել 1 քայլով" (`#spOne`) → all cart items, cart emptied after. Name prefilled from `led-user`, phone required (+374 mask, 8 digits),
  comment. Success: request number, "manager calls in 10 min"; saved to `led-orders` (shows in account). Esc/✕/backdrop close; bottom
  sheet on phones. The old `#mdl` on product.html is no longer opened. Demo — nothing is sent. Backup `led-static-backup-20261120zw.tgz`. Published.
- 2026-11-20 — Hand cursor on everything clickable (product cards `.prod`, favourites/compare cards, bundle items, all buttons/links,
  radio/checkbox labels, selects) — rule at the top of `card_fx.html`. Mobile fix: button/card hover effects (btn_fx/card_fx) now start
  only for a real mouse (`pointerType==='mouse'`); on phones they added spans on the first touch, so iOS took the first tap as hover and
  buttons (incl. 1-click) needed two taps. 1-click modal item name class `.t` → `.nm` (`.t` is the trust-tile class and got its effect).
  Backup `led-static-backup-20261120zx.tgz`. Published.
- 2026-11-20 — New page `forgot-password.html` (Գաղտնաբառի վերականգնում), HY/RU/EN, 3 steps: e-mail/login → 6-digit code (digits only,
  "resend in 60 s" timer, change e-mail) + new password ×2 with strength bar → done + "Log in". Help card with phones/e-mail. Login and
  registration "forgot" links open it; old `login.html#forgot` redirects; old led.am `users/forgot` links map to it. Source `site-src/forgot_content.html`.
  Phone fixes (`responsive.html`): call button moves above the compare bar (bar now full width) instead of covering its button; compare
  table's sticky product row uses the real header height (`--hdr`, set by JS; phones 127px — was 84px, left a blank strip); prices never wrap
  (֏ on its own line); footer on phones = brand block full width + two equal columns (right column was squeezed). Backup `led-static-backup-20261120zy.tgz`. Published.
- 2026-11-20 — New page `track-order.html` (Պատվերի կարգավիճակ / Отследить заказ), HY/RU/EN, in the Help menu and info sidebar. Order
  number (accepts `104823` or `LED-104823`) + optional phone → status badge, expected date/slot card, 5-step progress bar (pick-up orders:
  "Ready"/"Collected"), history log with times, details (delivery, payment, courier with call button while on the way), items + total,
  "SMS me" toggle, call manager, print. Finds orders from `led-orders` (checkout / 1-click) + 4 demo orders (LED-104823 on the way,
  LED-104511 delivered, LED-104901 processing, LED-103402 cancelled); "not found" message otherwise; `?n=` in the URL. "Track" links on
  account orders, checkout success, 1-click success. Its form runs before the phone mask (phone optional). Armenian dates are formatted by
  hand (browsers lack hy-AM month names) — also in account and checkout. Source `site-src/track_content.html`. Backup `led-static-backup-20261120zz.tgz`. Published.
- 2026-11-21 — Search. Header search box (all pages, `site-src/search_box.html`): Enter/"Найти" → `/search.html?q=…`; live dropdown while
  typing — matching categories with counts, top 5 products with highlighted words and prices, "All results (N)"; empty box shows recent
  searches (localStorage `led-recent`, clear) and popular queries; ↑/↓/Enter/Esc. Demo index of 29 products in 8 categories
  (`window.LEDSearch`, until /api); every word must match title/spec/brand or a RU/HY/EN category word (ноутбук/նոութբուք/laptop…);
  "did you mean" via edit distance (lenvo → lenovo). New page `search.html` (shop page `search()` in shop_pages.html): «query» + count,
  category chips (`&cat=`), filters (brand with counts, price from/to, in stock, on sale, reset; a "Filters" toggle on tablets/phones), sort
  (relevance/cheap/expensive/discount, `&sort=`), product cards like category (cart/♡/compare work, card opens product), nothing-found state
  with suggestion, popular queries and bestsellers. `.search` no longer `overflow:hidden` (clipped the dropdown). Class `.t` must not be used
  inside new widgets (trust-tile effect) — used `.nm`. Account demo orders: `p6.webp` doesn't exist → `p5`. Backup `led-static-backup-20261121a.tgz`. Published.
- 2026-11-21 — New page `brand.html` (shop page `brand()` in shop_pages.html), HY/RU/EN. `?b=lenovo` → brand hero (logo, "official
  partner", text, country/founded/warranty/in-stock facts, service centre), then the same results block as search (`srResults()`: category
  chips, brand/price/stock/sale filters, sort, cards) and "Other brands". No `?b` → all brands A–Z (letter filter, find box, tiles with logo
  and product count). Brand facts in `BI` (shop_pages). Logos: `build_shop.py` copies the 12 SVG logos from index.html's `.brands` tiles into
  `window.LEDBrandLogos` on brand.html; others get a text logo. Home brand tiles, catalog-menu brand tiles and the product page brand chip open
  the brand page (`search_box.html`). Fix: order tracking progress line now runs from the first to the last dot centre and sits under the
  dots (was drawn over the current dot and misaligned). Backup `led-static-backup-20261121b.tgz`. Published.
- 2026-11-21 — Hand cursor on range sliders (`input[type=range]`, e.g. credit/instalment term slider) via the cursor rule in `card_fx.html`. Backup `led-static-backup-20261121c.tgz`. Published.
- 2026-11-21 — Compare: sticky product row `top:0` (its sticky container is the horizontal scroller `.sp-cmpw`; the header offset left a blank strip). Favourites: "Share list" button removed. Backup `led-static-backup-20261121d.tgz`. Published.
- 2026-11-21 — Cart: delete is now a red icon button (`.sp-del`, light red, fills red on hover) left of the qty box (`.sp-ctl` wrapper); no blue button effect on it. Backup `led-static-backup-20261121e.tgz`. Published.
- 2026-11-21 — Cart: promo code box removed. Checkout success total row class `.t` → `.tt` (`.t` got the trust-tile hover box). Backup `led-static-backup-20261121f.tgz`. Published.
- 2026-11-21 — Account orders: "Invoice (PDF)" button removed. Backup `led-static-backup-20261121g.tgz`. Published.
- 2026-11-21 — Search/brand cards: compare button (`.sr-cmp`) moved down to top 60px — gap under the ♡. Backup `led-static-backup-20261121h.tgz`. Published.
- 2026-11-21 — Product page: compare bar lifts above the sticky buy bar on all widths (was phones only; on desktop the buy bar covered it). Backup `led-static-backup-20261121i.tgz`. Published.
- 2026-11-21 — Track order: "Print" button removed. Backup `led-static-backup-20261121j.tgz`. Published.
- 2026-11-21 — Sticky side columns (info/account sidebar `.ip-nav`, cart/checkout summary `.sp-side`) now stick at real header height + 16px (`--hdr`); they slid under the taller header. Backup `led-static-backup-20261121k.tgz`. Published.
- 2026-11-21 — Account page mobile (≤1000px): side menu becomes a compact card — avatar/name row, section tabs as a swipeable pill row
  (`.ac-tabs`), favourites/compare/cart/logout as 4 small icon buttons. Phones (≤600px): tighter cards, stats with icon + number in a row,
  status filters scroll sideways, order header = number/date left, status + sum right (was wrapping), item rows stack the sum, order buttons
  full width. CSS in `site-src/account_content.html`. Backup `led-static-backup-20261121l.tgz`. Published.
- 2026-11-21 — Checkout mobile: steps row scrolls, tighter cards, private/company switch full width, 16px inputs (no iOS zoom), delivery/payment
  options one per row (auto-fit on tablets), address chips scroll, instalment monthly sum on its own line, full-width submit and success
  buttons. Search/brand cards: compare button aligned under the ♡ (`right:22px`, was 14px). Backup `led-static-backup-20261121m.tgz`. Published.
- 2026-11-21 — Cart phones (≤600px): smaller title, item row = photo | name/spec (2 lines) on top, delete+qty and price on one line under it,
  full-width checkout buttons, upsell one per row. Login phones: the help sidebar moves below the form (≤1000px, `.ip:has(.lg-w)`), compact
  hero, big full-width "Log in"/"Register" buttons, 16px inputs on all info forms (no iOS zoom). Backup `led-static-backup-20261121n.tgz`. Published.
- 2026-11-21 — Registration phones: help sidebar below the form (≤1000px), compact hero, section headings separated by lines, bigger
  inputs, full-width "Register" button first in its row. Backup `led-static-backup-20261121o.tgz`. Published.
- 2026-11-21 — Phone pass 2 (`responsive.html`, all pages): info pages (help pages, contacts, credit, track order, forgot password…) show
  the content first and the help sidebar under it (≤1000px; not on account — its menu has `.ac-nav`); compact hero on phones. Assembly rows
  on phones: icon + name (+ price, ×) on top, select + qty under it; empty rows hide qty/price. Product specs: name | value in two columns.
  Compare label column narrower. Checked at 390px with headless Chrome. Backup `led-static-backup-20261121p.tgz`. Published.
- 2026-11-21 — Category cards on phones/touch: compare + "Details" were stacked and squashed to thin strips (column flex with flex:1).
  Now one row: square 40px compare icon button + full-height "Details" button (`responsive.html`). Backup `led-static-backup-20261121q.tgz`. Published.
- 2026-11-21 — Category card buttons on phones, take 2: icon+"Details" in one row cut the Armenian word ("Մանրամ…"). Now two full-width
  38px buttons stacked (Համեմատել, Մանրամասն), arrow hidden ≤420px. Checked at 375px in HY. `build_shop.py` now strips the old
  `<!--responsive-->` block from category's tail before its assert (the build failed once `responsive.html` mentioned `cgrid3`).
  Backup `led-static-backup-20261121r.tgz`. Published.
- 2026-11-21 — Compare on phones: long Armenian labels ("գնահատական") ran past the label column. Label column 112px, labels 12px with word
  wrapping, section headings on one line over the row. Checked at 375px in HY. Backup `led-static-backup-20261121s.tgz`. Published.
- 2026-11-21 — Product page phones (≤560px): the 4 key-spec cards are a 2×2 grid (icon above text) instead of 4 stacked rows; description
  highlights (battery/weight/thickness) 3 in a row; spec labels top-aligned; "Similar products" heading and its link wrap cleanly.
  Backup `led-static-backup-20261121t.tgz`. Published.
- 2026-11-21 — Catalog structure from the client (`Design/Categories.docx`): 7 sections — Компьютеры (AIO, Mini-PC, Для дома, Офисные,
  Дизайнерские, Игровые, Для разработчиков), Ноутбуки (Для дома, Офисные, Игровые, Сумки, Подставки и охладители, Зарядные устройства,
  Блоки питания, Аккумуляторы), Комплектующие, Периферия, Планшеты/смартфоны/гаджеты, Аксессуары, Сетевые устройства (last 5 unchanged).
  Servers removed. `CAT`/`HOT`/`BR` and top menu (`data-m=0..6`, laptop icon) updated in index/category/product, rest rebuilt by
  `build_shop.py`. Backup `led-static-backup-20261121u.tgz`. Published.
- 2026-11-21 — Home: quick-links row under the hero (`.qk`): Акции (orange, HOT), Серверы и сетевое оборудование (navy), Новинки (green) cards +
  stats card (20+ лет / 10 000+ / 0%, number + label). 4 columns; stats full width ≤1200px; one column on phones. Backup `led-static-backup-20261121v.tgz`. Published.
- 2026-11-21 — Home hero side: servers card replaced by a gaming card (`.promo.gm`, links to `/category.html`): dark purple neon gradient, scanlines, RGB
  strip at the bottom, falling neon lines, animated equalizer + "240 FPS"/"RTX 50 · 1 ms" HUD chips, pink gamepad icon. Animations off with reduced motion.
  Backup `led-static-backup-20261121w.tgz`. Published.
- 2026-11-21 — Home configurator block: the right side is now "Top ready builds" (`#topBuilds`) instead of the click-to-swap mini
  configurator. 3 builds (Office / Gaming / Ultra) as tabs that auto-rotate every 7 s (progress line on the tab, pauses on hover); each
  card has an animated glass PC tower (spinning RGB fans, colour per build), badge, 4 spec chips, games/work bars, price + old price +
  monthly, cart button (adds the build to the shared cart) and "Configure" → `/assembly.html` with the build's parts preloaded into
  `led-asm` (ids = assembly_page.html parts). Left buttons now link to `/assembly.html` and `/category.html`. HY/RU/EN.
  Backup `led-static-backup-20261121x.tgz`. Published.
- 2026-11-21 — Home gaming card (`.promo.gm`) redone as a retro game screen: synthwave striped sun, a neon perspective grid floor
  scrolling toward you, stars, scanlines, cyan HUD corner brackets (close in on hover), HUD row (LVL 99, HP/XP bars, live-flickering FPS
  `#gmFps`), bobbing gamepad icon, RGB-split title that glitches on hover, blinking ▶ "press start" link, pink crosshair that follows the
  mouse. Old eq/HUD chips/falling lines removed. Motion off with reduced motion. Backup `led-static-backup-20261121y.tgz`. Published.
- 2026-11-21 — Top menu: wrench and "Акции" removed; the 7 sections are compact tiles (38px tinted icon box above the name, 7 columns,
  4 on ≤1100px; CSS in `card_fx.html`). Hover-opened catalog menu now closes 250 ms after the mouse leaves the menu row / catalog button /
  popup (was the whole header). Backup `led-static-backup-20261121z.tgz`. Published.
- 2026-11-21 — Catalog popup: hover-opened popup now closes when the mouse leaves the visible panel (`.mega-in`), not the full-width `.mega`
  wrapper (empty sides kept it open). Mega links no longer slide on hover (pushed past the edge → horizontal scrollbar); `.mega-g` overflow-x
  hidden. Build fix: `<!--mega-fit-->` block is now stripped before re-adding (was duplicated 122× per page). Backups `led-static-backup-20261121za/zb.tgz`. Published.
- 2026-11-21 — Catalog popup: clicking a section on the left (`.mega-l` button) opens `/category.html` with a mouse; on touch screens a tap still just
  switches the section (no hover there). Backup `led-static-backup-20261121zc.tgz`. Published.
- 2026-11-21 — Catalog popup on phones (≤600px): heading stacks — title, then "All products →" on its own line (it overlapped the title and the arrow wrapped). Backup `led-static-backup-20261121zd.tgz`. Published.
- 2026-11-21 — Home configurator block: "Ready builds" button removed (only "Open configurator" left). Backup `led-static-backup-20261121ze.tgz`. Published.
- 2026-11-21 — Admin **Customers** (`/admin/customers`): 4 251 registered users from the old led.am MySQL dump
  (`Design/led_new.sql`, private, `*.sql` in .gitignore) with 2 457 orders / 4 069 lines (3 648 linked to Access products by code)
  and 787 favourites. List (search name/email/phone/company/tax code, type/status filters, sort by orders/spent), card with
  editable profile + company details, block/unblock with reason, set password, orders with items, favourites, edit history.
  Old MD5 passwords stored wrapped in bcrypt and upgraded on first login (`POST /api/shop/login`, for the future storefront).
  Import is re-runnable — **run it again when the site goes live** (README "Customers from the old led.am site").
  DB backup before import: `/root/led-db-backup-20261121-2002-pre-customers.dump`; dump copy `/root/led_new.sql.gz` (chmod 600).
- 2026-11-21 — Catalog = 6 sections per the client's list: "Планшеты, смартфоны, гаджеты" is no longer a section — Планшеты, Смартфоны,
  Гаджеты are now subcategories at the end of Периферия. Last section renamed "Сетевое оборудование" (Ցանցային սարքավորումներ / Network
  equipment). Top menu 6 tiles (`data-m=0..5`; grid 6 columns, 3 on ≤1100px). Backup `led-static-backup-20261121zf.tgz`. Published.
- 2026-11-21 — **Real customer accounts** (`backend/src/shop.ts`, `/api/shop/*`, site script `site-src/auth.html` on every page).
  Registration = phone (+374 mask) + location (region select) + password only; a phone already in `customers` (also old led.am users,
  matched by last 8 digits) → "log in or reset". Login by phone, e-mail or old login; old led.am passwords still work. Session = httpOnly
  cookie `led_s` (path `/api/shop`, 30 days), `token_version` logs out everywhere (password change/reset, "log out on all devices").
  Password reset: 6-digit code, 15 min, 5 tries — sent by e-mail (`SMTP_*` in `/opt/led-computers/.env`, **not set yet**) or SMS
  (`sendSms()` in `backend/src/mailer.ts`, no provider yet); `MAIL_DEV_LOG=1` (currently ON on the test stand) prints codes to
  `docker compose logs api` — remove it before go-live. Account page: real profile edit, addresses (`customers.addresses`), password,
  order history from `customer_orders` (old led.am orders now; re-import keeps customer edits via `edited_at`). `localStorage led-user/led-adr`
  are only a display cache. Rate limits in memory. Migration `ShopAccounts1764200000000` (`source`, `addresses`, `token_version`,
  `customer_reset_codes`). DB backup `/root/led-db-backup-20261121-2311-pre-shop-accounts.dump`, static `led-static-backup-20261121zg.tgz`. Published.
- 2026-11-21 — Admin **"Log in as customer"** (list row link + button on the customer card): `POST /api/admin/customers/:id/login-as`
  (admin role only, not for blocked customers) sets the site cookie `led_s` in the admin's browser for 2 h (ends with the browser,
  token has `imp` = admin e-mail) and opens `/account.html` in a new tab; the account shows a yellow "viewing as customer" banner
  with "Exit" (logs out, back to `/admin/customers`). Doesn't change the customer's last-login; not logged (since 2026-11-22).
  Backup `led-static-backup-20261121zh.tgz`. Deployed.
- 2026-11-22 — Admin product card (`/admin/products/:id`): rows «Цена прайса» (above «Цена»), «Диллерская цена 1» and «Диллерская цена 2» (below).
  Read from the Access mirror (`mirror_rows`, table `Товары`) in `GET /api/admin/products/:id` — no agent change. Admin only, **never in `/api/shop`**. Deployed.
- 2026-11-22 — "Log in as customer" is no longer written to `change_log` (owner's request); old `login_as` rows deleted (copy in
  `/root/led-changelog-login-as-20261122.csv`). Admin sidebar menu items have line icons (inline SVG, `.ni`). Deployed.
- 2026-11-22 — Admin "Products" menu item, the dashboard "Products" tile and the product card's back link open `/products?stock=in` (in-stock filter by default). Deployed.
- 2026-11-22 — Remaining 3 `login_as` rows removed from the log. Admin filters: "Show deleted" checkbox no longer stretches/wraps (`.check`). Deployed.
- 2026-11-22 — Admin customers list sorts by number of orders (most first) by default. Deployed.
- 2026-11-22 — Admin customers list shows only customers with orders by default ("with orders" checkbox on; unticked = `?orders=0`, all customers). Deployed.
- 2026-11-22 — Admin products list: columns «Цена прайса» and «Диллерская цена 1» after «Цена» (sortable; joined from `mirror_rows` `Товары`, admin only). Deployed.
- 2026-11-22 — Admin customers list default sort back to registration date, newest first (filter "with orders" still on by default). Deployed.
- 2026-11-22 — Admin customers list: "with orders" filter off by default again (all customers, newest registrations first; `?orders=1` = only with orders). Deployed.
- 2026-11-22 — Admin Access tables (`/tables/:name`): dates shown as `21.11.2026` (time only when not midnight); default sort = first key column, newest first. Deployed.
- 2026-11-22 — Admin products: currency shown as a symbol ($ € ₽ ֏) instead of the Access name («Доллары»), list and product card. Deployed.
- 2026-11-22 — Registration: location (Բնակավայր) field removed; `/api/shop/register` no longer requires `city`. Backup `led-static-backup-20261122a.tgz`. Published.
- 2026-11-22 — Auth forms: error box (`.au-err`) full width. Backup `led-static-backup-20261122b.tgz`. Published.
- 2026-11-22 — Admin product card: **AI photo finder** (`backend/src/photos.ts`, `admin/src/photos.tsx`, README "AI product photos").
  "Подобрать фото (AI)" collects candidates, Gemini vision scores exact-model match + photo quality and preselects the best; "Save" stores
  it in the `media` volume (`/api/media/products/<id>/<sha1>.ext`, first in `products.images`); make main / remove. Downloads go through
  an SSRF guard. `GEMINI_API_KEY` is in `/opt/led-computers/.env` (key from `access.txt`, now git-ignored). The key is **free tier**: Google
  Search grounding is not allowed, so web search needs `GOOGLE_CSE_KEY`+`GOOGLE_CSE_CX` or `BRAVE_SEARCH_KEY` (not set yet) or billing +
  `GEMINI_SEARCH=1`; until then paste a product-page/image link and AI picks from it. Server compose now has the `media` volume.
  Backups `/root/led-compose-backup-20261122-0125.yml`, `/root/led-env-backup-20261122-0125`. Deployed.
- 2026-11-22 — AI photos without a search key: Gemini now suggests product-page URLs from memory and the server tries them (`geminiGuess`).
  Tested on 16357 (Ugreen) and 14123 (TP-Link): **no usable page** — guessed URLs are often wrong (404), and Amazon/Newegg/Ugreen/RU shops block
  servers (401/403/429/503). Free Gemini key alone can't search reliably; real search needs `BRAVE_SEARCH_KEY` (Google CSE is closed to new
  customers) or Gemini billing + `GEMINI_SEARCH=1`. Pasting a link still works. Deployed.
- 2026-11-22 — AI photos switched to **OpenAI** (`OPENAI_API_KEY` in `/opt/led-computers/.env`, from `access.txt`; `OPENAI_MODEL` default
  gpt-5.4-mini). OpenAI web search finds product pages + direct official image URLs, OpenAI vision scores them (`rankOpenAI`); Gemini is only a
  fallback when no OpenAI key. Works without a pasted link: 16357 (Ugreen 70601) and 14123 (TP-Link UB500) both got a correct pick in ~11 s.
  Sites that block servers (ugreen.com, Amazon, RU marketplaces) are skipped, not bypassed. Server compose has the new env lines;
  backups `/root/led-env-backup-*`, `/root/led-compose-backup-*`. Deployed.
- 2026-11-22 — AI photos: switch `AI_PROVIDER=gemini|openai` (server `.env` now **gemini**; `OPENAI_API_KEY` kept, set `AI_PROVIDER=openai` to go back).
  `GEMINI_MODEL=gemini-2.5-flash` from access.txt is retired for this key (404) → falls through to gemini-3.8-flash / flash-latest.
  Gemini key is still free tier (Google Search → 429), so without a pasted link it only guesses pages (16357: no correct photo);
  with a pasted link it works (TP-Link UB500: match 100 / quality 95, 16 s). Deployed.
- 2026-11-22 — AI photos **mixed mode**: `AI_SEARCH=openai` (OpenAI web search finds pages/images) + `AI_PROVIDER=gemini` (Gemini judges the
  photos). Both keys in server `.env`. OpenAI results vary per run, so a second, differently worded search runs when the first gives < 3
  usable images; logo/icon/banner URLs are skipped. Test: 16357 ×3 and 14123 ×1 — all 4 picked a correct white-background photo
  (match 100, quality 95–100), 18–30 s. Backups `/root/led-env-backup-*`, `/root/led-compose-backup-*`. Deployed.
- 2026-11-22 — Admin **"Site categories"** (`/admin/site-categories`, `admin/src/site-categories.tsx`, `backend/src/site-categories.ts`): the
  storefront catalog tree in the DB (`site_categories`: section → group → item, max 3 levels, RU/HY/EN names, icon + promo line for sections,
  order, visible, slug, linked Access categories `access_category_ids` for the future product feed). Seeded from the site's `CAT` (index.html)
  — 6 sections, 173 rows. Tree with search, ↑/↓ reorder, hide/show, add child, edit, move to another parent, delete (with children); every
  change in `change_log` (entity `site_category`). Public `GET /api/shop/categories` (visible tree, cache 60 s). **The site's "Catalog" popup
  and top menu now come from it** on every page (`site-src/site_cats.html`, cache `localStorage led-cats`, built-in `CAT` = fallback); page
  scripts expose `window.LEDMega` for it, top-menu hover is delegated (menu re-renders). Category/product popups now list the same groups as
  home. **Edit the catalog in the admin, not in `CAT`.** Not yet driven by it: the category page's left tree (`TREE`) and search's demo index.
  build_shop.py no longer piles up blank lines (pages had ~900). DB backup `/root/led-db-backup-20261122-1218-pre-site-categories.dump`,
  static `led-static-backup-20261122c.tgz`. Deployed + published.
- 2026-11-22 — Category page left tree (`#tree`) now comes from the admin "Site categories" too: section = header, group = link, its
  subcategories nested under the selected group; `?c=section/group[/sub]` (slugs) selects, the URL follows clicks; top-menu tiles link to
  `/category.html?c=<section>`; breadcrumb + page title follow. site_cats.html sets `window.LEDCatsTree` and fires `led:cats`; built-in
  `TREE` = fallback. Filter panel: demo filter set guessed from names (laptops/bags/chargers/PC/gaming/AIO/Mini-PC), brand only elsewhere.
  Counts in the tree = `k` from `/api/shop/categories` (products in linked Access categories), shown only when linked. Known old glitch: a
  raw "price" chip in the category toolbar (`.chips`), not from this change. Backups `led-db-backup-20261122-1227-pre-cat-tree.dump`,
  `led-static-backup-20261122d.tgz`. Deployed + published.
- 2026-11-22 — **Category icons editable in the admin** ("Site categories" → section → Icon "Change…"): picker with previews of the site's
  33 built-in icons (`site_icons.builtin`, read-only, = the static sprite) and **added icons**: upload `.svg` or paste SVG code, options
  "filled" / "single colour" (currentColor → follows site colours + hover), live preview made by the server; rename/replace drawing, delete
  only when no category uses it (`backend/src/site-icons.ts`, `admin/src/site-icons.tsx`, migration `SiteIcons1764400000000`). Uploaded SVG
  is **rebuilt from a whitelist** (shapes + paint attributes only; scripts/styles/links/images/gradients dropped) — never store raw SVG.
  `/api/shop/categories` sends each section's icon as `g: [viewBox, svg]`; site_cats.html adds missing `<symbol>`s to `#ledIcons`.
  Icon keys of added icons start with `ci-`. Changes logged (`site_icon`). Backups `led-db-backup-20261122-1237-pre-site-icons.dump`,
  `led-static-backup-20261122e.tgz`. Deployed + published.
- 2026-11-22 — Catalog popup: the top-menu tile of the section shown in the popup is active (hovering/clicking a `.mega-l` button moves it; closing the popup clears it). MutationObserver in `card_fx.html`, all pages. Backup `led-static-backup-20261122f.tgz`. Published.
- 2026-11-23 — **Products → site categories** (admin "Привязка товаров" `/admin/product-categories`, README "Products → site
  categories"). Order: manual (product card / bulk) > name rules of each site category (`site_categories.match_rules`: starts
  with / contains / not, `/regex/`; edited in "Категории сайта" with a "Проверить" preview; + linked Access categories) > AI
  (only in-stock products without an exact subcategory; ≥ 90 % applied and marked AI, lower → review list; auto every 30 min,
  Gemini per `AI_PROVIDER`, `AI_CATEGORIES=off` / `AI_CATEGORIES_AUTO=0` to stop). Starting rules from real names
  (`category-rules-seed.ts`): 1 092 of 1 149 in-stock products get an exact subcategory by rules alone. Access categories are
  only a hint (often wrong). Products list has a "Категория сайта" column + filter; `/api/shop/categories` `k` = in-stock products
  in the category or below. Tables `product_site_categories`, `product_ai_categories` (migration `ProductSiteCategories1764500000000`).
  **The site tree has no "Сокет 1851"** (Core Ultra CPUs/boards stay in the group) — add it in the admin if wanted.
  After the first AI run on production: 1 115 of 1 149 in stock exact, 15 group only, 19 none (batteries, camera bags…), 10 AI
  suggestions to review. DB backup `/root/led-db-backup-20261123-0229-pre-product-categories.dump`, compose `led-compose-backup-20261123-0229.yml`. Deployed.
- 2026-11-23 — Docs: README "Products → site categories" now says who decides (the server; Claude only wrote the starting rules once),
  what the AI is sent (names, brands, Access category names; never prices/customers), that it may answer only with a listed category,
  the admin tags (вручную / правило / AI 95%), and limits (300 per run, 40 per request). PROJECT_PLAN data-ownership table: site
  catalog + placement owned by the website. New rule above on AI placement.
- 2026-11-23 — **AI photos reworked** (`backend/src/photos.ts`, `admin/src/photos.tsx`, README "AI product photos"). Brand/model/codes read
  from the product name (`identify()`, `BRANDS` list — the Access brand column is empty; add new brands there). **Open Icecat** first
  (official high-res photos, free for TP-Link, Gigabyte, ASUS, Lenovo, Lanberg…; ~0.1 s); web search (2 OpenAI searches in parallel)
  only if Icecat gives < 3. sharp (new backend dependency) checks size ≥ 300 px, banner shape, logo URLs, drops the same picture in two
  sizes, sends 512 px thumbnails to the AI. **Photos are rated by OpenAI first** (`AI_RANK`, ~4 s; the free Gemini key had run out of
  daily quota and took 30–50 s), Gemini as fallback; rating = match / quality / kind (product, box, infographic, lifestyle, logo).
  Server picks the main photo (match + quality + resolution + white background); Icecat and brand-site photos count as exact matches.
  Admin: select several photos (★ = main, numbers = gallery order), "+ gallery photos" button. **Saved photos are cleaned**: white
  border trimmed, product centred on a white square, max 1200 px, WebP. Test on 8 products: 5–42 s per search (was 50–150 s, 2 of 8
  failed with "Gemini busy"); hard cases: Intel tray CPUs (only logos found — paste a link). DB backup `/root/led-db-backup-20261123-1648-pre-photos2.dump`. Deployed.
- 2026-11-23 — Server `.env`: `AI_CATEGORIES=openai` — product → site-category AI now uses OpenAI (the free Gemini key ran out of daily quota). Photos already rate with OpenAI first. Backup `/root/led-env-backup-20261123-*`.
- 2026-11-23 — **Batch AI photos** (admin "Фото товаров (AI)" `/admin/photo-batch`, `backend/src/photo-batch.ts`, table `product_photo_jobs`, migration `PhotoJobs1764600000000`). Start for N in-stock products without photos (newest first, max 300); one background worker; clear cases (Icecat / brand-site photo, match ≥ 95, quality ≥ 80) saved by themselves + up to 3 gallery photos, with "Undo"; the rest "на проверку" (same picker as the product card, retry with a link, skip). First test, 10 products, 4 min: 6 saved by themselves (5 video cards from Icecat, Ugreen adapter from its official site — all checked, correct and clean), 4 to review (2 case panels, Lenovo V15 and Logitech K250 found only on shop sites). DB backup `/root/led-db-backup-20261123-1735-pre-photo-jobs.dump`. Deployed.
- 2026-11-23 — Photo batch run of 20: 13 saved by themselves, 14 to review, then **OpenAI credit ran out** ("You have no credits remaining"). Worker now waits 60 s and retries twice on an AI rate limit; on "no credits" it **pauses the queue** (product back to queued, red line on the page) until Start / Search again. Gemini free quota was also used up that day. 4 laptops (16707, 16712, 16713, 16714) are "ошибка" — press "Искать снова" after topping up OpenAI.
- 2026-11-25 — **Storefront plan agreed**: Next.js 16 + React 19 SSR (`web/`, `led-web`, port 5200) + NestJS/TypeORM API;
  decisions and 11 steps in docs/PROJECT_PLAN.md section 11. **Step 1 done**: public product API (`backend/src/storefront.ts`):
  `GET /api/shop/products?cat=laptops/home&q=&brand=&min=&max=&stock=in|all&sort=default|cheap|expensive|new|name&page=&limit=`
  (facets: brands, price range, stock counts; category path + children), `/api/shop/products/by-ids?codes=` (cart re-check, `gone`),
  `/api/shop/products/<slug>-<code>` (detail, breadcrumb = deepest site category, 12 similar). Prices ֏ = Access price × latest
  `Курсы` rate, rounded to 100 (USD 365). Brand from the name (`identify()`). No `raw`/cost fields. Rollback image id in
  `/root/led-api-image-before-storefront-*.txt`. Deployed.
- 2026-11-25 — Owner: **the site uses in-stock products only for now** (catalog, search, product pages — out of stock → 404, cart re-check
  marks them gone). Which out-of-stock items stay orderable (old vs popular) is an open client question: docs/PROJECT_PLAN.md section 11
  "Open questions". `stock=all` removed from `/api/shop/products`. Deployed.
- 2026-11-25 — **AI photo search off** (`AI_PHOTOS=off` in server `.env` + compose): the owner doesn't want our own OpenAI/Gemini tokens
  spent on photos; the client will give its own API key (then set `OPENAI_API_KEY`, remove `AI_PHOTOS=off`, `docker compose up -d api`).
  Single search and batch answer 503 "AI photo search is off"; queued jobs wait. **Default product images** for products without a photo:
  `Design/site/img/placeholder/<section>.svg` (6 catalog sections + `default`; site style: blue dot grid, section icon on a white tile,
  LED lights, wordmark, no text → all languages), made by `Design/site-src/make_placeholders.py`; product cards from `/api/shop/products`
  now carry `section`. Live at `/img/placeholder/*.svg`. Backups `led-compose-backup-20261125-*`, `led-env-backup-20261125-*`,
  `led-static-backup-20261125a.tgz`. Deployed.
- 2026-11-25 — AI product → site-category placement also off (`AI_CATEGORIES=off` in server `.env`): no own AI tokens at all now;
  new products are placed by the name rules and by hand. Turn back on with the client's key.
- 2026-11-25 — **Storefront step 3 done: Next.js base live** (`web/`, container `led-web` on 127.0.0.1:5200, image built by CI
  `ghcr.io/narekyeghishyan/led-web`). URLs: Armenian without prefix (`/catalog`), `/ru/catalog`, `/en/catalog`; typed `/hy/...` → 301
  (`web/src/proxy.ts` rewrites to `/hy` internally with marker header `x-led-lang-rewrite`, which nginx blanks). Layout = template chrome
  in React (TopBar, Header with catalog popup from `/api/shop/categories` + 3 in-stock products and top brands per section from
  `/api/shop/products`, top menu, Footer, contact button, background/footer canvases, hover effects), self-hosted Inter + Noto Sans
  Armenian (next/font). Design comes from `Design/site/category.html` via `python web/scripts/import_design.py` → `web/src/styles/site.css`
  (generated, don't edit) + `icon-symbols.ts` + `public/img`; Next-only CSS in `web/src/styles/app.css`. First page `/catalog` (sections +
  groups with live counts), localized 404. Pages cached 60 s (fetch tags `categories`/`products`; refresh trigger from NestJS after a
  sync = step 4). nginx: `/_next/` and `^/(hy/|ru/|en/)?(catalog|p)(/|$)` → 5200, rest unchanged (copy in `deploy/`).
  Deploy web: `cd /opt/led-computers && docker compose pull web && docker compose up -d web`. Backups `led-compose-backup-20261125-0214.yml`,
  `led.creativeweb.am.conf.bak-20261125-0214`. Static pages still link to `/category.html` until step 4.
- 2026-11-25 — **Storefront step 4 done: category pages live.** URL scheme (owner): categories `/<section>/<group>/<item>` (no prefix),
  products `/product/<slug>-<code>`, `/ru` `/en` prefixes, `/catalog` = overview page. Category page (`web/src/app/[lang]/[...slug]`):
  tree, brand + price filters with counts, chips, sort, grid/list, pages, phone drawer, cards (cart/♡/compare into the shared localStorage
  store); canonical clean URL (+`?page=N`), filtered = noindex,follow, BreadcrumbList/ItemList JSON-LD, hreflang. **Old led.am indexing
  kept:** `/api/shop/resolve` + `web/src/proxy.ts` 301 every old URL — product `…_<Access code>.html` → `/product/…` (sold out → its
  category), 353 old categories → mapped site category (table `url_redirects`, source `old-led`, made by `tools/old-led-urls/`; rerun at
  go-live), old info/help/user pages → new pages, `/am|/ru|/en` kept. Category renamed/moved/deleted in the admin → automatic 301
  (`url_redirects` source `slug`); reserved words can't be section slugs (`RESERVED_ROOT`). Cache refresh: API → `web:3000/internal/revalidate`
  (secret `REVALIDATE_SECRET` in .env) after product syncs, Курсы, catalog edits; `/internal/` 404 from outside. `/ru`, `/en` home = temporary
  307 to static home until step 7. No build-time prerender (build must not need the API). Product pages (`/product/…`) = step 5 (404 now).
  DB backup `/root/led-db-backup-20261125-0246-pre-url-redirects.dump`, compose/env/nginx backups `*-20261125-0246`. Deployed.
- 2026-11-25 — Category cards: the hover panel (`.more-info`) was empty — now lists brand, up to 5 specs read from the name's brackets with
  labels (screen / processor / memory / storage / graphics / OS / socket, `specRows()` in `web/src/components/ProductCard.tsx`, HY/RU/EN) and
  the code, like the template. Real per-product specs come with plan step 2. Deployed.
- 2026-11-25 — **Storefront step 5 done: product page live** (`web/src/app/[lang]/product/[slug]`, `/product/<slug>-<code>`, `/ru`, `/en`).
  Gallery (thumbs, ‹ ›, swipe, lightbox), brand, name, code, 4 key specs, buy box (֏ price, stock, qty, cart, "order by phone",
  wishlist/compare, phone sticky bar), perks, spec table (from the name + part number + code), description (`web_description`), delivery
  card, up to 10 similar products. Wrong slug with a valid code → permanent redirect to the canonical slug; sold out/unknown →
  `/api/shop/resolve` (category) or 404; old led.am `…/products/category/<name>_<code>.html` → 301 here. Product + BreadcrumbList JSON-LD,
  canonical, hreflang, OG image. No reviews/options/bundles/fake data. 1-click form waits for orders (step 10). Styles: `web/src/styles/product.css`
  (generated from product.html by `import_design.py`). Deployed.
- 2026-11-25 — **Storefront step 2 done: specs and filters.** `backend/src/specs.ts` reads specs from the Access name (CPU, model, socket,
  chipset, screen, resolution, panel, Hz, touch, RAM, storage, capacity, DDR, MHz, form factor, interface, rpm, graphics, OS, PSU W / 80+,
  UPS VA, switch ports / speed / PoE, Wi-Fi, wireless, DPI, cable length, case PSU / window, colour). No AI, no outside service, cached
  in memory. **Add new name patterns / keys there** (labels HY/RU/EN live in `SPECS`, the site has no copy). `/api/shop/products`:
  `?<key>=v1,v2` filters (OR inside a key, AND between), `facets.specs` = keys on ≥ 30 % of the category's products with ≥ 2 values
  (`noFilter` keys like cpu_model only on the product page); cards carry 5 specs (hover panel); product detail carries all specs + group.
  Site: spec filter groups (first 8 values + "More", zero counts disabled), chips, URL keys sorted, filtered = noindex; product page spec
  table grouped (General / Processor / Display / Memory / Graphics / Connectivity / Power / Body), key tiles from specs, unparsed name parts
  in one "Feature" row. Rollback: `/root/led-api-image-before-specs-*.txt`. Deployed.
- 2026-11-25 — **Storefront step 6 done: search, store re-check, account favourites.**
  Search (`backend/src/search.ts`, in memory, no DB extension): every word must match the name, brand or the product's category
  names in RU/HY/EN (so "նոութբուք"/"laptop" work), synonyms (`SYN`: мышка/mouse/մկնիկ…), typo correction to the nearest index or
  synonym word (lenvo → lenovo, monitr → monitor; returned as `fix`), Access code search, relevance sort. `/api/shop/products?q=` uses it
  (+ `facets.cats`), `/api/shop/suggest?q=` feeds the header dropdown. Site: `/search?q=` page (Next.js, category chips, filters, sort,
  pages, noindex; old led.am `/search?term=` → here), header `SearchBox` (live dropdown, recent searches `led-recent`, ↑/↓/Enter/Esc).
  Static templates' header search now also uses `/api/shop/suggest` + `/search` (static `/search.html` no longer linked).
  `StoreSync` (every Next.js page, once): cart / favourites / compare re-checked via `/api/shop/products/by-ids` — price, name, photo,
  URL updated; sold-out/hidden removed with a message; template demo items dropped. Favourites of logged-in customers sync both ways
  with `/api/shop/me/wishlist` (GET, POST {add, remove}; table `customer_wishlist`, migration `Wishlist1764800000000`, 386 old led.am
  favourites of 127 customers copied in; admin "view as customer" can't change it). Static cart/favourites pages don't re-check by
  themselves yet (step 7 moves them to Next.js). DB backup `/root/led-db-backup-20261125-1413-pre-wishlist.dump`, static
  `led-static-backup-20261125b.tgz`, API rollback id `/root/led-api-image-before-search-*.txt`. Deployed + published.
- 2026-11-25 — Product page fix: the sticky buy bar is rendered into `<body>` (portal) — inside the sticky buy box its z-index
  only counted within that box and the similar-products cards were painted over it; call button moves above the bar.
- 2026-11-25 — **Step 7 started: cart, favourites, compare live in Next.js** (`/cart`, `/favorites`, `/compare`, + `/ru`, `/en`;
  `web/src/components/shop/ShopPages.tsx`, styles `web/src/styles/shop.css` + `sp-*` icons imported from cart.html by
  `import_design.py`). Live store with undo on remove; compare rows = real specs (`/api/shop/products/by-ids?full=1`), grouped,
  cheapest marked. No demo numbers: delivery shown without a price (open client question 2 in PROJECT_PLAN), no promo code,
  no instalment maths; checkout still opens static `/checkout.html` (moves with orders, step 10), "order by phone" dials the store.
  All links go to the new pages: Next.js components and the static templates (`shop_shared.html`: `S.URL` getters + `NX()`
  link fixer adds /ru|/en from `led-lang`); template demo cart seed removed. nginx: `/cart.html`, `/favorites.html`,
  `/compare.html`, `/search.html` → 301 to the new page (`?lang=ru|en` → prefix); old led.am `/products/cart|compare` → new pages.
  Backups: nginx `/root/led.creativeweb.am.conf.bak-20261125-*`, static `led-static-backup-20261125c.tgz`. Deployed + published.
- 2026-11-25 — **Step 7: home page live in Next.js** (`web/src/app/[lang]/page.tsx`, `/`, `/ru`, `/en`). Template layout and look;
  CSS `web/src/styles/home.css` = only the index.html rules that site.css lacks (rule-by-rule diff in `import_design.py`);
  decorations (gaming art, configurator chain, quick-link icons) + 12 brand logos generated into `web/src/components/home/art.ts`.
  Real data only: slider = one in-stock product with a photo per section (6 s autoplay, pause, arrows, swipe, tilt); quick links =
  gaming PCs (`/computers/gaming`), network equipment (top 3 brands), New; stats = in-stock products / brands / categories;
  "Best offers" tabs = New + each section; brands = most products in stock (logo or text tile) → `/search?q=<brand>`.
  Removed demo parts: discounts, old prices, monthly payments, "top builds", instalment calculator, "10 000+ products".
  Configurator links still go to static `/assembly.html`. Old `/?lang=ru|en` → 301 `/ru|/en` (proxy.ts); nginx `/` → Next.js,
  `/index.html` → `/`. Static templates link home with the language prefix (`NX()` in shop_shared.html). Backups: nginx
  `/root/led.creativeweb.am.conf.bak-20261125-*`, static `led-static-backup-20261125d.tgz`. Deployed + published.
- 2026-11-25 — **Step 7: account pages live in Next.js**: `/login`, `/registration`, `/forgot-password`, `/account` (+ `/ru`, `/en`).
  Reusable info-page frame `web/src/components/info/InfoPage.tsx` (breadcrumb, side menu, call box, hero) — the info pages
  (about, delivery…) move into it next. Template content blocks (`Design/site-src/*_content*.html`) are imported by
  `import_design.py` into `web/src/content/info.json` (+ `styles/info.css`); **edit the content in site-src and rerun the
  importer**. `web/src/lib/pages.ts` = which pages moved (NEXT map) + link fixing. Forms: `InfoForms.tsx` (template validation,
  `/api/shop` login / register / 3-step reset); account = `Account.tsx` (React port: overview, orders, profile, addresses,
  password, log out everywhere, admin "view as customer" banner); `lib/auth.ts` (API, error texts, `led-user` cache);
  `PhoneMask.tsx` on every page. Header account link → `/account` or `/login`. Static templates link to the new pages
  (`NX_HTML` in shop_shared.html, auth.html header link); nginx 301 `login|registration|forgot-password|account.html`; old
  led.am `/users/login|registration|forgot|profile` → new pages. Checked live: wrong login shows the API error. Backups:
  nginx `/root/led.creativeweb.am.conf.bak-20261125-*`, static `led-static-backup-20261125e.tgz`. Deployed + published.
- 2026-11-25 — Home instalment card: template look restored — text full width of the card, grey facts box (15 min / in store / up to 36 months, no prices) under the button, as in the template's narrow layout. Deployed.
- 2026-11-25 — **Step 7: info pages live in Next.js**: `/credit`, `/about`, `/how-to-buy`, `/how-to-order`, `/how-to-pay`, `/delivery`, `/warranty`, `/exchange`, `/contacts` (+ `/ru`, `/en`, indexable), same InfoPage frame + content/info.json. Top bar, footer, home and the static templates (`P` in info_shared.html, `NX_HTML`) link to them; nginx 301 their `.html`; old led.am help/about/contacts/credit_sale → new pages. Contacts form opens the visitor's mail app (led@led.am / service@led.am) — no server inbox yet. Track order stays static until orders (step 10). Home instalment block back to the template: full width, price of a real in-stock product, term slider 3–36, monthly = template formula (1.2 %/month, to confirm with the client). Backups `led-static-backup-20261125f.tgz`, nginx `.bak-20261125-info`. Deployed + published.
- 2026-11-25 — Home "Top ready builds" panel back (template look: tabs Office / Gaming / Ultra auto-rotating, animated PC, 4 spec chips) but **from real in-stock parts** (`web/src/lib/builds.ts`: LGA1700 CPU + board with matching DDR + RAM + M.2 SSD + cooler + PSU + case + GPU, picked by name rules; tier hidden if a part is missing). Price = sum of real prices, "Parts (8)" list links each product, cart adds all parts. No FPS bars / old prices / "#1 seller" (no data). `.tb` CSS now imported into home.css. Deployed.
- 2026-11-25 — **Step 7: brand pages live in Next.js**: `/brands` (all brands with in-stock products, A–Z letters + find box, logo or word mark, counts) and `/brand/<slug>` (hero: logo, name, in-stock count, categories, country/founded for known makers from `web/src/lib/brands.ts`; category chips, filters, sort, cards, other brands; unknown slug → 404; filtered = noindex). Dropped template claims "official partner", warranty months, service-centre line. API: `facets.cats` now also for `?brand=`. Home brand tiles, product page brand chip and the static search dropdown link to the brand page; nginx `/brand.html?b=x` → 301 `/brand/x`. Backups `led-static-backup-20261125g.tgz`, nginx `.bak-20261125-brand`. Deployed + published.
- 2026-11-25 — Product page: "add to cart" label on one line (Armenian label wrapped). **Step 7: configurator live in Next.js** (`/assembly`, + `/ru`, `/en`): template look (`styles/assembly.css` generated from `site-src/assembly_page.html`), 16 rows filled with **real in-stock products** of their site categories (`web/src/lib/assembly.ts`), checks: CPU socket ↔ board, DDR type ↔ board, PSU watts vs recommended (rule-of-thumb power estimate by CPU/GPU class). Saved in `led-asm` as `{row:{code,q}}`; home "Top builds" → Configure preloads that build. Cart adds every part with qty. Dropped: demo parts, "cash price −3 %". API `MAX_LIMIT` 60 → 100. nginx `assembly.html` → 301; old led.am `/assembly` → `/assembly`. Backups `led-static-backup-20261125h.tgz`, nginx `.bak-20261125-asm`. Deployed + published.
- 2026-11-25 — **Step 8 started: product web fields in the admin** (product card → "Данные сайта", `admin/src/product-web.tsx`, `PATCH /api/admin/products/:id/web` in `backend/src/product-web.ts`): show on site, URL slug, old price ֏ (crossed out + −% badge on cards and the product page, only when above the current price), description / SEO title / SEO description in HY·RU·EN (site falls back hy → ru → en), spec corrections over the name parser (value replaces, "hide" removes; applied in filters, cards, product page, compare — `backend/src/spec-edits.ts`). Access data untouched; every save in change_log (`product_web`) + storefront refresh. Migration `ProductWeb1764900000000` (`products.web`, `old_price`, `spec_edit`). Tested on the server via the admin API on product 17714 (old price, RU text, EN title shown in /api/shop; bad slug 400; no token 401), then restored — 2 test rows by `step8-test@claude` in the journal. DB backup `/root/led-db-backup-20261125-1643-pre-product-web.dump`. Deployed.
- 2026-11-25 — Product page: photo lightbox rendered into `<body>` (opened under the sticky header / buy box), page scroll locked while open. **Step 8 part 2: home page settings** — admin "Главная страница" (`/admin/home`, `admin/src/home-blocks.tsx`; `backend/src/site-blocks.ts`, table `site_blocks`, migration `SiteBlocks1765000000000`): slider automatic or hand-picked in-stock products by Access code (+ label HY/RU/EN), quick-link cards automatic or up to 3 own (colour, title/subtitle HY/RU/EN, link — only `/`, `https://`, `#`), "Best offers" tabs and order, show/hide 10 home blocks. Public `GET /api/shop/blocks/home`; saves logged (`site_block`) and refresh the site at once (fetch tag `blocks`). Tested live via the admin API (manual slides, own card, hidden blocks, bad link 400), then restored to automatic. DB backup `/root/led-db-backup-20261125-1651-pre-site-blocks.dump`. Deployed.
- 2026-11-25 — **Step 8 part 3: per-category filters** — admin "Категории сайта" → category form → "Фильтры на странице категории" (`admin/src/category-filters.tsx`): Automatic (storefront rule: spec on ≥ 30 % of in-stock products, ≥ 2 values; the form lists what it shows now) or Own list (ticked spec keys in ↑↓ order, shown whenever they have a value, `noFilter` keys like CPU model allowed). Subcategories without their own list use the nearest parent's. Brand + price always shown. `site_categories.filter_keys text[]` (migration `CategoryFilters1765100000000`), `GET /api/admin/site-categories/:id/filter-keys` (spec counts per category); storefront `specFacets(…, keys)`. Change shows on the site within ~60 s (API category-tree cache). Tested live on "Ноутбуки" (own list ram/screen/cpu_model → section + "Для дома" show exactly those; unknown key dropped), restored to automatic. Note: automatic shows only "Цвет" on the whole Ноутбуки section (bags/chargers dilute the 30 % rule) — a good first candidate for an own list. DB backup `/root/led-db-backup-20261125-1658-pre-category-filters.dump`. Deployed.
- 2026-11-25 — **Step 8 part 4 (step 8 done): info page texts in the admin** — "Страницы сайта" (`/admin/pages`, `admin/src/info-pages.tsx`): 9 pages (instalments, about, how to buy/order/pay, delivery, warranty, exchange, contacts) × HY/RU/EN: browser title, heading, lead, body HTML; starts from the template text (`GET /info-defaults.json`, web route), only changed fields saved (`site_blocks` key `info`), "as template" resets a field, sandboxed preview. Server cleans HTML by whitelist (`backend/src/html-clean.ts`: formatting tags only, no scripts / on* / javascript: links / forms; iframes only Google Maps); the contact form stays as `[[form]]`. Site: `InfoPage` merges edits over the template (`block()` now async). Tested live (RU about heading/text shown, script/onclick/javascript: link and a non-Google iframe removed, contact form kept, HY untouched), then restored. No DB change. Deployed.
- 2026-11-25 — **Step 9 done (SEO + move from led.am), test site still closed to search engines.** `/sitemap.xml` (Next route, data `GET /api/shop/sitemap`): home, catalog, brands, configurator, info pages, every visible category with in-stock products, every brand and in-stock product × hy/ru/en with hreflang alternates + x-default (3 984 URLs now). `/robots.txt` (Next route, nginx routes both to Next): `SITE_INDEX`≠1 → `Disallow: /` (now); `SITE_INDEX=1` → allow shop, disallow api/admin/search/cart/account/login…/`?sort=`, + Sitemap line. **Go-live switch (step 11): set `SITE_INDEX=1` for the web service, remove nginx `X-Robots-Tag`, delete the static `/var/www/led.creativeweb.am/robots.txt`.** Audit (all page types × 3 languages): canonical, hreflang, title, description, one H1, JSON-LD (ComputerStore / BreadcrumbList+ItemList / Product+Offer) OK; fixed `/catalog` (no H1/description, was nofollow) and `/assembly` (no description). 404s: status 404 + noindex, localized page in the browser (raw HTML is Next's client shell — fine for 404); layout now falls back to hy instead of notFound(). Old led.am test on the live stand: all 353 old category URLs (/am) + 40 ru/en + 40 in-stock and 40 sold-out product URLs + info/user/cart pages → one 301 to a 200 page, no chains. Caching: static 7–30 d, product photos immutable 30 d, API 60 s, pages br/gzip, home TTFB ~0.6 s. Backup nginx `.bak-20261125-seo`. Deployed.
- 2026-11-25 — "Best offers" on home: title on one line, tabs on their own row, one line each, sideways scroll (also on phones). Deployed.
- 2026-11-25 — **Step 10 done: real orders.** `backend/src/orders.ts`: `POST /api/shop/orders` (checkout / 1-click; guests allowed,
  linked to the customer when logged in, not when an admin "views as"; every line re-priced and stock-checked from the DB, in-stock only,
  sold out → 400 `gone`; 10 orders/hour per IP), `GET /api/shop/orders/track?n=&phone=` (phone must match; no name/address returned),
  `/api/admin/orders` (list with status counts and search, card, status change with note, staff note; `change_log` entity `order`).
  Orders live in `customer_orders` (`source='site'`, number `LED-105001…` from a sequence, statuses new → confirmed → shipped → done |
  cancelled, history in `customer_order_events`); migration `SiteOrders1765200000000` (customer_id now nullable). Staff alert e-mail to
  `ORDER_NOTIFY_EMAIL` (comma list, **not set**, needs SMTP too); customer gets a confirmation e-mail if they gave one. Admin **"Заказы"**
  (`/admin/orders`, auto-refresh 60 s). Site: `/checkout` (template look, prefill from the account, saved addresses, courier day/slot,
  company + TIN, cash / card on receipt / instalments / bank for companies), 1-click modal (product page button, cart button; mounted in the
  layout, `openOneClick()`), `/track-order` (number + phone, `led-my-orders` keeps the visitor's last 10), account lists site orders with a
  tracking link. Not shown (open client questions / no gateway): delivery fees ("the manager confirms"), instalment maths, online payment,
  promo code. CSS `web/src/styles/orders.css` (copied once from track_content/oneclick templates). nginx: `checkout.html`, `track-order.html`
  → 301. Tested live (checkout + 1-click created, sold-out / bad phone / missing address refused, tracking with wrong phone 404, admin status
  change shows in tracking, no token 401), test orders deleted (numbers 105001–2 used). DB backup `/root/led-db-backup-20261125-1929-pre-orders.dump`,
  nginx `.bak-20261125-1929-orders`, static `led-static-backup-20261125i.tgz`. Deployed + published.
- 2026-11-25 — **Full test of the test site before go-live** (step 11 itself postponed by the owner): all 3 984 sitemap URLs 200 with title,
  one H1, own canonical, no error pages (median 0.36 s, max 1.07 s); 163 other internal links/images OK (only Cloudflare's
  `/cdn-cgi/l/email-protection`, handled by Cloudflare). Real Chrome: 29 page types × HY/RU/EN × desktop 1366 / phone 390 — no JS errors,
  no failed requests, no broken images, no sideways overflow. Flows: add to cart → cart → checkout (errors, terms) → order → tracking
  (wrong phone = not found) → 1-click from the product page → search dropdown. Fix: phone mask no longer blocks the order forms' own
  check (`data-own-check`), so an empty checkout marks every missing field. Test orders LED-105003…105005 deleted. Deployed.
- 2026-11-25 — Admin "Страницы сайта": **block constructor** instead of raw HTML (`admin/src/page-builder.tsx`). The body is still stored as
  HTML (same `site_blocks` 'info', same server cleaning, no site change); the admin parses it into the site's blocks — numbers row,
  card (icon + heading + paragraphs / subheadings / checklist (✓ or ✗) / steps / icon tiles / icon items / table / labels), two cards
  side by side, note (yellow / blue) — and writes the same markup back (round-trip checked: all 9 pages × 3 languages identical).
  Visual text editor (bold, italic, link), icon picker from the site sprite, ↑↓ / duplicate / delete, "+ add block", copy blocks from
  another language, preview with the site's real CSS and icons. Unknown parts (contacts cards, map, contact form) stay fixed blocks;
  "HTML (для специалиста)" mode kept. Admin orders status tabs: text colour fixed. Deployed.
- 2026-11-25 — `/sitemap.xml` in the plain format: each URL = `<url><loc>…</loc><lastmod>2026-11-25T15:21:03+00:00</lastmod></url>` on its own lines (products: their update time; other pages: newest product update). hreflang alternates removed from the sitemap (they stay in every page head). 3 984 URLs. Deployed.
- 2026-11-25 — Contacts page: WhatsApp / Viber pills now have their icons and brand colours (green / purple, lift on hover). Deployed.
- 2026-11-25 — Admin "Заказы": tab "Старые заказы led.am" (`?src=legacy`) lists the 2 457 imported old orders (number `led.am #<id>`, statuses Получен / В обработке / Выполнен, search, card with items); read-only — PATCH refuses them. Deployed.
- 2026-11-26 — Home slider: the front product photo opens the product reliably (click handled on `.sl-stage`: the 3D tilt moved the card between press and release, so clicks after moving the mouse were lost). Deployed.
- 2026-11-26 — Home slider: side photos also open their product (before: brought it to the front). Deployed.
