/**
 * AI product photo finder (admin only). README "AI product photos".
 *
 *  1. identify(): brand, model and codes are read from the product name (the Access brand column is empty).
 *  2. Candidates: Icecat (official photos, free "Open Icecat" brands) first; if it gives too few, AI web search
 *     (OpenAI, two differently worded searches in parallel) / Google CSE / Brave / Gemini guesses; or a pasted URL.
 *  3. Every candidate is downloaded through safeFetch (public http(s) only, size + type checks, no private IPs),
 *     checked with sharp (size, banner shape, logo URL) and de-duplicated by picture (same photo in two sizes).
 *  4. The AI (Gemini or OpenAI, the other one if the first is busy) sees small thumbnails and rates each:
 *     exact-model match, photo quality, kind (product / box / infographic / lifestyle / logo / other).
 *     The server picks the main photo (match + quality + resolution) and marks good extra photos for the gallery.
 *  5. Saving: the photo is cleaned with sharp (white border trimmed, centred on a white square, max 1200 px, WebP)
 *     and stored in MEDIA_DIR, served at /api/media/...
 *
 * Env: AI_PROVIDER, AI_SEARCH, OPENAI_API_KEY, OPENAI_MODEL, GEMINI_API_KEY, GEMINI_MODEL, ICECAT_USER, ICECAT=0,
 *      GOOGLE_CSE_KEY + GOOGLE_CSE_CX, BRAVE_SEARCH_KEY, GEMINI_SEARCH=1 (needs a paid Gemini plan), MEDIA_DIR.
 */
