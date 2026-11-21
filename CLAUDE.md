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
- Customer data (old led.am users, orders) is personal data: dumps (`*.sql`) never go to git or a web folder; on the server only
  `/root`, chmod 600. Back up the DB (`pg_dump`) before every customer import. Site accounts/orders must use the `customers`
  tables and `/api/shop/login` (see docs/PROJECT_PLAN.md "Customers"), never a new user table; customer tokens must never open `/api/admin`.

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
- 2026-11-22 — Admin "Products" menu item and the product card's back link open `/products?stock=in` (in-stock filter by default). Deployed.
