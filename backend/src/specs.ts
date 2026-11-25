/**
 * Product specs read from the Access product name (plan step 2). The store's names follow one pattern:
 *   "<type> [capacity/size] <brand> <model> (<spec>, <spec>, …)"   e.g.
 *   Ноутбук Dell XPS 13 … 13.4" (3K IPS Touch, Core 5 320, 8GB, 512GB SSD, Intel Xe3 Graphics, Sky, Win 11)
 *   Модуль памяти DIMM 16GB DDR5 Crucial CT16G56C46U5 (5600MHz)
 * No AI and no outside service: a pure function, cached per name. Specs the admin enters later (step 8) win over these.
 *
 * Every spec key is defined once in SPECS (labels [ru, hy, en], product-page group, sort). Values are language-neutral
 * (numbers with units, model names); yes/no values are the tokens 'yes'/'no' and translated by the site (YES_NO).
 */

export type SpecGroup = 'main' | 'cpu' | 'display' | 'memory' | 'graphics' | 'ports' | 'power' | 'body';
export interface SpecDef { names: [string, string, string]; group: SpecGroup; num?: boolean; noFilter?: boolean }

/** Order here = order of filters and of rows on the product page. */
export const SPECS: Record<string, SpecDef> = {
  cpu: { names: ['Процессор', 'Պրոցեսոր', 'Processor'], group: 'cpu' },
  cpu_model: { names: ['Модель процессора', 'Պրոցեսորի մոդել', 'CPU model'], group: 'cpu', noFilter: true },
  socket: { names: ['Сокет', 'Սոկետ', 'Socket'], group: 'cpu' },
  chipset: { names: ['Чипсет', 'Չիպսեթ', 'Chipset'], group: 'cpu' },
  cpu_ghz: { names: ['Частота', 'Հաճախականություն', 'Clock'], group: 'cpu', num: true },
  cache_mb: { names: ['Кэш', 'Քեշ', 'Cache'], group: 'cpu', num: true },
  pack: { names: ['Комплектация', 'Կոմպլեկտացիա', 'Packaging'], group: 'cpu' },
  screen: { names: ['Диагональ', 'Անկյունագիծ', 'Screen size'], group: 'display', num: true },
  resolution: { names: ['Разрешение', 'Լուծաչափ', 'Resolution'], group: 'display' },
  panel: { names: ['Матрица', 'Մատրիցա', 'Panel'], group: 'display' },
  hz: { names: ['Частота обновления', 'Թարմացման հաճախականություն', 'Refresh rate'], group: 'display', num: true },
  response: { names: ['Время отклика', 'Արձագանքման ժամանակ', 'Response time'], group: 'display', num: true },
  touch: { names: ['Сенсорный экран', 'Սենսորային էկրան', 'Touch screen'], group: 'display' },
  ram: { names: ['Оперативная память', 'Օպերատիվ հիշողություն', 'Memory (RAM)'], group: 'memory', num: true },
  capacity: { names: ['Объём', 'Ծավալ', 'Capacity'], group: 'memory', num: true },
  mem_type: { names: ['Тип памяти', 'Հիշողության տեսակ', 'Memory type'], group: 'memory' },
  mhz: { names: ['Частота памяти', 'Հիշողության հաճախականություն', 'Memory speed'], group: 'memory', num: true },
  storage: { names: ['Накопитель', 'Կուտակիչ', 'Storage'], group: 'memory', num: true },
  storage_type: { names: ['Тип накопителя', 'Կուտակիչի տեսակ', 'Storage type'], group: 'memory' },
  form: { names: ['Форм-фактор', 'Ձևաչափ', 'Form factor'], group: 'body' },
  iface: { names: ['Интерфейс', 'Ինտերֆեյս', 'Interface'], group: 'ports' },
  rpm: { names: ['Скорость вращения', 'Պտտման արագություն', 'Spindle speed'], group: 'memory', num: true },
  gpu: { names: ['Видеокарта', 'Վիդեոքարտ', 'Graphics'], group: 'graphics' },
  gpu_model: { names: ['Модель графики', 'Գրաֆիկայի մոդել', 'Graphics model'], group: 'graphics', noFilter: true },
  os: { names: ['Операционная система', 'Օպերացիոն համակարգ', 'Operating system'], group: 'main' },
  power_w: { names: ['Мощность', 'Հզորություն', 'Power'], group: 'power', num: true },
  power_va: { names: ['Мощность (ВА)', 'Հզորություն (ՎԱ)', 'Power (VA)'], group: 'power', num: true },
  cert: { names: ['Сертификат 80+', '80+ սերտիֆիկատ', '80+ certificate'], group: 'power' },
  ports: { names: ['Порты', 'Պորտեր', 'Ports'], group: 'ports', num: true },
  lan: { names: ['Скорость сети', 'Ցանցի արագություն', 'Network speed'], group: 'ports' },
  poe: { names: ['PoE', 'PoE', 'PoE'], group: 'ports' },
  wifi: { names: ['Wi-Fi', 'Wi-Fi', 'Wi-Fi'], group: 'ports' },
  wireless: { names: ['Беспроводная', 'Անլար', 'Wireless'], group: 'ports' },
  usb: { names: ['USB', 'USB', 'USB'], group: 'ports' },
  dpi: { names: ['Разрешение сенсора', 'Սենսորի լուծաչափ', 'Sensor DPI'], group: 'main', num: true },
  length: { names: ['Длина', 'Երկարություն', 'Length'], group: 'body', num: true },
  psu: { names: ['Блок питания', 'Սնուցման բլոկ', 'Power supply'], group: 'body' },
  window: { names: ['Боковое окно', 'Կողային պատուհան', 'Side window'], group: 'body' },
  rgb: { names: ['Подсветка', 'Լուսավորություն', 'Lighting'], group: 'body' },
  color: { names: ['Цвет', 'Գույն', 'Colour'], group: 'body' },
};
export const SPEC_KEYS = Object.keys(SPECS);
export type Specs = Record<string, string>;