import {
  BadRequestException, Body, Controller, Delete, HttpException, Logger, NotFoundException, Param, ParseIntPipe,
  Post, Put, ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { JwtGuard } from './auth';
import { Product } from './entities';

export const MEDIA_DIR = process.env.MEDIA_DIR || '/data/media';
export const MEDIA_URL = '/api/media';
const UA = 'Mozilla/5.0 (compatible; LedComputersAdmin/1.0; +https://led.am)';
const MAX_IMAGE = 16 * 1024 * 1024; // Icecat originals are 3–6 MB
const MAX_HTML = 3 * 1024 * 1024;
const MIN_SIDE = 300;
const MAX_ASPECT = 2.2; // wider/taller than this = banner, not a product photo
const MAX_CANDIDATES = 16;
const MAX_IMAGES_PER_PRODUCT = 12;
const SAVE_SIDE = 1200;
const ICECAT_ENOUGH = 3; // this many Icecat photos = no web search needed

// ------------------------------------------------------------------ safe fetch (SSRF guard)

function privateIp(ip: string): boolean {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168)
      || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8')
    || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

async function checkUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new BadRequestException('Bad URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BadRequestException('Only http(s) URLs');
  if (u.username || u.password) throw new BadRequestException('URL with credentials');
  if (u.port && u.port !== '80' && u.port !== '443') throw new BadRequestException('Port not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw new BadRequestException(`Host not found: ${host}`);
  if (ips.some(privateIp)) throw new BadRequestException('Private address not allowed');
  return u;
}

interface Fetched { url: string; type: string; body: Buffer }

/** GET a public URL: manual redirects (each hop re-checked), timeout, byte limit. */
async function safeFetch(raw: string, maxBytes: number, accept: string, timeoutMs = 10000): Promise<Fetched> {
  let url = raw;
  for (let hop = 0; hop < 5; hop++) {
    const u = await checkUrl(url);
    const res = await fetch(u, {
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en,ru;q=0.8' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, u).toString();
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    if (Number(res.headers.get('content-length') || 0) > maxBytes) { await res.body?.cancel(); throw new Error('Too large'); }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Too large');
      chunks.push(Buffer.from(chunk));
    }
    return { url: u.toString(), type: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), body: Buffer.concat(chunks) };
  }
  throw new Error('Too many redirects');
}

// ------------------------------------------------------------------ image sniffing (quick check before sharp)

interface ImgInfo { mime: string; ext: string; width: number; height: number }

/** Detects JPEG/PNG/WebP/GIF by magic bytes and reads the size. null = not an image we accept. */
export function sniffImage(b: Buffer): ImgInfo | null {
  if (b.length < 32) return null;
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') {
    return { mime: 'image/png', ext: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.toString('ascii', 0, 3) === 'GIF') return { mime: 'image/gif', ext: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { mime: 'image/webp', ext: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { mime: 'image/webp', ext: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { mime: 'image/webp', ext: 'webp', width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { mime: 'image/jpeg', ext: 'jpg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}

// ------------------------------------------------------------------ image analysis + cleaning (sharp)

const WHITE = { r: 255, g: 255, b: 255 };
const base = (b: Buffer) => sharp(b, { failOn: 'none', limitInputPixels: 80e6 }).rotate().flatten({ background: WHITE });

interface Inspected { width: number; height: number; thumb: Buffer; hash: bigint; whiteBg: boolean }

/** Real size, a 512 px JPEG thumbnail for the AI, a picture hash (dHash) and whether the background is white. */
async function inspect(b: Buffer): Promise<Inspected | null> {
  const meta = await sharp(b, { failOn: 'none' }).metadata().catch(() => null);
  if (!meta?.width || !meta.height || !['jpeg', 'png', 'webp', 'avif', 'gif', 'heif'].includes(meta.format || '')) return null;
  const swap = (meta.orientation || 1) >= 5;
  const width = swap ? meta.height : meta.width, height = swap ? meta.width : meta.height;
  const [thumb, h, border] = await Promise.all([
    base(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
    base(b).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer(),
    base(b).grayscale().resize(32, 32, { fit: 'fill' }).raw().toBuffer(),
  ]);
  let hash = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | (h[y * 9 + x] > h[y * 9 + x + 1] ? 1n : 0n);
  return { width, height, thumb, hash, whiteBg: isWhiteBorder(border, 32) };
}

/** Border pixels of a small grayscale picture are (almost) all white. */
function isWhiteBorder(g: Buffer, n: number): boolean {
  const px: number[] = [];
  for (let i = 0; i < n; i++) px.push(g[i], g[(n - 1) * n + i], g[i * n], g[i * n + n - 1]);
  const light = px.filter((v) => v >= 238).length;
  return light / px.length >= 0.9;
}

const hamming = (a: bigint, b: bigint) => { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };

/**
 * Shop-ready photo: on a white background the empty border is trimmed and the product is centred on a white square
 * (it fills ~90 %); other photos are only resized. Max 1200 px, WebP.
 */
export async function cleanPhoto(b: Buffer): Promise<{ body: Buffer; ext: string }> {
  const flat = await base(b).jpeg({ quality: 95 }).toBuffer();
  const g = await sharp(flat).grayscale().resize(32, 32, { fit: 'fill' }).raw().toBuffer();
  let img = flat;
  if (isWhiteBorder(g, 32)) {
    const t = await sharp(flat).trim({ background: WHITE, threshold: 20 }).jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true }).catch(() => null);
    const src = t && t.info.width >= 40 && t.info.height >= 40 ? t : await sharp(flat).toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = src.info;
    const side = Math.round(Math.max(w, h) / 0.9);
    const top = Math.floor((side - h) / 2), left = Math.floor((side - w) / 2);
    img = await sharp(src.data).extend({ top, bottom: side - h - top, left, right: side - w - left, background: WHITE }).jpeg({ quality: 95 }).toBuffer();
  }
  const body = await sharp(img).resize(SAVE_SIDE, SAVE_SIDE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
  return { body, ext: 'webp' };
}

// ------------------------------------------------------------------ what is this product?

/** Brands seen in the store's product names (whole word, any case). The Access brand column is empty. */
const BRANDS = [
  'ASUS', 'Genius', 'HP', 'Intel', 'CrownMicro', 'Crown', 'Lanberg', 'Samsung', 'Patriot', 'LG', 'AMD', 'Gigabyte', 'Acer',
  'Logitech', 'TP-Link', 'Sony', 'Seagate', 'Lenovo', 'ACME', 'Toshiba', 'Dell', 'Genesis', 'D-Link', 'Kingston', 'Ugreen',
  'Thermaltake', 'MSI', 'Canon', 'WD', 'Western Digital', 'AeroCool', 'Sven', 'Orico', 'DeepCool', 'Targus', 'Creative',
  'Emtec', 'Palit', 'Sapphire', 'Manhattan', 'TwinMOS', 'Lightwave', 'Buro', 'ASRock', 'Digma', 'AOC', 'Philips', 'Zotac',
  'ID-Cooling', 'Marvo', 'Gembird', 'ViewSonic', 'Crucial', 'Belkin', 'NEC', 'A-Data', 'ADATA', 'Natec', 'Cactus', 'Zalman',
  'XYZ', 'Kingmax', 'BenQ', 'Bloody', 'A4Tech', 'Arctic', 'Apacer', 'Intex', 'FSP', 'Oklick', 'Linksys', 'Xerox', 'Hitachi',
  'Golla', 'SanDisk', 'Chieftec', 'Pinnacle', 'Fujitsu', 'Microsoft', 'Verbatim', 'Xilence', 'Intellinet', 'Biostar', 'Epson',
  'CoolMate', 'Team', 'TeamGroup', 'MikroTik', 'Cooler Master', 'CoolerMaster', 'Cougar', 'Wacom', 'Panasonic', 'Pioneer',
  'Canyon', 'PowerColor', 'APC', 'Xiaomi', 'Corsair', 'AFOX', 'Defender', 'Apple', 'Transcend', 'Thermal Master', 'Maxtor',
  'Foxconn', 'GeIL', 'OCZ', 'Kreton', 'Huawei', 'Razer', 'HyperX', 'SteelSeries', 'Redragon', '2E', 'Hikvision', 'Ubiquiti',
  'Tenda', 'Mercusys', 'Netis', 'Keenetic', 'Noctua', 'be quiet!', 'NZXT', 'Lian Li', 'Fractal Design', 'Montech', 'Hama',
  'Baseus', 'Anker', 'Trust', 'Edifier', 'Sennheiser', 'JBL', 'Jabra', 'Brother', 'Kyocera', 'Ricoh', 'Eaton', 'Powercom',
  'Ippon', 'Vention', 'Cudy', 'Ruijie', 'Synology', 'QNAP', 'Dahua', 'Ezviz', 'Huion', 'XP-Pen', 'Elgato', 'AverMedia',
  'Sharkoon', 'Fantech', 'Hoco', 'Remax', 'GameMax', '1stPlayer', 'Thermalright', 'Silicon Power', 'Netac', 'Lexar',
  'Hiksemi', 'Goodram', 'iiyama', 'Hisense', 'ZyXEL', 'Cisco', 'Mercury', 'Elitegroup', 'ECS', 'Gamdias', 'Endorfy',
];
const ICECAT_BRAND: Record<string, string> = { wd: 'Western Digital', 'a-data': 'ADATA', team: 'Team Group', teamgroup: 'Team Group', coolermaster: 'Cooler Master', crownmicro: 'CROWN', crown: 'CROWN' };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BRAND_RE = new RegExp(`(?:^|[^A-Za-z0-9])(${[...BRANDS].sort((a, b) => b.length - a.length).map(esc).join('|')})(?=$|[^A-Za-z0-9])`, 'i');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface Ident {
  name: string; brand: string | null; model: string; code: string | null; codeInName: boolean; gtin: string | null; codes: string[];
}

/** "Мышь беспроводная Logitech M330 Silent Plus (USB, Black)" + barcode → brand Logitech, model "M330 Silent Plus", codes. */
export function identify(p: Pick<Product, 'name' | 'brand' | 'barcode'>): Ident {
  const name = (p.name || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const m = BRAND_RE.exec(name);
  const brand = (p.brand || '').trim() || (m ? BRANDS.find((b) => b.toLowerCase() === m[1].toLowerCase()) || m[1] : null);
  let model = m ? name.slice(m.index + m[0].length) : name.replace(/^(?:[А-Яа-яЁё][А-Яа-яЁё.\-]*\s*)+/, '');
  model = model.replace(/\s+/g, ' ').trim().slice(0, 80);
  const raw = (p.barcode || '').trim();
  const gtin = /^\d{8,14}$/.test(raw) ? raw : null;
  const code = !gtin && raw.length >= 3 ? raw : null;
  const codeInName = !!code && norm(name).includes(norm(code));
  // model-like tokens: letters + digits, e.g. TXE70UH, AD-0036-BK, CT240BX500SSD1
  const tokens = model.split(/[\s,/]+/).filter((t) => t.length >= 4 && /\d/.test(t) && /[a-z]/i.test(t) && !/^\d+(gb|tb|mb|w|mhz|ghz|hz|mm|cm|m)$/i.test(t));
  const codes = [...new Set([code, model.length <= 40 && /\d/.test(model) ? model : null, ...tokens.sort((a, b) => b.length - a.length).slice(0, 2)]
    .filter((c): c is string => !!c))];
  return { name: p.name || '', brand, model, code, codeInName, gtin, codes };
}

function describe(id: Ident): string {
  return `"${id.name}"${id.brand ? `, brand ${id.brand}` : ''}${id.model ? `, model ${id.model}` : ''}`
    + (id.code ? (id.codeInName ? `, part number ${id.code}` : `, store code ${id.code} (maybe the manufacturer part number, maybe the store's own code)`) : '')
    + (id.gtin ? `, EAN ${id.gtin}` : '');
}

function searchQuery(id: Ident): string {
  return [id.brand, id.model || id.name, id.code && !id.codeInName ? id.code : ''].filter(Boolean).join(' ').slice(0, 200);
}

// ------------------------------------------------------------------ candidate sources

interface Candidate { url: string; preview?: string; page?: string; source: string; title?: string }
const LOGO = /logo|icon|favicon|sprite|banner|placeholder|badge|twitter-image|og-image-default/i;

/** Open Icecat: official photos for brands that publish there for free (TP-Link, Gigabyte, ASUS, Lenovo, Lanberg…). */
async function icecat(id: Ident): Promise<Candidate[]> {
  if (process.env.ICECAT === '0') return [];
  const user = process.env.ICECAT_USER || 'openIcecat-live';
  const tries: Record<string, string>[] = [];
  if (id.gtin) tries.push({ GTIN: id.gtin });
  if (id.brand) {
    const brand = ICECAT_BRAND[id.brand.toLowerCase()] || id.brand;
    id.codes.slice(0, 3).forEach((c) => tries.push({ Brand: brand, ProductCode: c }));
  }
  type Gal = { Pic?: string; Pic500x500?: string; IsMain?: string; Type?: string; PicWidth?: string | number; PicHeight?: string | number };
  type Data = { GeneralInfo?: { Title?: string; IcecatId?: number }; Image?: { HighPic?: string; Pic500x500?: string }; Gallery?: Gal[] };
  const got = await Promise.all(tries.slice(0, 4).map(async (q) => {
    const u = new URL('https://live.icecat.biz/api/');
    Object.entries({ UserName: user, Language: 'en', ...q }).forEach(([k, v]) => u.searchParams.set(k, v));
    const res = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } }).catch(() => null);
    if (!res?.ok) return null;
    const j = await res.json().catch(() => null) as { data?: Data } | null;
    return j?.data?.Gallery?.length || j?.data?.Image?.HighPic ? j.data : null;
  }));
  const d = got.find(Boolean);
  if (!d) return [];
  const gal = (d.Gallery || []).filter((g) => g.Pic && (!g.Type || g.Type === 'ProductImage'))
    .sort((a, b) => (b.IsMain === 'Y' ? 1 : 0) - (a.IsMain === 'Y' ? 1 : 0));
  const list: Candidate[] = gal.map((g) => ({ url: g.Pic!, preview: g.Pic500x500 || g.Pic, title: d.GeneralInfo?.Title, source: 'icecat' }));
  if (!list.length && d.Image?.HighPic) list.push({ url: d.Image.HighPic, preview: d.Image.Pic500x500, title: d.GeneralInfo?.Title, source: 'icecat' });
  return list.slice(0, 8);
}

async function googleCse(q: string): Promise<Candidate[]> {
  const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  Object.entries({ key, cx, q, searchType: 'image', num: '10', imgSize: 'large', safe: 'active' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google search: HTTP ${res.status}`);
  const d = await res.json() as { items?: { link: string; title?: string; image?: { contextLink?: string } }[] };
  return (d.items || []).map((i) => ({ url: i.link, page: i.image?.contextLink, title: i.title, source: 'google' }));
}

async function brave(q: string): Promise<Candidate[]> {
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return [];
  const u = new URL('https://api.search.brave.com/res/v1/images/search');
  u.searchParams.set('q', q); u.searchParams.set('count', '20'); u.searchParams.set('safesearch', 'strict');
  const res = await fetch(u, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Brave search: HTTP ${res.status}`);
  const d = await res.json() as { results?: { url?: string; title?: string; properties?: { url?: string } }[] };
  return (d.results || []).filter((r) => r.properties?.url)
    .map((r) => ({ url: r.properties!.url!, page: r.url, title: r.title, source: 'brave' }));
}

/** Product images declared by a web page: og:image, twitter:image, JSON-LD Product.image, image_src, gallery imgs with a model code. */
function pageImages(html: string, base: string, codes: string[]): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) { try { out.push(new URL(v.trim().replace(/&amp;/g, '&'), base).toString()); } catch { /* skip */ } }
    else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object') add((v as { url?: unknown; contentUrl?: unknown }).url ?? (v as { contentUrl?: unknown }).contentUrl);
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (/(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i.test(tag)) add(/content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
  }
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/gi)) add(/href\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1]);
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    const t = o['@type'];
    if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) add(o.image);
    if (o['@graph']) walk(o['@graph']);
  };
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])); } catch { /* broken JSON-LD */ }
  }
  // gallery <img> whose address mentions a model code (e.g. .../UB500_01.jpg)
  const cs = codes.map(norm).filter((c) => c.length >= 4);
  if (cs.length) {
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      for (const a of m[0].matchAll(/(?:src|data-src|data-zoom-image|data-large|data-original)\s*=\s*["']([^"']+)["']/gi)) {
        if (!a[1].startsWith('data:') && cs.some((c) => norm(a[1]).includes(c))) add(a[1]);
      }
    }
  }
  return [...new Set(out)].slice(0, 10);
}

