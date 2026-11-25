/**
 * Brands: the list = brands of in-stock products (GET /api/shop/products facets.brands; brand is read from the product
 * name on the server). URL slug = lower-case name, non-letters → "-" (TP-Link → tp-link), same as the template's brand.html.
 * Country / founding year: public facts for well-known makers (from the template's BI table); unknown brands show none.
 * Not used from the template: "official partner", per-brand warranty months, service-centre line (not confirmed by the store).
 */
import { getProducts } from './api';

export const brandSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function getBrands() {
  const all = await getProducts({ limit: 1 });
  return all.facets.brands.map((b) => ({ name: b.v, n: b.n, slug: brandSlug(b.v) }));
}

/** [country code, founded] */
export const BRAND_INFO: Record<string, [string, number]> = {
  lenovo: ['cn', 1984], hp: ['us', 1939], asus: ['tw', 1989], dell: ['us', 1984], acer: ['tw', 1976], msi: ['tw', 1986], apple: ['us', 1976],
  samsung: ['kr', 1938], lg: ['kr', 1958], logitech: ['ch', 1981], kingston: ['us', 1987], amd: ['us', 1969], intel: ['us', 1968],
  nvidia: ['us', 1993], 'tp-link': ['cn', 1996], mikrotik: ['lv', 1996], xiaomi: ['cn', 2010], hyperx: ['us', 2002], ugreen: ['cn', 2012],
  gigabyte: ['tw', 1986], crucial: ['us', 1996], patriot: ['us', 1985], sandisk: ['us', 1988], xerox: ['us', 1906], canon: ['jp', 1937],
  epson: ['jp', 1942], zalman: ['kr', 1999], thermaltake: ['tw', 1999], deepcool: ['cn', 1996], 'be-quiet': ['de', 2002], orico: ['cn', 2009],
};
export const COUNTRY: Record<string, [string, string, string]> = {
  cn: ['Չինաստան', 'Китай', 'China'], us: ['ԱՄՆ', 'США', 'USA'], tw: ['Թայվան', 'Тайвань', 'Taiwan'], kr: ['Հարավային Կորեա', 'Южная Корея', 'South Korea'],
  ch: ['Շվեյցարիա', 'Швейцария', 'Switzerland'], lv: ['Լատվիա', 'Латвия', 'Latvia'], jp: ['Ճապոնիա', 'Япония', 'Japan'], de: ['Գերմանիա', 'Германия', 'Germany'],
};