/** Display order for numbers: "512 GB" < "1 TB". Used to sort filter values. */
export function specNum(key: string, v: string): number {
  const m = /([\d.]+)\s*(TB|GB|MB|GHz|MHz|Hz|ms|W|VA|m|″|rpm|DPI)?/i.exec(v);
  if (!m) return NaN;
  const n = Number(m[1]);
  return /^TB$/i.test(m[2] || '') ? n * 1024 : n;
}

const COLORS = ['Black', 'White', 'Silver', 'Gray', 'Grey', 'Blue', 'Red', 'Green', 'Pink', 'Gold', 'Purple', 'Yellow', 'Orange',
  'Graphite', 'Beige', 'Brown'];
const KINDS: [RegExp, string][] = [
  [/^Ноутбук/i, 'laptop'], [/^Моноблок|^Компьютер/i, 'pc'], [/^Монитор/i, 'monitor'], [/^Модуль памяти/i, 'ram'],
  [/^Процессор/i, 'cpu'], [/^Мат\.? ?плата|^Материнская/i, 'board'], [/^Блок питания/i, 'psu'], [/^Накопитель/i, 'ssd'],
  [/^Жесткий диск внешний корпус/i, 'enclosure'], [/^Жесткий диск/i, 'hdd'], [/^Флешка|^Карта памяти/i, 'flash'],
  [/^Видеокарта/i, 'gpu'], [/^Коммуникатор USB|^Карт-ридер|^Док-станция/i, 'hub'], [/^Коммуникатор/i, 'switch'],
  [/^ИБП|^Источник/i, 'ups'], [/^Мышь/i, 'mouse'], [/^Клавиатура/i, 'keyboard'], [/^Корпус/i, 'case'], [/^Кабель|^Удлинитель|^Переходник|^Адаптер/i, 'cable'],
];

const kindOf = (name: string) => KINDS.find(([re]) => re.test(name))?.[1] ?? null;
const gbOf = (n: string, unit: string) => `${Number(n)} ${unit.toUpperCase()}`;