/** A pasted/found URL: an image itself, or a page whose declared images become candidates. */
async function fromUrl(raw: string, codes: string[], timeoutMs = 8000): Promise<Candidate[]> {
  const f = await safeFetch(raw, Math.max(MAX_HTML, MAX_IMAGE), 'text/html,image/*;q=0.9,*/*;q=0.5', timeoutMs);
  if (sniffImage(f.body) || f.type.startsWith('image/')) return [{ url: f.url, source: 'url' }];
  if (!f.type.includes('html')) throw new BadRequestException('URL is neither a web page nor an image');
  const imgs = pageImages(f.body.toString('utf8'), f.url, codes);
  if (!imgs.length) throw new BadRequestException('No product images found on that page');
  return imgs.map((url) => ({ url, page: f.url, source: 'url' }));
}

// ------------------------------------------------------------------ Gemini

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Tried in order: a busy (503) or rate-limited (429) model falls through to the next one. */
const models = () => [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-flash-lite-latest'])];

type GeminiReply = { text: string; grounding: { web?: { uri?: string; title?: string } }[]; model: string };

export async function gemini(body: unknown, timeoutMs = 90000): Promise<GeminiReply> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ServiceUnavailableException('GEMINI_API_KEY is not set on the server');
  let last = 'unknown error', lastStatus = 502;
  for (const m of models()) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI}/${m}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      });
    } catch { last = `${m} timed out`; lastStatus = 504; continue; } // slow model: try the next one
    const d = await res.json().catch(() => ({})) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
    };
    if (res.ok) {
      const c = d.candidates?.[0];
      return { text: (c?.content?.parts || []).map((p) => p.text || '').join(''), grounding: c?.groundingMetadata?.groundingChunks || [], model: m };
    }
    last = d.error?.message || res.statusText; lastStatus = res.status;
    if (![404, 429, 500, 503, 504].includes(res.status)) break; // 404 = model retired for this key // bad request / key: another model won't help
  }
  if (lastStatus === 429) throw new HttpException('Gemini: limit reached (free plan). Wait a minute and try again.', 429);
  if (lastStatus >= 500) throw new HttpException('Gemini is busy right now. Try again in a minute.', 503);
  throw new HttpException(`Gemini: ${last}`.slice(0, 300), 502);
}

