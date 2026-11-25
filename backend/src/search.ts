/**
 * Storefront search (plan step 6), in memory over the in-stock products (~1–2 thousand): no DB extension needed.
 * A product's search text = its name + brand + the names of its site-category path in RU/HY/EN, so "նոութբուք", "laptop"
 * and "ноутбук" all find laptops. Every query word must match (AND). Words that match nothing are corrected to the
 * closest word of the index (typos: "lenvo" → "lenovo") and reported back as `fix` ("did you mean").
 */

/** lower case, ё→е, Armenian ligature, quotes/inches out, punctuation → spaces (keeps . - / inside model numbers). */
export function norm(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/և/g, 'եւ').replace(/["″'”“«»]/g, ' ')
    .replace(/[^\p{L}\p{N}.\-/+]+/gu, ' ').replace(/(^|\s)[.\-/]+|[.\-/]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extra words that mean the same as a word in the names/categories. Key = what a customer types. */
const SYN: Record<string, string[]> = {
  ноут: ['ноутбук'], laptop: ['ноутбук'], notebook: ['ноутбук'], нотбук: ['ноутбук'], նոութ: ['ноутбук'],
  комп: ['компьютер'], пк: ['компьютер'], pc: ['компьютер'], computer: ['компьютер'], համակարգիչ: ['компьютер'],
  мышка: ['мышь'], mouse: ['мышь'], մկնիկ: ['мышь'], keyboard: ['клавиатура'], клава: ['клавиатура'], ստեղնաշար: ['клавиатура'],
  monitor: ['монитор'], մոնիտոր: ['монитор'], էկրան: ['монитор'], headphones: ['наушники'], headset: ['наушники'], ականջակալ: ['наушники'],
  speakers: ['колонки'], բարձրախոս: ['колонки'], флешка: ['флешка'], flash: ['флешка'], usb: ['usb'], ֆլեշ: ['флешка'],
  router: ['router'], роутер: ['router'], маршрутизатор: ['router'], ռաութեր: ['router'], switch: ['коммуникатор'], свитч: ['коммуникатор'],
  коммутатор: ['коммуникатор'], cpu: ['процессор'], проц: ['процессор'], processor: ['процессор'], պրոցեսոր: ['процессор'],
  мать: ['мат. плата'], материнка: ['мат. плата'], motherboard: ['мат. плата'], օպերատիվ: ['модуль памяти'], озу: ['модуль памяти'],
  ram: ['модуль памяти', 'ddr'], память: ['модуль памяти', 'gb'], бп: ['блок питания'], psu: ['блок питания'], кулер: ['кулер'],
  cooler: ['кулер'], case: ['корпус'], կորպուս: ['корпус'], ups: ['ибп'], бесперебойник: ['ибп'], cable: ['кабель'], մալուխ: ['кабель'],
  bag: ['сумка'], պայուսակ: ['сумка'], hdd: ['жесткий диск'], винчестер: ['жесткий диск'], gpu: ['видеокарта'], видюха: ['видеокарта'],
  printer: ['принтер'], տպիչ: ['принтер'], wifi: ['wi-fi'], вайфай: ['wi-fi'],
};

export interface Doc { id: number; code: number; name: string; text: string; brand: string | null }

/** Levenshtein distance, stops early above `max`. */
function dist(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Query → words (max 8), each with the alternatives that also count as a match. */
export function parseQuery(q: string) {
  return norm(q).split(' ').filter(Boolean).slice(0, 8).map((w) => ({ w, alt: [w, ...(SYN[w] || [])] }));
}

/**
 * Match docs against the query. Returns matching ids with a score (higher = better) and the corrected query when some
 * words were replaced. `vocab` = all words of all docs (for typo correction).
 */
export function search(docs: Doc[], q: string) {
  let words = parseQuery(q);
  if (!words.length) return { hits: new Map<number, number>(), fix: null as string | null };
  // typo correction: a word (≥ 4 letters, not a number) found in no doc → closest index word
  let fixed = false;
  const has = (w: { w: string; alt: string[] }) => docs.some((d) => w.alt.some((a) => d.text.includes(a)) || String(d.code) === w.w);
  let vocab: string[] | null = null;
  words = words.map((w) => {
    if (w.w.length < 4 || /^\d+$/.test(w.w) || has(w)) return w;
    vocab ??= [...new Set([...Object.keys(SYN), ...docs.flatMap((d) => d.text.split(' '))])].filter((x) => x.length >= 3);
    const max = w.w.length >= 7 ? 2 : 1;
    let best: string | null = null, bd = max + 1;
    for (const v of vocab) { const d = dist(w.w, v, max); if (d < bd) { bd = d; best = v; } }
    if (!best) return w;
    fixed = true;
    return { w: best, alt: [best, ...(SYN[best] || [])] };
  });

  const hits = new Map<number, number>();
  for (const d of docs) {
    const name = ` ${norm(d.name)} `;
    let score = 0, ok = true;
    for (const { w, alt } of words) {
      if (d.code === Number(w) && /^\d+$/.test(w)) { score += 100; continue; } // Access code typed
      // best of the word and its synonyms: whole word > word start > inside > category only; +3 brand; +2 product type word
      let best = 0;
      for (const a of alt) {
        if (!d.text.includes(a)) continue;
        const v = (name.includes(` ${a} `) ? 5 : name.includes(` ${a}`) ? 4 : name.includes(a) ? 2 : 1)
          + (d.brand && norm(d.brand) === a ? 3 : 0) + (name.startsWith(` ${a}`) ? 2 : 0);
        best = Math.max(best, v);
      }
      if (!best) { ok = false; break; }
      score += best;
    }
    if (ok) hits.set(d.id, score);
  }
  return { hits, fix: fixed ? words.map((w) => w.w).join(' ') : null };
}