/** Parse one product name. Never throws; unknown names give {}. */
export function parseSpecs(name: string): Specs {
  const s: Specs = {};
  const kind = kindOf(name);
  const m = /^(.*?)\s*\((.*)\)?\s*$/.exec(name);
  const head = m ? m[1] : name;
  const parts = (m ? m[2].replace(/\)\s*$/, '') : '').split(/\s*,\s*/).filter(Boolean);
  const all = name;

  // ---- display
  const inch = /(\d{2}(?:\.\d)?)\s*(?:"|″|''|”|inch)/i.exec(all);
  if (inch && ['laptop', 'monitor', 'pc'].includes(kind || '')) s.screen = `${Number(inch[1])}″`;
  if (kind === 'laptop' || kind === 'monitor' || kind === 'pc') {
    const res = /\b(\d{3,4})\s*x\s*(\d{3,4})\b/.exec(all);
    const tag = /\b(4K|UHD|QHD\+?|2\.5K|2K|3K|WQXGA|WUXGA|FHD\+?|HD\+?)\b/i.exec(all);
    if (tag) s.resolution = tag[1].toUpperCase();
    if (res) s.resolution = `${s.resolution ? `${s.resolution} ` : ''}${res[1]}×${res[2]}`;
    const panel = /\b(OLED|Mini[- ]?LED|IPS|VA|TN)\b/i.exec(all);
    if (panel) s.panel = panel[1].toUpperCase().replace(/MINI[- ]?LED/, 'Mini-LED');
    const hz = /\b(\d{2,3})\s?Hz\b/i.exec(all);
    if (hz) s.hz = `${hz[1]} Hz`;
    const ms = /\b(\d(?:\.\d)?)\s?ms\b/i.exec(all);
    if (ms && kind === 'monitor') s.response = `${ms[1]} ms`;
    if (kind === 'laptop') s.touch = /\btouch\b/i.test(all) ? 'yes' : 'no';
  }

  // ---- CPU
  const cpu = /\b(Core\s+Ultra\s+\d|Core\s+i[3579]|Core\s+\d|Ryzen\s+AI\s+\d|Ryzen\s+\d|Ryzen\s+Threadripper|Celeron|Pentium(?:\s+Gold)?|Athlon|Xeon|Snapdragon\s+X\w*|Apple\s+M\d|Intel\s+(?:Core\s+\d\s+)?N\d{3})/i.exec(all);
  if (cpu && ['laptop', 'pc', 'cpu'].includes(kind || '')) {
    s.cpu = cpu[1].replace(/\s+/g, ' ').replace(/^intel (core \d )?n\d+/i, 'Intel N').replace(/^(\w)/, (c) => c.toUpperCase());
    const model = new RegExp(`${cpu[1].replace(/\s+/g, '\\s+')}[\\s-]*([A-Z]?\\d{2,5}[A-Z]{0,3})`, 'i').exec(all);
    if (model) s.cpu_model = `${s.cpu} ${model[1].toUpperCase()}`;
  }
  if (kind === 'cpu' || kind === 'board' || kind === 'laptop' || kind === 'pc') {
    const sock = /\b(?:S-?|LGA\s?)(1151v2|1151|1200|1700|1851|2066|775|1150|1155)\b|\b(AM[345]|sTRX4|TR4|FM2\+?)\b/i.exec(all);
    if (sock && kind !== 'laptop' && kind !== 'pc') s.socket = sock[1] ? `LGA${sock[1]}` : sock[2].toUpperCase();
    const chip = /\b([ABHXZQ]\d{3}[EM]?)\b/.exec(m ? m[2] : '');
    if (chip && kind === 'board') s.chipset = chip[1];
    const ghz = /\b(\d(?:\.\d+)?)\s?GHz\b/i.exec(all);
    if (ghz && kind === 'cpu') s.cpu_ghz = `${ghz[1]} GHz`;
    const cache = /\b(\d{1,3})\s?Mb\b/.exec(all);
    if (cache && kind === 'cpu') s.cache_mb = `${cache[1]} MB`;
    if (kind === 'cpu') { if (/\bBOX\b/.test(all)) s.pack = 'BOX'; else if (/\bTRAY\b/.test(all)) s.pack = 'TRAY'; }
  }

  // ---- memory / storage
  const ddr = /(?:^|[^A-Z])(?:LP)?(DDR\d)\b/i.exec(all);
  if (ddr && ['ram', 'board', 'laptop', 'pc'].includes(kind || '')) s.mem_type = ddr[1].toUpperCase();
  if (kind === 'laptop' || kind === 'pc') {
    for (const p of parts) {
      const cap = /^(\d{1,4})\s?(GB|TB)\b(.*)$/i.exec(p);
      if (!cap) continue;
      const rest = cap[3];
      if (/SSD|HDD|eMMC|NVMe/i.test(rest)) { s.storage = gbOf(cap[1], cap[2]); s.storage_type = /HDD/i.test(rest) ? 'HDD' : /eMMC/i.test(rest) ? 'eMMC' : 'SSD'; }
      else if (!s.ram) s.ram = gbOf(cap[1], cap[2]);
    }
    if (!s.ram) { const r = /\b(\d{1,3})\s?GB\s+RAM\b/i.exec(all); if (r) s.ram = `${r[1]} GB`; }
    if (!s.storage) { const r = /\b(\d{2,4})\s?(GB|TB)\s+(SSD|HDD)\b/i.exec(all); if (r) { s.storage = gbOf(r[1], r[2]); s.storage_type = r[3].toUpperCase(); } }
  }
  if (['ram', 'ssd', 'hdd', 'flash'].includes(kind || '')) {
    const cap = /\b(\d{1,4})\s?(GB|TB)\b/i.exec(head);
    if (cap) s.capacity = gbOf(cap[1], cap[2]);
    const mhz = /\b(\d{4})\s?MHz\b/i.exec(all);
    if (mhz && kind === 'ram') s.mhz = `${mhz[1]} MHz`;
    if (kind === 'ram') s.form = /SO-?DIMM/i.test(all) ? 'SO-DIMM' : 'DIMM';
  }
  if (kind === 'ssd' || kind === 'hdd' || kind === 'enclosure') {
    const ff = /\b(M\.2|2\.5"|3\.5"|mSATA)/i.exec(all);
    if (ff) s.form = ff[1].replace('"', '″');
    const ifc = /\b(NVMe|SATA\s?III|SATA3|SATA|SAS|USB[ -]?\d(?:\.\d)?)/i.exec(all);
    if (ifc && kind !== 'enclosure') s.iface = /NVMe/i.test(ifc[1]) ? 'NVMe' : /SAS/i.test(ifc[1]) ? 'SAS' : /USB/i.test(ifc[1]) ? 'USB' : 'SATA';
    const rpm = /\b(\d{4,5})\s?rpm\b/i.exec(all);
    if (rpm) s.rpm = `${rpm[1]} rpm`;
  }

  // ---- graphics, OS
  if (kind === 'laptop' || kind === 'pc') {
    const gpu = /\b((?:GeForce\s+)?RTX\s?\d{4}(?:\s?Ti)?|(?:GeForce\s+)?GTX\s?\d{3,4}|Radeon\s+RX\s?\d{4}\w*|Arc\s+[AB]\d{3}\w*)\b/i.exec(all);
    if (gpu) s.gpu = gpu[1].replace(/GeForce\s+/i, '').replace(/\s+/g, ' ').toUpperCase().replace('RADEON', 'Radeon').replace('ARC', 'Arc');
    else if (kind === 'laptop') {
      s.gpu = 'integrated';
      const name = parts.find((p) => /\b(Graphics|Radeon|Arc|Iris|UHD|Adreno)\b/i.test(p));
      if (name) s.gpu_model = name;
    }
    const os = /\b(Win(?:dows)?\s?1[01](?:\s?(?:Pro|Home))?|Free\s?DOS|DOS|No\s?OS|Linux|Chrome\s?OS|macOS)\b/i.exec(all);
    s.os = os ? (/^win/i.test(os[1]) ? `Windows ${/1[01]/.exec(os[1])![0]}${/pro/i.test(os[1]) ? ' Pro' : ''}` : /dos|no\s?os/i.test(os[1]) ? 'no' : os[1]) : (kind === 'laptop' ? 'no' : '');
    if (!s.os) delete s.os;
  }

  // ---- power
  const w = /^(?:Блок питания)\s+(\d{3,4})\s?W\b/i.exec(name);
  if (w) s.power_w = `${w[1]} W`;
  const cert = /80\+\s?(Titanium|Platinum|Gold|Silver|Bronze|White|Standard)?/i.exec(all);
  if (cert && kind === 'psu') s.cert = cert[1] ? cert[1][0].toUpperCase() + cert[1].slice(1).toLowerCase() : 'Standard';
  const va = /\b(\d{3,4})\s?VA\b/i.exec(all);
  if (va && kind === 'ups') s.power_va = `${va[1]} VA`;

  // ---- network, peripherals
  if (kind === 'switch') {
    const ports = /\b(\d{1,2})\s?port/i.exec(all);
    if (ports) s.ports = String(Number(ports[1]));
    s.lan = /10\/100\/1000|Gigabit|\b\dG\b/i.test(all) ? '1 Gbit/s' : /10\/100\b/.test(all) ? '100 Mbit/s' : '';
    if (!s.lan) delete s.lan;
    s.poe = /PoE/i.test(all) ? 'yes' : 'no';
  }
  if (kind === 'mouse' || kind === 'keyboard') {
    s.wireless = /беспровод|wireless|bluetooth|2\.4\s?G/i.test(all) ? 'yes' : 'no';
    const dpi = /(\d{3,5})\s?DPI/i.exec(all.replace(/(\d{3,5})-(\d{3,5})\s?DPI/i, '$2 DPI'));
    if (dpi && kind === 'mouse') s.dpi = `${dpi[1]} DPI`;
  }
  const wifi = /Wi-?Fi\s?(\d[E]?)|\b(BE|AX|AC)\d{3,5}\b|802\.11(be|ax|ac|n)/i.exec(all);
  if (wifi && /router|точка|адаптер|сетевая/i.test(name)) {
    const g = (wifi[1] || wifi[2] || wifi[3]).toUpperCase();
    s.wifi = { BE: 'Wi-Fi 7', AX: 'Wi-Fi 6', AC: 'Wi-Fi 5', N: 'Wi-Fi 4' }[g] ?? `Wi-Fi ${g}`;
  }
  if (kind === 'cable') {
    const len = /\b(\d{1,2}(?:\.\d{1,2})?)\s?m\b/i.exec(all);
    if (len) s.length = `${Number(len[1])} m`;
  }
  if (kind === 'case') {
    s.psu = /w\/o|без\s+бп|without/i.test(all) ? 'no' : /\d{3}W/i.test(all) ? 'yes' : '';
    if (!s.psu) delete s.psu;
    s.window = /window|TG\b|стекл/i.test(all) ? 'yes' : 'no';
    const f = /\b(Full\s?Tower|Midi\s?Tower|Mini\s?Tower|Micro\s?ATX|mATX|Mini-?ITX|Slim)/i.exec(all);
    if (f) s.form = f[1].replace(/\s+/g, '').replace(/^(\w)(\w+)Tower$/i, (_, a, b) => `${a.toUpperCase()}${b.toLowerCase()} Tower`);
  }
  if (/\b(A?RGB)\b/.test(all) && ['case', 'mouse', 'keyboard'].includes(kind || '')) s.rgb = 'RGB';

  // ---- colour: last part that starts with a known colour
  for (const p of [...parts].reverse()) {
    const c = COLORS.find((x) => new RegExp(`^${x}\\b`, 'i').test(p) || new RegExp(`\\b${x}$`, 'i').test(p));
    if (c && p.length <= 24) { s.color = c === 'Grey' ? 'Gray' : c; break; }
  }
  return s;
}

const cache = new Map<string, Specs>();
/** Cached parseSpecs (names change rarely; the cache is dropped when it grows past 50 000). */
export function specsOf(name: string): Specs {
  let v = cache.get(name);
  if (!v) {
    v = parseSpecs(name);
    if (cache.size > 50000) cache.clear();
    cache.set(name, v);
  }
  return v;
}
