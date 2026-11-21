/**
 * AI product photo finder (admin only).
 *
 *  1. Candidates: image-search APIs (Google Custom Search / Brave / Gemini Search grounding — whichever keys are set)
 *     plus an optional page or image URL pasted by the admin (works without any search key).
 *  2. Every candidate is downloaded through safeFetch (public http(s) only, size + type checks, no private IPs).
 *  3. Gemini (vision) looks at all candidates together with the product name/code and picks the best one.
 *  4. Saving downloads the chosen image again and stores it in MEDIA_DIR, served at /api/media/...
 *
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-flash-latest),
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
import { JwtGuard } from './auth';
import { Product } from './entities';

export const MEDIA_DIR = process.env.MEDIA_DIR || '/data/media';
export const MEDIA_URL = '/api/media';
const UA = 'Mozilla/5.0 (compatible; LedComputersAdmin/1.0; +https://led.am)';
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_HTML = 3 * 1024 * 1024;
const MAX_AI_IMAGE = 3 * 1024 * 1024; // inline limit per image we send to Gemini
const MIN_SIDE = 250;
const MAX_CANDIDATES = 12;
const MAX_IMAGES_PER_PRODUCT = 12;

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
async function safeFetch(raw: string, maxBytes: number, accept: string, timeoutMs = 12000): Promise<Fetched> {
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

// ------------------------------------------------------------------ image sniffing (no native deps)

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

// ------------------------------------------------------------------ candidate sources

interface Candidate { url: string; page?: string; source: string; title?: string }

function searchQuery(p: Product): string {
  // "Мышь Logitech G102 LIGHTSYNC (RGB, 6 Button, ...)" -> "Мышь Logitech G102 LIGHTSYNC" + code if missing
  let q = (p.name || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (p.brand && !q.toLowerCase().includes(p.brand.toLowerCase())) q = `${p.brand} ${q}`;
  if (p.barcode && p.barcode.length >= 4 && !/^\d{8,14}$/.test(p.barcode) && !q.includes(p.barcode)) q += ` ${p.barcode}`;
  return q.slice(0, 200);
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

/** Product images declared by a web page: og:image, twitter:image, JSON-LD Product.image, image_src. */
function pageImages(html: string, base: string, code?: string | null): string[] {
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
  // gallery <img> whose address mentions the model code (e.g. .../UB500_01.jpg)
  const c = (code || '').toLowerCase();
  if (c.length >= 4) {
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      for (const a of m[0].matchAll(/(?:src|data-src|data-zoom-image|data-large|data-original)\s*=\s*["']([^"']+)["']/gi)) {
        if (a[1].toLowerCase().includes(c) && !a[1].startsWith('data:')) add(a[1]);
      }
    }
  }
  return [...new Set(out)].slice(0, 10);
}

/** A pasted URL: an image itself, or a page whose declared images become candidates. */
async function fromUrl(raw: string, code?: string | null): Promise<Candidate[]> {
  const f = await safeFetch(raw, Math.max(MAX_HTML, MAX_IMAGE), 'text/html,image/*;q=0.9,*/*;q=0.5');
  if (sniffImage(f.body)) return [{ url: f.url, source: 'url' }];
  if (!f.type.includes('html')) throw new BadRequestException('URL is neither a web page nor an image');
  const imgs = pageImages(f.body.toString('utf8'), f.url, code);
  if (!imgs.length) throw new BadRequestException('No product images found on that page');
  return imgs.map((url) => ({ url, page: f.url, source: 'url' }));
}

// ------------------------------------------------------------------ Gemini

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Tried in order: a busy (503) or rate-limited (429) model falls through to the next one. */
const models = () => [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-flash-lite-latest'])];

type GeminiReply = { text: string; grounding: { web?: { uri?: string; title?: string } }[] };

async function gemini(body: unknown, timeoutMs = 90000): Promise<GeminiReply> {
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
      return { text: (c?.content?.parts || []).map((p) => p.text || '').join(''), grounding: c?.groundingMetadata?.groundingChunks || [] };
    }
    last = d.error?.message || res.statusText; lastStatus = res.status;
    if (![429, 500, 503, 504].includes(res.status)) break; // bad request / key: another model won't help
  }
  if (lastStatus === 429) throw new HttpException('Gemini: limit reached (free plan). Wait a minute and try again.', 429);
  if (lastStatus >= 500) throw new HttpException('Gemini is busy right now. Try again in a minute.', 503);
  throw new HttpException(`Gemini: ${last}`.slice(0, 300), 502);
}