/** Paid Gemini plans only: Google Search grounding finds product pages; their declared images become candidates. */
async function geminiSearch(id: Ident): Promise<Candidate[]> {
  if (process.env.GEMINI_SEARCH !== '1') return [];
  const r = await gemini({
    contents: [{ role: 'user', parts: [{ text: `Find official manufacturer and large retailer product pages for exactly this product: ${describe(id)}. List the page URLs.` }] }],
    tools: [{ google_search: {} }],
  }, 60000);
  const pages = r.grounding.map((g) => g.web?.uri).filter((u): u is string => !!u).slice(0, 5);
  const lists = await Promise.allSettled(pages.map((u) => fromUrl(u, id.codes)));
  return lists.flatMap((l) => (l.status === 'fulfilled' ? l.value.map((c) => ({ ...c, source: 'gemini' })) : []));
}

/** Free Gemini key (no search tools): Gemini suggests product-page URLs from memory; each is really fetched, wrong ones fail. */
async function geminiGuess(id: Ident): Promise<Candidate[]> {
  const r = await gemini({
    contents: [{ role: 'user', parts: [{ text:
      `Product from a computer store: ${describe(id)}.\n` +
      'Give up to 8 URLs of pages with photos of exactly this model: the manufacturer global English site product page first, ' +
      'then other official/brand sites and international retailers. Do NOT use Russian marketplaces (ozon, wildberries, dns-shop, citilink, ' +
      'yandex market) or amazon - they block servers. Prefer canonical product pages, not search pages. Direct official image URLs are also fine.' }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { urls: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['urls'] } },
  }, 40000);
  let urls: string[] = [];
  try { urls = (JSON.parse(r.text).urls || []).filter((u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 8); } catch { /* bad JSON */ }
  const lists = await Promise.allSettled(urls.map((u) => fromUrl(u, id.codes)));
  const out = lists.flatMap((l) => (l.status === 'fulfilled' ? l.value.map((c) => ({ ...c, source: 'gemini' })) : []));
  if (!out.length) throw new BadRequestException('AI could not find a reachable product page. Paste a product-page link.');
  return out;
}

// ------------------------------------------------------------------ OpenAI

/** AI_PROVIDER=gemini|openai picks the AI that judges photos; unset = OpenAI when its key is set, else Gemini. */
export const useOpenAI = () => {
  const pv = (process.env.AI_PROVIDER || '').toLowerCase();
  return pv === 'openai' || (pv !== 'gemini' && !!process.env.OPENAI_API_KEY);
};
/** AI_SEARCH=openai|gemini picks who searches the web; unset = OpenAI web search whenever OPENAI_API_KEY is set. */
const searchOpenAI = () => !!process.env.OPENAI_API_KEY && (process.env.AI_SEARCH || '').toLowerCase() !== 'gemini';

export async function openai(body: Record<string, unknown>, timeoutMs = 120000): Promise<{ text: string; urls: string[] }> {
  if (!process.env.OPENAI_API_KEY) throw new ServiceUnavailableException('OPENAI_API_KEY is not set on the server');
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.4-mini', ...body }),
    });
  } catch { throw new HttpException('OpenAI did not answer in time, try again', 504); }
  const d = await res.json().catch(() => ({})) as {
    error?: { message?: string };
    output?: { type: string; content?: { text?: string; annotations?: { url?: string }[] }[] }[];
  };
  if (!res.ok) {
    if (res.status === 429) throw new HttpException('OpenAI: rate limit or no credit on the account. Try again later.', 429);
    throw new HttpException(`OpenAI: ${d.error?.message || res.statusText}`.slice(0, 300), 502);
  }
  const content = (d.output || []).filter((o) => o.type === 'message').flatMap((o) => o.content || []);
  return {
    text: content.map((c) => c.text || '').join(''),
    urls: content.flatMap((c) => (c.annotations || []).map((a) => a.url || '')).filter(Boolean),
  };
}

