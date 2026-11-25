/**
 * "Top ready builds" on the home page, made from REAL in-stock parts (the store has no ready builds): for each tier a
 * compatible set — LGA1700 CPU + board with the matching memory type + RAM + M.2 SSD + cooler + PSU + case (+ graphics card).
 * Price = sum of the parts' real prices. A tier is left out when a required part is not in stock. Rules are by name;
 * adjust the regexes here when the stock changes.
 */
import { getProducts, type ProductCard } from './api';

type Pick = 'cheap' | 'expensive';
interface Rule { cat: string; q?: Record<string, string>; ok: (n: string, p: ProductCard) => boolean; pick?: Pick; optional?: boolean }
export interface BuildPart { role: string; code: number; name: string; slug: string; price: number; image: string | null; section?: string | null }
export interface Build { k: 'office' | 'gamer' | 'pro'; parts: BuildPart[]; price: number; spec: string[] }

const C = {
  cpu: 'components/processors/socket-1700', mb: 'components/motherboards/socket-1700', ram: 'components/memory-modules/for-pc',
  ssd: 'components/ssd-drives/m2', gpu: 'components/graphics-cards', psu: 'components/power-supplies/atx', cs: 'components/cases',
  cool: 'components/cooling/universal-cpu-coolers',
};
const ddr = (n: string, p: ProductCard) => (/\bD4\b|DDR4/i.test(n) ? 'DDR4' : /DDR5/i.test(n) ? 'DDR5' : p.specs?.find((s) => s.k === 'mem_type')?.v);
const watts = (n: string) => Number(/(\d{3,4})\s?W\b/.exec(n)?.[1] || 0);
const isCase = (n: string) => /^Корпус/i.test(n) && /w\/o/i.test(n);
const cooler1700 = (n: string) => /Universal socket INTEL|S-?1700/i.test(n);

const TIERS: Record<Build['k'], Record<string, Rule>> = {
  office: {
    cpu: { cat: C.cpu, ok: (n) => /Core i5 1[234]400\b(?!F)/.test(n) },
    mb: { cat: C.mb, ok: (n, p) => ddr(n, p) === 'DDR4' && /B760|H610/.test(n) },
    ram: { cat: C.ram, q: { mem_type: 'DDR4' }, ok: (n) => /\b16GB\b/.test(n) },
    ssd: { cat: C.ssd, ok: (n) => /\b(480|500|512)GB\b/.test(n) },
    cool: { cat: C.cool, ok: (n, p) => cooler1700(n) && p.price >= 4000 },
    psu: { cat: C.psu, ok: (n) => /80\+/.test(n) && watts(n) >= 550 && watts(n) <= 650 },
    case: { cat: C.cs, ok: isCase },
  },
  gamer: {
    cpu: { cat: C.cpu, ok: (n) => /Core i5 14600K/.test(n) },
    mb: { cat: C.mb, ok: (n, p) => ddr(n, p) === 'DDR5' && /B760/.test(n) },
    ram: { cat: C.ram, q: { mem_type: 'DDR5' }, ok: (n) => /\b16GB\b/.test(n) },
    ssd: { cat: C.ssd, ok: (n) => /\b1TB\b/.test(n) },
    gpu: { cat: C.gpu, ok: (n) => /RTX/.test(n) },
    cool: { cat: C.cool, ok: (n, p) => cooler1700(n) && p.price >= 10000 },
    psu: { cat: C.psu, ok: (n) => /Bronze|Gold/i.test(n) && watts(n) >= 750 },
    case: { cat: C.cs, ok: (n) => isCase(n) && /TG|Window|MESH/i.test(n) },
  },
  pro: {
    cpu: { cat: C.cpu, ok: (n) => /Core i[79] 14700K/.test(n) },
    mb: { cat: C.mb, ok: (n, p) => ddr(n, p) === 'DDR5' && /Z790/.test(n) },
    ram: { cat: C.ram, q: { mem_type: 'DDR5' }, ok: (n) => /\b32GB\b/.test(n) },
    ssd: { cat: C.ssd, ok: (n) => /\b1TB\b/.test(n) && /990|SN850|FURY|VP4300/.test(n) },
    gpu: { cat: C.gpu, ok: (n) => /RTX/.test(n), pick: 'expensive' },
    cool: { cat: C.cool, ok: (n, p) => cooler1700(n) && p.price >= 15000 && p.price <= 60000, pick: 'expensive' },
    psu: { cat: C.psu, ok: (n) => /Gold|80\+ G/i.test(n) && watts(n) >= 850 },
    case: { cat: C.cs, ok: (n) => isCase(n) && /MESH/i.test(n), pick: 'expensive' },
  },
};

/** short labels for the 4 spec chips: CPU, graphics, memory, storage */
function specOf(parts: Record<string, BuildPart>): string[] {
  const cpu = /Core (i\d) (\d{4,5}\w*)/.exec(parts.cpu.name);
  const gpu = parts.gpu ? /(RTX ?\d{4}(?: Ti| Super)?)/i.exec(parts.gpu.name)?.[1]?.replace(/RTX ?/, 'RTX ') : null;
  const vram = parts.gpu ? /(\d+)GB/.exec(parts.gpu.name)?.[1] : null;
  const ram = /(\d+)GB (DDR\d)/.exec(parts.ram.name);
  const ssd = /(\d+(?:GB|TB))/.exec(parts.ssd.name)?.[1]?.replace(/(GB|TB)/, ' $1');
  return [cpu ? `Core ${cpu[1]}‑${cpu[2]}` : parts.cpu.name, gpu ? `${gpu}${vram ? ` ${vram} GB` : ''}` : 'Intel UHD', ram ? `${ram[1]} GB ${ram[2]}` : '', `${ssd} NVMe`];
}

export async function getBuilds(): Promise<Build[]> {
  const lists = new Map<string, Promise<ProductCard[]>>();
  const list = (cat: string, q?: Record<string, string>) => {
    const key = cat + JSON.stringify(q || {});
    if (!lists.has(key)) lists.set(key, getProducts({ cat, sort: 'cheap', limit: 100, ...q }).then((r) => r.items).catch(() => []));
    return lists.get(key)!;
  };
  const out: Build[] = [];
  for (const k of ['office', 'gamer', 'pro'] as const) {
    const parts: Record<string, BuildPart> = {};
    let missing = false;
    for (const [role, r] of Object.entries(TIERS[k])) {
      const hits = (await list(r.cat, r.q)).filter((p) => r.ok(p.name, p));
      const p = r.pick === 'expensive' ? hits[hits.length - 1] : hits[0];
      if (!p) { if (!r.optional) missing = true; continue; }
      parts[role] = { role, code: p.code, name: p.name, slug: p.slug, price: p.price, image: p.image, section: p.section };
    }
    if (missing) continue;
    const arr = Object.values(parts);
    out.push({ k, parts: arr, price: arr.reduce((s, p) => s + p.price, 0), spec: specOf(parts) });
  }
  return out;
}
