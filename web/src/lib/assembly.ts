/**
 * PC configurator data (/assembly): for each row the in-stock products of its site category (GET /api/shop/products),
 * with what the compatibility checks need, read from the product's specs / name:
 *   s = CPU / board socket (LGA1700, AM5…), m = memory type of board / RAM (DDR4 / DDR5), p = PSU watts,
 *   w = estimated power draw (CPU / GPU by model class, a few watts for the rest) → recommended PSU = Σw × 1.4 + 50.
 * The estimate is a rule of thumb, shown as "recommended", never as a product spec.
 */
import { getProducts, type ProductCard } from './api';

export type RowKey = 'mb' | 'cpu' | 'cool' | 'ram' | 'ssd' | 'hdd' | 'gpu' | 'odd' | 'case' | 'psu' | 'mon' | 'kb' | 'mouse' | 'head' | 'cam' | 'ups';
export interface Part { code: number; name: string; slug: string; price: number; image: string | null; section: string | null; s?: string; m?: string; p?: number; w?: number }

const ROWS: Record<RowKey, { cat: string; ok?: (n: string) => boolean }> = {
  mb: { cat: 'components/motherboards' }, cpu: { cat: 'components/processors' },
  cool: { cat: 'components/cooling/universal-cpu-coolers' }, ram: { cat: 'components/memory-modules/for-pc', ok: (n) => /DDR[345]/.test(n) },
  ssd: { cat: 'components/ssd-drives' }, hdd: { cat: 'components/hard-drives/pc-sata-35' },
  gpu: { cat: 'components/graphics-cards' }, odd: { cat: 'components/optical-drives/for-pc' },
  case: { cat: 'components/cases', ok: (n) => /^Корпус/i.test(n) }, psu: { cat: 'components/power-supplies/atx' },
  mon: { cat: 'peripherals/monitors' }, kb: { cat: 'accessories/keyboards' },
  mouse: { cat: 'accessories/mice', ok: (n) => /Мыш|mouse/i.test(n) }, head: { cat: 'accessories/headphones-and-mics/headphones' },
  cam: { cat: 'accessories/webcams' }, ups: { cat: 'peripherals/ups-and-power', ok: (n) => /ИБП|UPS/i.test(n) },
};

const spec = (p: ProductCard, k: string) => p.specs?.find((s) => s.k === k)?.v;
const socket = (p: ProductCard) => {
  const v = spec(p, 'socket') || /S-?(1700|1851|1200|115\d|AM[345])/i.exec(p.name)?.[1] || '';
  return v.toUpperCase().replace(/^LGA/, '').replace(/^S-?/, '') || undefined;
};
const memType = (p: ProductCard) => (/\bD4\b|DDR4/i.test(p.name) ? 'DDR4' : /DDR5/i.test(p.name) ? 'DDR5' : /DDR3/i.test(p.name) ? 'DDR3' : spec(p, 'mem_type'));
function cpuW(n: string) {
  if (/i9|Ryzen 9/i.test(n)) return 150;
  if (/i7|Ryzen 7/i.test(n)) return /\d{4,5}K/i.test(n) ? 150 : 90;
  if (/i5|Ryzen 5/i.test(n)) return /\d{4,5}K/i.test(n) ? 125 : 65;
  return 60;
}
function gpuW(n: string) {
  const m = /(?:RTX|GTX|RX) ?(\d{3,4})/i.exec(n);
  if (!m) return 40;
  const tier = Number(m[1].slice(-2));
  return tier >= 80 ? 320 : tier >= 70 ? 230 : tier >= 60 ? 160 : 100;
}

function part(k: RowKey, p: ProductCard): Part {
  const x: Part = { code: p.code, name: p.name, slug: p.slug, price: p.price, image: p.image, section: p.section };
  if (k === 'mb') { x.s = socket(p); x.m = memType(p); x.w = 40; }
  if (k === 'cpu') { x.s = socket(p); x.w = cpuW(p.name); }
  if (k === 'ram') { x.m = memType(p); x.w = 6; }
  if (k === 'gpu') x.w = gpuW(p.name);
  if (k === 'ssd' || k === 'hdd' || k === 'odd') x.w = 8;
  if (k === 'cool') x.w = 5;
  if (k === 'psu') x.p = Number(/(\d{3,4})\s?W\b/.exec(p.name)?.[1] || spec(p, 'power_w')?.replace(/\D/g, '') || 0) || undefined;
  return x;
}

export async function getAssembly(): Promise<Record<RowKey, Part[]>> {
  const keys = Object.keys(ROWS) as RowKey[];
  const lists = await Promise.all(keys.map((k) =>
    getProducts({ cat: ROWS[k].cat, sort: 'cheap', limit: 100 }).then((r) => r.items).catch(() => [] as ProductCard[])));
  return Object.fromEntries(keys.map((k, i) => [k, lists[i].filter((p) => !ROWS[k].ok || ROWS[k].ok!(p.name)).map((p) => part(k, p))])) as Record<RowKey, Part[]>;
}