async function openaiSearchOnce(id: Ident, prompt: string): Promise<Candidate[]> {
  const r = await openai({ tools: [{ type: 'web_search' }], reasoning: { effort: 'low' }, input: prompt }, 75000);
  const found = [...r.urls, ...(r.text.match(/https?:\/\/[^\s)\]>"']+/g) || [])]
    .map((u) => u.replace(/[.,;]+$/, '').replace(/[?&]utm_source=openai$/, ''));
  const pages = [...new Set(found)].slice(0, 10);
  const lists = await Promise.allSettled(pages.map((u) => fromUrl(u, id.codes)));
  return lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : [])).map((c) => ({ ...c, source: 'web' }));
}

/** OpenAI web search, two differently worded searches at the same time (results vary per run). */
async function openaiSearch(id: Ident): Promise<Candidate[]> {
  const what = describe(id);
  const res = await Promise.allSettled([
    openaiSearchOnce(id, `Product from a computer store: ${what}.
Search the web and give up to 10 URLs, one per line, URLs only:
- direct image file URLs (.jpg/.png/.webp, e.g. the manufacturer's CDN) of official product photos of EXACTLY this model;
- product pages of exactly this model: the official manufacturer page first, then other official brand stores and large retailers.
Avoid Russian marketplaces and Amazon (they block servers).`),
    openaiSearchOnce(id, `Find online shops (any country: Europe, Asia, Middle East, USA) that sell ${what}
and show its product photos on a white background. Search by the model / part number. Give up to 10 product page URLs or direct
product image URLs, one per line, URLs only. Not: Amazon, ozon, wildberries, dns-shop, citilink, yandex market, logos, manuals, FCC pages.`),
  ]);
  const out = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!out.length) {
    const err = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (err) throw err.reason;
    throw new BadRequestException('Product pages found by AI could not be read. Paste a product-page link.');
  }
  return out;
}