/** Paid Gemini plans only: Google Search grounding finds product pages; their declared images become candidates. */
async function geminiSearch(p: Product, q: string): Promise<Candidate[]> {
  if (process.env.GEMINI_SEARCH !== '1') return [];
  const r = await gemini({
    contents: [{ role: 'user', parts: [{ text: `Find official manufacturer and large retailer product pages for exactly this product: "${p.name}" (code ${p.barcode || '-'}). Search query hint: ${q}. List the page URLs.` }] }],
    tools: [{ google_search: {} }],
  }, 60000);
  const pages = r.grounding.map((g) => g.web?.uri).filter((u): u is string => !!u).slice(0, 5);
  const lists = await Promise.allSettled(pages.map((u) => fromUrl(u, p.barcode)));
  return lists.flatMap((l) => (l.status === 'fulfilled' ? l.value.map((c) => ({ ...c, source: 'gemini' })) : []));
}

/**
 * Works with the free Gemini key (no search tools): Gemini suggests official product-page URLs from its own knowledge
 * (manufacturer site first, then big retailers). Every URL is then really fetched through the SSRF guard, so a wrong
 * or invented URL just fails and is dropped. Used when no search API is configured.
 */
async function geminiGuess(p: Product): Promise<Candidate[]> {
  const r = await gemini({
    contents: [{ role: 'user', parts: [{ text:
      `Product from a computer store: "${p.name}"${p.brand ? `, brand ${p.brand}` : ''}${p.barcode ? `, model/part code ${p.barcode}` : ''}.
` +
      'Give up to 8 URLs of pages with photos of exactly this model: the manufacturer's global English site product page first, ' +
      'then other official/brand sites and international retailers. Do NOT use Russian marketplaces (ozon, wildberries, dns-shop, citilink, ' +
      'yandex market) or amazon - they block servers. Prefer canonical product pages, not search pages. Direct official image URLs are also fine.' }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { urls: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['urls'] } },
  }, 40000);
  let urls: string[] = [];
  try { urls = (JSON.parse(r.text).urls || []).filter((u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 8); } catch { /* bad JSON */ }
  const lists = await Promise.allSettled(urls.map((u) => fromUrl(u, p.barcode)));
  const out = lists.flatMap((l) => (l.status === 'fulfilled' ? l.value.map((c) => ({ ...c, source: 'gemini' })) : []));
  if (!out.length) throw new BadRequestException('AI could not find a reachable product page. Paste a product-page link.');
  return out;
}

interface Ranked { index: number; match: number; quality: number; reason: string }

async function rank(p: Product, imgs: { b64: string; mime: string }[]): Promise<{ best: number; items: Ranked[] }> {
  const parts: unknown[] = [{
    text: `You choose the main photo for an online computer store product card.
Product: "${p.name}"${p.brand ? `, brand ${p.brand}` : ''}${p.barcode ? `, code/model ${p.barcode}` : ''}.
Below are ${imgs.length} candidate images, numbered from 0.
For each image rate:
- match (0-100): is it EXACTLY this product (same model, version and colour from the name)? A different model, accessory, box only, or a generic picture is low.
- quality (0-100): clear product shot on a clean/white background, product fills the frame, sharp, no watermark, no added text/banners/collage, no people.
Then pick "best" = index of the image that is exactly this product with the best quality, or -1 if none is exactly this product.
Give "reason" in Russian, max 15 words.`,
  }];
  imgs.forEach((im, i) => { parts.push({ text: `Image ${i}:` }); parts.push({ inline_data: { mime_type: im.mime, data: im.b64 } }); });
  const r = await gemini({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0, responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT', required: ['best', 'items'],
        properties: {
          best: { type: 'INTEGER' },
          items: { type: 'ARRAY', items: { type: 'OBJECT', required: ['index', 'match', 'quality', 'reason'], properties: {
            index: { type: 'INTEGER' }, match: { type: 'INTEGER' }, quality: { type: 'INTEGER' }, reason: { type: 'STRING' } } } },
        },
      },
    },
  });
  try {
    const j = JSON.parse(r.text) as { best: number; items: Ranked[] };
    return { best: Number.isInteger(j.best) && j.best >= 0 && j.best < imgs.length ? j.best : -1, items: Array.isArray(j.items) ? j.items : [] };
  } catch {
    throw new HttpException('Gemini returned an unreadable answer, try again', 502);
  }
}

// ------------------------------------------------------------------ controller

export interface PhotoCandidate {
  url: string; page: string | null; source: string; width: number; height: number; bytes: number;
  match: number | null; quality: number | null; reason: string | null; best: boolean;
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

  /** Finds candidate photos and lets Gemini pick the best. Body: { url?: page or image URL }. Nothing is saved. */
  @Post('photo-search')
  async search(@Param('id', ParseIntPipe) id: number, @Body() body: { url?: string }) {
    const p = await this.product(id);
    if (this.busy.has(id)) throw new HttpException('Search for this product is already running', 409);
    this.busy.add(id);
    try {
      const q = searchQuery(p);
      const manual = String(body?.url || '').trim();
      const errors: string[] = [];
      const searchApi = !!(process.env.GOOGLE_CSE_KEY || process.env.BRAVE_SEARCH_KEY || process.env.GEMINI_SEARCH === '1');
      const sources = manual ? [fromUrl(manual, p.barcode)]
        : searchApi ? [googleCse(q), brave(q), geminiSearch(p, q)] : [geminiGuess(p)];
      const lists = await Promise.allSettled(sources);
      lists.forEach((l) => { if (l.status === 'rejected') errors.push(String((l.reason as Error)?.message || l.reason)); });
      const found = lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : []));
      if (!found.length) {
        if (manual && errors.length) throw new BadRequestException(errors[0]);
        return { query: q, candidates: [], best: -1, needsSearchKey: false, errors };
      }

      // download, validate, de-duplicate
      const seenUrl = new Set<string>(), seenHash = new Set<string>();
      const uniq = found.filter((c) => !seenUrl.has(c.url) && seenUrl.add(c.url)).slice(0, MAX_CANDIDATES * 2);
      const got = await Promise.allSettled(uniq.map(async (c) => {
        const f = await safeFetch(c.url, MAX_IMAGE, 'image/*');
        const info = sniffImage(f.body);
        if (!info) throw new Error('not an image');
        if (Math.min(info.width, info.height) < MIN_SIDE) throw new Error('too small');
        return { c, f, info, hash: createHash('sha1').update(f.body).digest('hex') };
      }));
      const ok = got.flatMap((g) => (g.status === 'fulfilled' ? [g.value] : []))
        .filter((g) => !seenHash.has(g.hash) && seenHash.add(g.hash))
        .slice(0, MAX_CANDIDATES);
      if (!ok.length) return { query: q, candidates: [], best: -1, needsSearchKey: false, errors: ['No usable images (too small, blocked or not images)'] };

      const forAi = ok.filter((g) => g.f.body.length <= MAX_AI_IMAGE && g.info.mime !== 'image/gif');
      const ranked = forAi.length ? await rank(p, forAi.map((g) => ({ b64: g.f.body.toString('base64'), mime: g.info.mime }))) : { best: -1, items: [] };

      const candidates: PhotoCandidate[] = ok.map((g) => {
        const ai = forAi.indexOf(g);
        const r = ai < 0 ? undefined : ranked.items.find((x) => x.index === ai);
        return {
          url: g.f.url, page: g.c.page || null, source: g.c.source, width: g.info.width, height: g.info.height, bytes: g.f.body.length,
          match: r?.match ?? null, quality: r?.quality ?? null, reason: r?.reason ?? null, best: ai >= 0 && ai === ranked.best,
        };
      });
      const score = (c: PhotoCandidate) => (c.best ? 1000 : 0) + (c.match ?? -1) * 2 + (c.quality ?? 0);
      candidates.sort((a, b) => score(b) - score(a));
      this.log.log(`product ${id}: ${found.length} found, ${ok.length} usable, best=${ranked.best}`);
      return { query: q, candidates, best: candidates[0]?.best ? 0 : -1, needsSearchKey: false, errors };
    } finally {
      this.busy.delete(id);
    }
  }

  /** Downloads the chosen image and adds it to the product. Body: { url, main?: true = put first }. */
  @Post('images')
  async add(@Param('id', ParseIntPipe) id: number, @Body() body: { url?: string; main?: boolean }) {
    const p = await this.product(id);
    if ((p.images || []).length >= MAX_IMAGES_PER_PRODUCT) throw new BadRequestException(`Max ${MAX_IMAGES_PER_PRODUCT} photos`);
    let f: Fetched;
    try { f = await safeFetch(String(body?.url || ''), MAX_IMAGE, 'image/*'); } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(`Download failed: ${(e as Error).message}`);
    }
    const info = sniffImage(f.body);
    if (!info) throw new BadRequestException('Not a JPEG/PNG/WebP/GIF image');
    const name = `${createHash('sha1').update(f.body).digest('hex').slice(0, 16)}.${info.ext}`;
    const dir = join(MEDIA_DIR, 'products', String(id));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), f.body);
    const path = `${MEDIA_URL}/products/${id}/${name}`;
    const rest = (p.images || []).filter((x) => x !== path);
    const images = body?.main === false ? [...rest, path] : [path, ...rest];
    await this.ds.getRepository(Product).update({ id }, { images });
    this.log.log(`product ${id}: saved ${path} from ${f.url}`);
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
