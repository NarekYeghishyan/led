"""Default product images ("no photo yet") in the site's style, one per catalog section + a generic one.

Run:  python Design/site-src/make_placeholders.py
Out:  Design/site/img/placeholder/<section>.svg  (computers, laptops, components, peripherals, accessories,
      network-equipment, default). The storefront shows them when a product has no photo
      (`image: null` from /api/shop/products; `section` = the card's catalog section slug).
No words in the picture, so it fits HY/RU/EN. Icons = the site sprite (index.html), colours = site tokens.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "img" / "placeholder"

# section slug -> inner SVG of the 24x24 icon (same drawings as the site sprite / admin "Site categories" icons)
ICONS = {
    "computers": '<rect x="7" y="2" width="10" height="20" rx="1.5"/><circle cx="12" cy="15" r="2.5"/><path d="M10 6h4M10 9h4"/>',
    "laptops": '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    "components": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/>'
                  '<path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    "peripherals": '<rect x="2" y="3" width="20" height="13" rx="2"/><path d="M9 21h6M12 16v5"/>',
    "accessories": '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/>'
                   '<rect x="16" y="14" width="5" height="7" rx="2"/>',
    "network-equipment": '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>',
    "default": '<path d="M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8"/>',
}

BLUE, BLUE_700, BLUE_50, LINE, BG = "#1468DC", "#1150B5", "#EAF2FE", "#E3E9F1", "#F3F7FA"


def svg(icon: str) -> str:
    # 800x800: soft blue background + dot grid, glow, white tile with the section icon, LED "status lights", wordmark
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="LED Computers">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FAFCFF"/><stop offset="1" stop-color="{BLUE_50}"/></linearGradient>
  <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#C9DBF5"/></pattern>
  <radialGradient id="fade" cx=".5" cy=".46" r=".55"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".55" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="{BLUE}" stop-opacity=".22"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0"/></radialGradient>
  <linearGradient id="ic" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22"><stop offset="0" stop-color="#2F7FEA"/><stop offset="1" stop-color="{BLUE_700}"/></linearGradient>
  <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#1468DC" flood-opacity=".16"/></filter>
  <filter id="led" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
<rect width="800" height="800" fill="url(#dots)" opacity=".55"/>
<rect width="800" height="800" fill="url(#fade)"/>
<circle cx="400" cy="368" r="250" fill="url(#glow)"/>
<g opacity=".5" fill="none" stroke="#BFD4F2" stroke-width="2">
  <circle cx="400" cy="368" r="212" stroke-dasharray="2 14" stroke-linecap="round"/>
  <path d="M150 640h120M530 640h120" stroke-linecap="round"/>
</g>
<rect x="250" y="218" width="300" height="300" rx="56" fill="#fff" stroke="{LINE}" stroke-width="2" filter="url(#sh)"/>
<g transform="translate(280 248) scale(10)" fill="none" stroke="url(#ic)" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">{icon}</g>
<g transform="translate(400 590)">
  <circle cx="-36" r="9" fill="{BLUE}" filter="url(#led)" opacity=".7"/><circle cx="-36" r="6" fill="{BLUE}"/>
  <circle cx="0" r="9" fill="#2F7FEA" filter="url(#led)" opacity=".55"/><circle cx="0" r="6" fill="#2F7FEA" opacity=".75"/>
  <circle cx="36" r="9" fill="#6AA8F7" filter="url(#led)" opacity=".45"/><circle cx="36" r="6" fill="#6AA8F7" opacity=".55"/>
</g>
<text x="400" y="700" text-anchor="middle" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="9" fill="#9DB0CC">LED COMPUTERS</text>
</svg>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, icon in ICONS.items():
        (OUT / f"{slug}.svg").write_text(svg(icon), encoding="utf-8")
    print(f"{len(ICONS)} placeholders -> {OUT}")


if __name__ == "__main__":
    main()