// ------------------------------------------------------------------ ranking

const KINDS = ['product', 'box', 'infographic', 'lifestyle', 'logo', 'other'] as const;
type Kind = typeof KINDS[number];
interface Ranked { index: number; match: number; quality: number; kind: Kind; reason: string }

function rankPrompt(id: Ident, n: number) {
  return `You check candidate photos for an online computer store product card.
Product: ${describe(id)}.
Below are ${n} candidate images, numbered from 0. For EVERY image give:
- match (0-100): is it EXACTLY this product (same model, version and colour from the name)? A different model or colour, an accessory,
  a generic/stock picture, a brand logo = low (0-40). If you cannot tell the model apart from close relatives, give 60-80.
- kind: "product" = the product itself (any angle); "box" = packaging visible (alone or next to the product); "infographic" = added text,
  feature callouts, collage; "lifestyle" = product in use / in a room / with people; "logo" = logo, banner, icon; "other".
- quality (0-100) as a MAIN shop photo: clean white or light plain background, product fills the frame, sharp, no watermark,
  no shop logo, no added text. Any watermark or another shop's logo: max 30. Box, infographic, lifestyle: max 60.
- reason: in Russian, max 12 words.`;
}

function parseRank(text: string, n: number): Ranked[] {
  let j: { items?: Ranked[] };
  try { j = JSON.parse(text); } catch { throw new HttpException('AI returned an unreadable answer, try again', 502); }
  return (Array.isArray(j.items) ? j.items : []).filter((x) => Number.isInteger(x.index) && x.index >= 0 && x.index < n)
    .map((x) => ({ ...x, kind: (KINDS as readonly string[]).includes(x.kind) ? x.kind : 'other' }));
}

const itemSchema = (upper: boolean) => {
  const t = (s: string) => (upper ? s.toUpperCase() : s);
  return {
    type: t('object'), required: ['index', 'match', 'quality', 'kind', 'reason'],
    properties: {
      index: { type: t('integer') }, match: { type: t('integer') }, quality: { type: t('integer') },
      kind: { type: t('string'), enum: [...KINDS], ...(upper ? { format: 'enum' } : {}) }, reason: { type: t('string') },
    },
  };
};

async function rankGemini(id: Ident, thumbs: Buffer[]): Promise<Ranked[]> {
  const parts: unknown[] = [{ text: rankPrompt(id, thumbs.length) }];
  thumbs.forEach((b, i) => { parts.push({ text: `Image ${i}:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: b.toString('base64') } }); });
  const r = await gemini({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', required: ['items'], properties: { items: { type: 'ARRAY', items: itemSchema(true) } } },
    },
  }, 45000);
  return parseRank(r.text, thumbs.length);
}

async function rankOpenAI(id: Ident, thumbs: Buffer[]): Promise<Ranked[]> {
  const content: unknown[] = [{ type: 'input_text', text: rankPrompt(id, thumbs.length) }];
  thumbs.forEach((b, i) => {
    content.push({ type: 'input_text', text: `Image ${i}:` });
    content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${b.toString('base64')}`, detail: 'low' });
  });
  const item = { ...itemSchema(false), additionalProperties: false };
  const r = await openai({
    input: [{ role: 'user', content }], reasoning: { effort: 'low' },
    text: { format: { type: 'json_schema', name: 'photo_rank', strict: true, schema: {
      type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: item } },
    } } },
  }, 60000);
  return parseRank(r.text, thumbs.length);
}

/** The configured AI first; if it is busy / limited / fails, the other one (when its key is set). Never throws. */
async function rank(id: Ident, thumbs: Buffer[]): Promise<{ items: Ranked[]; by: string; error: string | null }> {
  const order = useOpenAI() ? ['openai', 'gemini'] : ['gemini', 'openai'];
  const avail = order.filter((x) => (x === 'openai' ? !!process.env.OPENAI_API_KEY : !!process.env.GEMINI_API_KEY));
  let error: string | null = 'No AI key on the server';
  for (const by of avail) {
    try { return { items: await (by === 'openai' ? rankOpenAI(id, thumbs) : rankGemini(id, thumbs)), by, error: null }; }
    catch (e) { error = (e as Error).message; }
  }
  return { items: [], by: '', error };
}

