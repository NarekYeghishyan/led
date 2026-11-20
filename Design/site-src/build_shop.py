import re, pathlib, sys
site = pathlib.Path(r"d:/Projects/744.Led-Computers/Design/site")
src = (site / "category.html").read_text(encoding="utf-8")
shared = (pathlib.Path(__file__).parent / "shop_shared.html").read_text(encoding="utf-8")
pages_js = (pathlib.Path(__file__).parent / "shop_pages.html").read_text(encoding="utf-8")

head, rest = src.split('<main class="wrap catpage">', 1)
main, tail = rest.split('</main>', 1)
stubs = main[main.index('<div hidden id="stubs">'):]
# drop category-only scripts (tree, view/sort)
tail = re.sub(r"<script>\s*\(function\(\)\{\s*const G=.*?</script>", "", tail, count=1, flags=re.S)
tail = re.sub(r"<script>\s*\(function\(\)\{\s*const vb=.*?</script>", "", tail, count=1, flags=re.S)
tail = re.sub(r"<!--dual-range-->.*?<!--/dual-range-->", "", tail, flags=re.S)
assert "getElementById('tree')" not in tail and "cgrid3" not in tail

TITLES = {"cart": "Զամբյուղ — LED Computers", "favorites": "Ընտրյալներ — LED Computers", "compare": "Համեմատել — LED Computers", "checkout": "Պատվերի ձևակերպում — LED Computers"}
for page, title in TITLES.items():
    h = head.replace("<title>LED.AM Category Page</title>", f"<title>{title}</title>")
    html = (h + f'<main class="wrap shop" id="shop" data-page="{page}"><div id="spRoot"></div>\n' + stubs
            + "</main>" + tail.replace("</body>", shared + pages_js + "</body>"))
    (site / f"{page}.html").write_text(html, encoding="utf-8")
    print(page, len(html))

# shared store/header snippet into existing pages (idempotent)
for name in ["index.html", "category.html", "product.html"]:
    p = site / name
    t = p.read_text(encoding="utf-8")
    t = re.sub(r"<!--shop-shared-->.*?<!--/shop-shared-->", "", t, flags=re.S)
    t = t.replace("</body>", shared + "</body>", 1)
    p.write_text(t, encoding="utf-8")
    print("patched", name)

# PC configurator page (assembly.html) + configurator links on every page
asm = (pathlib.Path(__file__).parent / "assembly_page.html").read_text(encoding="utf-8")
link = (pathlib.Path(__file__).parent / "asm_link.html").read_text(encoding="utf-8")
mask = (pathlib.Path(__file__).parent / "phone_mask.html").read_text(encoding="utf-8")
fx = (pathlib.Path(__file__).parent / "btn_fx.html").read_text(encoding="utf-8")
cfx = (pathlib.Path(__file__).parent / "card_fx.html").read_text(encoding="utf-8")
resp = (pathlib.Path(__file__).parent / "responsive.html").read_text(encoding="utf-8")
oc = (pathlib.Path(__file__).parent / "oneclick.html").read_text(encoding="utf-8")
h = head.replace("<title>LED.AM Category Page</title>", "<title>Собери свою конфигурацию — LED Computers</title>")
html = (h + '<main class="wrap asm" id="shop" data-page="assembly"><div id="spRoot"></div>\n' + stubs
        + "</main>" + tail.replace("</body>", shared + asm + "</body>"))
(site / "assembly.html").write_text(html, encoding="utf-8")
print("assembly", len(html))

# info pages (top bar: Ապառիկ · Մեր մասին · Օգնություն ▾ · Կոնտակտներ), content in info_content.html
INFO = {"credit": "credit", "about": "about", "buy": "how-to-buy", "order": "how-to-order", "pay": "how-to-pay",
        "delivery": "delivery", "warranty": "warranty", "exchange": "exchange", "contacts": "contacts", "register": "registration", "login": "login", "account": "account", "forgot": "forgot-password"}
icontent = "".join((pathlib.Path(__file__).parent / f).read_text(encoding="utf-8") for f in ("info_content.html", "info_content_i18n.html", "register_content.html", "login_content.html", "account_content.html", "forgot_content.html"))
blocks = {}
for m in re.finditer(r"<!--@(\w+)(?:\.(ru|en))?\|([^|]*)\|([^|]*)\|([^|]*)\|(.*?)-->(.*?)(?=<!--@|\Z)", icontent, flags=re.S):
    key, lg, title, icon, h1, lead, body = m.groups()
    blocks.setdefault(key, {})[lg or "hy"] = (title, icon, h1, lead, body.strip())
for key, langs in blocks.items():
    assert set(langs) == {"hy", "ru", "en"}, (key, langs.keys())
    h = head.replace("<title>LED.AM Category Page</title>", f"<title>{langs['ru'][0]} — LED Computers</title>")
    parts = "".join(
        f'<div class="ipl" data-l="{lg}" data-title="{ti} — LED Computers">'
        f'<div class="ip-hero"><span class="ic"><svg class="i"><use href="{ic}"/></svg></span><div><h1>{h1}</h1><p>{le}</p></div></div>{bo}</div>'
        for lg, (ti, ic, h1, le, bo) in langs.items())
    page = (f'<main class="wrap info" id="shop" data-page="{key}"><nav class="crumbs" id="ipCrumb"></nav>'
            f'<div class="ip"><aside class="ip-nav" id="ipNav"></aside><div class="ip-main">{parts}</div></div>\n' + stubs + "</main>")
    html = h + page + tail.replace("</body>", shared + "</body>")
    (site / f"{INFO[key]}.html").write_text(html, encoding="utf-8")
    print("info", INFO[key], len(html))
info_js = (pathlib.Path(__file__).parent / "info_shared.html").read_text(encoding="utf-8")
for name in ["index.html", "category.html", "product.html", "cart.html", "favorites.html", "compare.html", "checkout.html", "assembly.html"] + [f"{v}.html" for v in INFO.values()]:
    p = site / name
    t = p.read_text(encoding="utf-8").replace("https://www.led.am/ru/assembly.html", "/assembly.html")
    t = re.sub(r"<!--asm-link-->.*?<!--/asm-link-->", "", t, flags=re.S)
    t = re.sub(r"<!--phone-mask-->.*?<!--/phone-mask-->", "", t, flags=re.S)
    t = re.sub(r"<!--btn-fx-->.*?<!--/btn-fx-->", "", t, flags=re.S)
    t = re.sub(r"<!--card-fx-->.*?<!--/card-fx-->", "", t, flags=re.S)
    t = re.sub(r"<!--responsive-->.*?<!--/responsive-->", "", t, flags=re.S)
    t = re.sub(r"<!--one-click-->.*?<!--/one-click-->", "", t, flags=re.S)
    t = re.sub(r"<!--info-shared-->.*?<!--/info-shared-->", "", t, flags=re.S)
    t = t.replace("</body>", link + mask + fx + cfx + info_js + oc + resp + "</body>", 1)
    p.write_text(t, encoding="utf-8")
    print("linked", name)
