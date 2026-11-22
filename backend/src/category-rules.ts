/**
 * Name rules that put products into site categories (pure functions, no Nest/DB — also used by tests/scripts).
 *
 * A site category has a list of rules (site_categories.match_rules) and may be linked to Access categories
 * (access_category_ids). A product goes into the category when ANY rule matches; the Access link counts as one more rule.
 * Inside a rule every filled condition must hold:
 *   s  — the product name starts with one of these
 *   w  — the name contains one of these
 *   n  — the name contains none of these
 *   a  — the product's Access category (КодТипа) is one of these
 * Items are case-insensitive plain text; an item written as /…/ is a regular expression.
 * A rule needs at least one of s, w or a (n alone would match almost everything).
 */

export interface MatchRule { s?: string[]; w?: string[]; n?: string[]; a?: number[] }

const MAX_RULES = 20;
const MAX_ITEMS = 40;
const MAX_ITEM = 120;

/** Same spelling for quotes/spaces in names and rule items (2.5″ = 2.5" = 2.5''). */
export const normName = (s: string) => s.replace(/[″”“]|''/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

type Test = (name: string) => boolean;
interface Compiled { s: Test | null; w: Test | null; n: Test | null; a: Set<number> | null }

const isRe = (x: string) => x.length > 2 && x.startsWith('/') && x.endsWith('/');

/** Rejects regexes that can take forever (a quantified group that itself has a quantifier, e.g. (a+)+). */
function safeRegex(body: string): RegExp {
  if (/\([^)]*[+*}][^)]*\)\s*[+*{]/.test(body)) throw new Error(`Regex too complex: /${body}/`);
  return new RegExp(body, 'i');
}

function compileList(items: string[] | undefined, mode: 'start' | 'has'): Test | null {
  const list = (items || []).map((x) => String(x).trim()).filter(Boolean);
  if (!list.length) return null;
  const plain: string[] = [];
  const res: RegExp[] = [];
  for (const it of list) {
    if (isRe(it)) {
      const body = it.slice(1, -1);
      res.push(safeRegex(mode === 'start' && !body.startsWith('^') ? `^(?:${body})` : body));
    } else plain.push(normName(it));
  }
  return (name) => plain.some((p) => (mode === 'start' ? name.startsWith(p) : name.includes(p))) || res.some((r) => r.test(name));
}

export function compileRule(r: MatchRule): Compiled {
  const a = (r.a || []).map(Number).filter(Number.isInteger);
  return { s: compileList(r.s, 'start'), w: compileList(r.w, 'has'), n: compileList(r.n, 'has'), a: a.length ? new Set(a) : null };
}

/** name must already be normName()-ed. */
export function ruleMatches(c: Compiled, name: string, accessCat: number | null): boolean {
  if (!c.s && !c.w && !c.a) return false;
  if (c.a && (accessCat === null || !c.a.has(accessCat))) return false;
  if (c.s && !c.s(name)) return false;
  if (c.w && !c.w(name)) return false;
  if (c.n && c.n(name)) return false;
  return true;
}

/** Validates + cleans rules from the admin (throws Error with a readable message). */
export function cleanRules(v: unknown): MatchRule[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new Error('matchRules must be an array');
  if (v.length > MAX_RULES) throw new Error(`At most ${MAX_RULES} rules per category`);
  const list = (x: unknown, key: string) => {
    if (x === undefined || x === null || x === '') return [];
    const arr = Array.isArray(x) ? x : String(x).split(',');
    const out = [...new Set(arr.map((i) => String(i).trim()).filter(Boolean))];
    if (out.length > MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} items in "${key}"`);
    for (const i of out) {
      if (i.length > MAX_ITEM) throw new Error(`Too long: ${i.slice(0, 40)}…`);
      if (isRe(i)) {
        try { safeRegex(i.slice(1, -1)); } catch (e) { throw new Error(`Bad regex ${i}: ${(e as Error).message}`); }
      }
    }
    return out;
  };
  const out: MatchRule[] = [];
  for (const raw of v) {
    const r = (raw || {}) as Record<string, unknown>;
    const rule: MatchRule = {};
    const s = list(r.s, 'starts'), w = list(r.w, 'contains'), n = list(r.n, 'not');
    const a = (Array.isArray(r.a) ? r.a : []).map(Number).filter(Number.isInteger);
    if (s.length) rule.s = s;
    if (w.length) rule.w = w;
    if (n.length) rule.n = n;
    if (a.length) rule.a = [...new Set(a)];
    if (!rule.s && !rule.w && !rule.a) {
      if (rule.n) throw new Error('A rule with only "not" would match almost everything: add "starts with" or "contains"');
      continue; // empty rule
    }
    out.push(rule);
  }
  return out;
}

export interface RuleCat { id: number; rules: MatchRule[]; accessIds: number[] }
export interface RuleProduct { id: number; name: string; cat: number | null }

/** Every (product, category) pair the rules give. */
export function matchAll(cats: RuleCat[], products: RuleProduct[]): [number, number][] {
  const compiled = cats.map((c) => ({
    id: c.id,
    rules: [...c.rules, ...(c.accessIds.length ? [{ a: c.accessIds }] : [])].map(compileRule),
  })).filter((c) => c.rules.length);
  const out: [number, number][] = [];
  for (const p of products) {
    const name = normName(p.name || '');
    if (!name) continue;
    for (const c of compiled) if (c.rules.some((r) => ruleMatches(r, name, p.cat))) out.push([p.id, c.id]);
  }
  return out;
}