/** Main-photo score: exact match first, then quality, then resolution (300 px → 0 … 1200+ px → 25) and a white background. */
function score(c: { match: number | null; quality: number | null; kind: string | null; width: number; height: number; whiteBg: boolean }) {
  const side = Math.min(c.width, c.height);
  const res = Math.max(0, Math.min(25, ((side - MIN_SIDE) / (1200 - MIN_SIDE)) * 25));
  const kindPenalty = c.kind === 'product' || c.kind === null ? 0 : c.kind === 'lifestyle' ? 30 : 60;
  return (c.match ?? 50) * 1.5 + (c.quality ?? 40) + res + (c.whiteBg ? 8 : 0) - kindPenalty;
}

// ------------------------------------------------------------------ controller

export interface PhotoCandidate {
  url: string; preview: string; page: string | null; source: string; width: number; height: number; bytes: number;
  match: number | null; quality: number | null; kind: Kind | null; reason: string | null; best: boolean; gallery: boolean;
}

@Controller('admin/products/:id')
@UseGuards(JwtGuard)
export class PhotosController {
  private log = new Logger('Photos');
  private busy = new Set<number>();
  constructor(@InjectDataSource() private ds: DataSource) {}

  private async product(id: number) {
    const p = await this.ds.getRepository(Product).findOneBy({ id });
    if (!p) throw new NotFoundException();
    return p;
  }

