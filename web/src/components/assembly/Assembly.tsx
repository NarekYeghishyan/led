'use client';
/**
 * PC configurator (/assembly) — port of Design/site-src/assembly_page.html with REAL in-stock parts (lib/assembly.ts):
 * 16 rows in 4 groups (required ones marked *), qty, checks (CPU socket ↔ board, DDR type, PSU watts vs recommended),
 * progress, sticky summary, "add to cart" puts every part in the shared cart, print, reset.
 * Choices saved in localStorage `led-asm` as { row: { code, q } } (the home page "Top builds" → Configure preloads it).
 * Removed from the template: demo parts, "cash price −3 %".
 */
import { useEffect, useMemo, useState } from 'react';
import { href, money, type Lang } from '@/lib/i18n';
import { add, toast } from '@/lib/store';
import type { Part, RowKey } from '@/lib/assembly';
import { Icon } from '../Icon';

const T: Record<string, [string, string, string]> = {
  home: ['Գլխավոր', 'Главная', 'Home'], title: ['Հավաքիր քո համակարգիչը', 'Собери свою конфигурацию', 'Build your own PC'],
  sub: ['Ընտրեք բաղադրիչները․ մենք կստուգենք համատեղելիությունը, կհավաքենք և կփորձարկենք անվճար։', 'Выберите комплектующие — мы проверим совместимость, соберём и протестируем ПК бесплатно.', 'Pick the parts — we check compatibility, assemble and test the PC for free.'],
  g1: ['Համակարգի հիմքը', 'Основа системы', 'Core'], g2: ['Պահեստ և գրաֆիկա', 'Хранение и графика', 'Storage & graphics'], g3: ['Կորպուս և սնուցում', 'Корпус и питание', 'Case & power'], g4: ['Ծայրամասային սարքեր', 'Периферия', 'Peripherals'],
  pick: ['Ընտրեք ապրանքը', 'Выберите продукт', 'Select a product'], none: ['— պետք չէ —', '— не нужно —', '— not needed —'], out: ['Առկա չէ', 'Нет в наличии', 'Not in stock'],
  prog: ['Ընտրված պարտադիր բաղադրիչներ', 'Обязательных компонентов выбрано', 'Required parts selected'],
  sum: ['Ձեր հավաքածուն', 'Ваша сборка', 'Your build'], empty: ['Դեռ ոչինչ ընտրված չէ', 'Пока ничего не выбрано', 'Nothing selected yet'],
  total: ['Ընդամենը', 'Итого', 'Total'],
  note: ['Հավաքումը և փորձարկումը՝ անվճար։ Գները՝ առկա ապրանքների ընթացիկ գներն են։', 'Сборка и тестирование — бесплатно. Цены — текущие цены товаров в наличии.', 'Assembly and testing are free. Prices are the current prices of in-stock items.'],
  add: ['Ավելացնել զամբյուղ', 'Добавить в корзину', 'Add to cart'], added: ['Հավաքածուն ավելացվեց զամբյուղ', 'Сборка добавлена в корзину', 'Build added to cart'], go: ['Անցնել', 'Перейти', 'Open'],
  print: ['Տպել', 'Распечатать', 'Print'], reset: ['Զրոյացնել', 'Сбросить', 'Reset'], cleared: ['Կոնֆիգուրացիան մաքրվեց', 'Конфигурация очищена', 'Build cleared'],
  compOk: ['Բաղադրիչները համատեղելի են', 'Компоненты совместимы', 'Parts are compatible'], compBad: ['Կան համատեղելիության դիտողություններ', 'Есть замечания по совместимости', 'Compatibility warnings'],
  sock: ['Պրոցեսորի սոկետը չի համընկնում մայրական սալիկի հետ', 'Сокет процессора не совпадает с материнской платой', 'CPU socket does not match the motherboard'],
  ramw: ['Հիշողության տեսակը չի համապատասխանում մայրական սալիկին', 'Тип памяти не подходит к материнской плате', 'Memory type does not fit the motherboard'],
  psuw: ['Սնուցման բլոկի հզորությունը կարող է չբավարարել (խորհուրդ է տրվում', 'Мощности блока питания может не хватить (рекомендуется от', 'PSU may be too weak (recommended at least'],
  need: ['Խորհուրդ տրվող սնուցման հզորություն', 'Рекомендуемая мощность БП', 'Recommended PSU'], w: ['Վտ', 'Вт', 'W'],
  mb: ['Մայրական սալիկներ', 'Материнские платы', 'Motherboards'], cpu: ['Պրոցեսորներ', 'Процессоры', 'Processors'], cool: ['Սառեցում', 'Охлаждение', 'Cooling'], ram: ['Հիշողության մոդուլներ', 'Модули памяти', 'Memory'],
  hdd: ['Կոշտ սկավառակներ', 'Жесткие диски', 'Hard drives'], ssd: ['SSD կրիչներ', 'Накопители SSD', 'SSD drives'], gpu: ['Վիդեոքարտեր', 'Видеокарты', 'Graphics cards'], odd: ['Դիսկովոդներ', 'Дисководы', 'Optical drives'],
  case: ['Կորպուսներ', 'Корпуса', 'Cases'], psu: ['Սնուցման բլոկներ', 'Блоки питания', 'Power supplies'], kb: ['Ստեղնաշարեր', 'Клавиатуры', 'Keyboards'], mouse: ['Մկնիկներ', 'Мышки', 'Mice'],
  head: ['Ականջակալներ', 'Наушники', 'Headsets'], cam: ['Վեբ տեսախցիկներ', 'Веб камеры', 'Webcams'], mon: ['Մոնիտորներ', 'Мониторы', 'Monitors'], ups: ['Անխափան սնուցման սարքեր', 'ИБП', 'UPS'],
};
const ROWS: [string, [RowKey, string, boolean][]][] = [
  ['g1', [['mb', 'pc', true], ['cpu', 'cpu', true], ['cool', 'spark', false], ['ram', 'grid', true]]],
  ['g2', [['ssd', 'doc', true], ['hdd', 'doc', false], ['gpu', 'monitor', false], ['odd', 'doc', false]]],
  ['g3', [['case', 'tower', true], ['psu', 'ups', true]]],
  ['g4', [['mon', 'monitor', false], ['kb', 'kb', false], ['mouse', 'kb', false], ['head', 'head', false], ['cam', 'user', false], ['ups', 'ups', false]]],
];
const KEY = 'led-asm';
type State = Partial<Record<RowKey, { code: number; q: number }>>;

export function Assembly({ lang, parts }: { lang: Lang; parts: Record<RowKey, Part[]> }) {
  const L = { hy: 0, ru: 1, en: 2 }[lang];
  const tx = (k: string) => (T[k] ?? [k, k, k])[L];
  const [st, setSt] = useState<State>({});
  useEffect(() => { try { setSt(JSON.parse(localStorage.getItem(KEY) || '{}') || {}); } catch { /* empty */ } }, []);
  const save = (v: State) => { setSt(v); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* full */ } };
  const sel = (k: RowKey) => { const c = st[k]?.code; return c ? parts[k].find((p) => p.code === c) : undefined; };

  const { chosen, goods, need, iss } = useMemo(() => {
    const ch: [RowKey, Part, number][] = [];
    let g = 0, w = 0;
    for (const [, rows] of ROWS) for (const [k] of rows) {
      const x = sel(k); if (!x) continue;
      const q = st[k]?.q || 1; g += x.price * q; w += (x.w || 0) * q; ch.push([k, x, q]);
    }
    const nd = w ? Math.ceil((w * 1.4 + 50) / 50) * 50 : 0;
    const mb = sel('mb'), cpu = sel('cpu'), ram = sel('ram'), psu = sel('psu');
    const is: [RowKey, string][] = [];
    if (mb?.s && cpu?.s && mb.s !== cpu.s) is.push(['cpu', tx('sock')]);
    if (mb?.m && ram?.m && mb.m !== ram.m) is.push(['ram', tx('ramw')]);
    if (psu?.p && nd && psu.p < nd) is.push(['psu', `${tx('psuw')} ${nd} ${tx('w')})`]);
    return { chosen: ch, goods: g, need: nd, iss: is };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, parts, lang]);

  const req = ROWS.flatMap((g) => g[1]).filter((r) => r[2]);
  const done = req.filter((r) => sel(r[0])).length;
  const toCart = () => {
    for (const [, x, q] of chosen) {
      add('cart', { id: `p${x.code}`, code: x.code, t: x.name, img: x.image || `/img/placeholder/${x.section || 'default'}.svg`, p: x.price, url: href(lang, `/product/${x.slug}`) }, q);
    }
    toast(tx('added'), tx('go'), href(lang, '/cart'));
  };

  return (
    <main className="wrap asm">
      <nav className="crumbs" aria-label="breadcrumb"><a href={href(lang, '/')}>{tx('home')}</a><span>/</span><b>{tx('title')}</b></nav>
      <div className="asm-head"><div><h1><span className="ic"><Icon name="tool" /></span>{tx('title')}</h1><p>{tx('sub')}</p></div></div>
      <div className="asm-grid">
        <div>
          <div className="asm-card asm-prog"><Icon name="check" /><div>
            <small>{tx('prog')}: <b>{done} / {req.length}</b>{need ? <> · {tx('need')}: <b>{need} {tx('w')}</b></> : null}</small>
            <div className="asm-bar"><i style={{ width: `${(done / req.length) * 100}%` }} /></div>
          </div></div>
          {ROWS.map(([g, rows]) => (
            <div key={g}>
              <div className="asm-grp">{tx(g)}</div>
              <div className="asm-card">
                {rows.map(([k, icon, r]) => {
                  const x = sel(k), q = st[k]?.q || 1, w = iss.filter((i) => i[0] === k), list = parts[k];
                  return (
                    <div key={k} className={`asm-row${x ? ' on' : ''}`}>
                      <span className="ic"><Icon name={icon} /></span>
                      <b>{tx(k)}{r ? <em>*</em> : null}</b>
                      <select aria-label={tx(k)} value={x ? String(x.code) : ''} disabled={!list.length}
                        onChange={(e) => { const v = { ...st }; if (e.target.value) v[k] = { code: Number(e.target.value), q: 1 }; else delete v[k]; save(v); }}>
                        <option value="">{!list.length ? tx('out') : x ? tx('none') : tx('pick')}</option>
                        {list.map((p) => <option key={p.code} value={p.code}>{p.name} — {money(p.price)}</option>)}
                      </select>
                      <span className="asm-q">{x ? <>
                        <button aria-label="−" onClick={() => save({ ...st, [k]: { code: x.code, q: Math.max(1, q - 1) } })}>−</button><span>{q}</span>
                        <button aria-label="+" onClick={() => save({ ...st, [k]: { code: x.code, q: Math.min(8, q + 1) } })}>+</button>
                      </> : <span>—</span>}</span>
                      <span className="pr">{x ? <a href={href(lang, `/product/${x.slug}`)} style={{ color: 'inherit', textDecoration: 'none' }}>{money(x.price * q)}</a> : money(0)}</span>
                      {x ? <button className="x" aria-label="×" onClick={() => { const v = { ...st }; delete v[k]; save(v); }}>×</button> : <span />}
                      {w.map((i, n) => <div key={n} className="asm-warn">⚠ {i[1]}</div>)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <aside className="asm-card asm-sum">
          <h3>{tx('sum')}</h3>
          {chosen.length
            ? <ul>{chosen.map(([k, x, q]) => <li key={k}><span>{tx(k)}{q > 1 ? ` ×${q}` : ''}</span><b>{money(x.price * q)}</b></li>)}</ul>
            : <p className="asm-note">{tx('empty')}</p>}
          {chosen.length > 1 ? <div className={`asm-ok${iss.length ? ' bad' : ''}`}>{iss.length ? `⚠ ${tx('compBad')}` : `✓ ${tx('compOk')}`}</div> : null}
          <div className="asm-tot"><span>{tx('total')}</span><b>{money(goods)}</b></div>
          <p className="asm-note">{tx('note')}</p>
          <button className="asm-b p big" disabled={!chosen.length} onClick={toCart}><Icon name="cart" /> {tx('add')}</button>
          <div className="asm-tools">
            <button className="asm-b" onClick={() => print()}>{tx('print')}</button>
            <button className="asm-b" onClick={() => { save({}); toast(tx('cleared')); }}>{tx('reset')}</button>
          </div>
        </aside>
      </div>
    </main>
  );
}