  /** Finds candidate photos, the AI rates them, the server picks the main one + gallery ones. Body: { url? }. Nothing is saved. */
  @Post('photo-search')
  async search(@Param('id', ParseIntPipe) id: number, @Body() body: { url?: string }) {
    const p = await this.product(id);
    if (this.busy.has(id)) throw new HttpException('Search for this product is already running', 409);
    this.busy.add(id);
    const t0 = Date.now(), lap: string[] = [];
    const mark = (s: string) => lap.push(`${s} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    try {
      const ident = identify(p);
      const q = searchQuery(ident);
      const manual = String(body?.url || '').trim();
      const errors: string[] = [];
      const collect = async (sources: Promise<Candidate[]>[]) => {
        const lists = await Promise.allSettled(sources);
        lists.forEach((l) => { if (l.status === 'rejected') errors.push(String((l.reason as Error)?.message || l.reason)); });
        return lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : []));
      };

      let found: Candidate[];
      if (manual) {
        found = await collect([fromUrl(manual, ident.codes, 15000)]);
        if (!found.length) throw new BadRequestException(errors[0] || 'Nothing found at that link');
      } else {
        found = await collect([icecat(ident)]);
        mark(`icecat ${found.length}`);
        if (found.length < ICECAT_ENOUGH) {
          const searchApi = !!(process.env.GOOGLE_CSE_KEY || process.env.BRAVE_SEARCH_KEY || process.env.GEMINI_SEARCH === '1');
          found = [...found, ...await collect(searchOpenAI() ? [openaiSearch(ident), googleCse(q), brave(q)]
            : searchApi ? [googleCse(q), brave(q), geminiSearch(ident)] : [geminiGuess(ident)])];
          mark(`web ${found.length}`);
        }
      }
      const result = (candidates: PhotoCandidate[], extra: Record<string, unknown> = {}) => ({
        query: q, ident: { brand: ident.brand, model: ident.model, code: ident.code, gtin: ident.gtin },
        candidates, best: candidates[0]?.best ? 0 : -1, errors, ms: Date.now() - t0, needsSearchKey: false, ...extra,
      });
      if (!found.length) return result([]);

      // download + check + de-duplicate (same picture in two sizes → keep the bigger one)
      const seenUrl = new Set<string>();
      const uniq = found.filter((c) => !LOGO.test(c.url.split('?')[0]) && !seenUrl.has(c.url) && seenUrl.add(c.url)).slice(0, 40);
      const got = await Promise.allSettled(uniq.map(async (c) => {
        const f = await safeFetch(c.url, MAX_IMAGE, 'image/*');
        const info = await inspect(f.body);
        if (!info) throw new Error('not an image');
        if (Math.min(info.width, info.height) < MIN_SIDE) throw new Error('too small');
        if (Math.max(info.width, info.height) / Math.min(info.width, info.height) > MAX_ASPECT) throw new Error('banner shape');
        return { c, f, info };
      }));
      mark(`download ${uniq.length}`);
      const ok: { c: Candidate; f: Fetched; info: Inspected }[] = [];
      for (const g of got) {
        if (g.status !== 'fulfilled') continue;
        const dup = ok.findIndex((o) => hamming(o.info.hash, g.value.info.hash) <= 5);
        if (dup < 0) ok.push(g.value);
        else if (g.value.info.width * g.value.info.height > ok[dup].info.width * ok[dup].info.height) ok[dup] = g.value;
      }
      const usable = ok.slice(0, MAX_CANDIDATES);
      if (!usable.length) return result([], { errors: [...errors, 'No usable images (too small, banners, blocked or not images)'] });

      const ranked = await rank(ident, usable.map((g) => g.info.thumb));
      if (ranked.error) errors.push(`AI: ${ranked.error}`);
      mark(`rank ${ranked.by || 'failed'}`);

      let candidates: PhotoCandidate[] = usable.map((g, i) => {
        const r = ranked.items.find((x) => x.index === i);
        return {
          url: g.f.url, preview: g.c.preview || g.f.url, page: g.c.page || null, source: g.c.source,
          width: g.info.width, height: g.info.height, bytes: g.f.body.length,
          match: r?.match ?? null, quality: r?.quality ?? null, kind: r?.kind ?? null, reason: r?.reason ?? null, best: false, gallery: false,
        };
      });
      const sc = new Map(candidates.map((c, i) => [c, score({ ...c, whiteBg: usable[i].info.whiteBg })]));
      // rated: hide clear misses (wrong product, logos) unless nothing would be left
      if (ranked.items.length) {
        const keep = candidates.filter((c) => (c.match ?? 0) >= 40 && c.kind !== 'logo');
        if (keep.length) candidates = keep;
      }
      candidates.sort((a, b) => sc.get(b)! - sc.get(a)!);
      const main = candidates.find((c) => (c.match ?? 0) >= 85 && c.kind === 'product' && (c.quality ?? 0) >= 50);
      if (main) {
        main.best = true;
        candidates = [main, ...candidates.filter((c) => c !== main)];
        candidates.filter((c) => !c.best && (c.match ?? 0) >= 85 && (c.kind === 'product' || c.kind === 'lifestyle') && (c.quality ?? 0) >= 55)
          .slice(0, 5).forEach((c) => { c.gallery = true; });
      }
      this.log.log(`product ${id} «${q}»: ${found.length} found, ${usable.length} usable, main=${main ? 'yes' : 'no'}, by=${ranked.by || '-'} | ${lap.join(', ')}`);
      return result(candidates, { rankedBy: ranked.by || null });
    } finally {
      this.busy.delete(id);
    }
  }

  /** Downloads + cleans one photo, returns its /api/media path. */
  private async store(id: number, url: string): Promise<string> {
    let f: Fetched;
    try { f = await safeFetch(url, MAX_IMAGE, 'image/*', 20000); } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(`Download failed: ${(e as Error).message}`);
    }
    let out: { body: Buffer; ext: string };
    try { out = await cleanPhoto(f.body); } catch {
      const info = sniffImage(f.body); // sharp could not read it: keep the original if it is a plain image
      if (!info) throw new BadRequestException('Not a JPEG/PNG/WebP/GIF image');
      out = { body: f.body, ext: info.ext };
    }
    const name = `${createHash('sha1').update(out.body).digest('hex').slice(0, 16)}.${out.ext}`;
    const dir = join(MEDIA_DIR, 'products', String(id));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), out.body);
    this.log.log(`product ${id}: saved ${name} (${Math.round(out.body.length / 1024)} KB) from ${f.url}`);
    return `${MEDIA_URL}/products/${id}/${name}`;
  }

  /**
   * Adds photos. Body: { url } or { urls: [...] }, main?: true (default) = the first one becomes the main photo,
   * the others follow it; false = all go to the end.
   */
  @Post('images')
  async add(@Param('id', ParseIntPipe) id: number, @Body() body: { url?: string; urls?: string[]; main?: boolean }) {
    const p = await this.product(id);
    const urls = [...new Set((Array.isArray(body?.urls) ? body.urls : [body?.url]).map((u) => String(u || '').trim()).filter(Boolean))];
    if (!urls.length) throw new BadRequestException('No URL');
    if ((p.images || []).length + urls.length > MAX_IMAGES_PER_PRODUCT) throw new BadRequestException(`Max ${MAX_IMAGES_PER_PRODUCT} photos`);
    const paths: string[] = [];
    for (const u of urls) paths.push(await this.store(id, u)); // one by one: small server, big images
    const fresh = await this.product(id); // the list may have changed while downloading
    const rest = (fresh.images || []).filter((x) => !paths.includes(x));
    const added = [...new Set(paths)];
    const images = body?.main === false ? [...rest, ...added] : [added[0], ...rest, ...added.slice(1)];
    await this.ds.getRepository(Product).update({ id }, { images });
    return { images };
  }

  /** Reorder / remove. Body: { images: string[] } — must be a subset of the current list. */
  @Put('images')
  async set(@Param('id', ParseIntPipe) id: number, @Body() body: { images?: string[] }) {
    const p = await this.product(id);
    const cur = p.images || [];
    const next = Array.isArray(body?.images) ? [...new Set(body.images.map(String))] : null;
    if (!next || next.some((x) => !cur.includes(x))) throw new BadRequestException('images must be a subset of the current list');
    await this.ds.getRepository(Product).update({ id }, { images: next });
    await this.removeFiles(id, cur.filter((x) => !next.includes(x)));
    return { images: next };
  }

  @Delete('images')
  async clear(@Param('id', ParseIntPipe) id: number) {
    const p = await this.product(id);
    await this.ds.getRepository(Product).update({ id }, { images: [] });
    await this.removeFiles(id, p.images || []);
    return { images: [] };
  }

  private async removeFiles(id: number, paths: string[]) {
    const prefix = `${MEDIA_URL}/products/${id}/`;
    for (const x of paths) {
      const name = x.startsWith(prefix) ? x.slice(prefix.length) : '';
      if (/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(name)) await unlink(join(MEDIA_DIR, 'products', String(id), name)).catch(() => undefined);
    }
  }
}
