/**
 * "Site categories" → category form → Filters (plan step 8): which spec filters the category page shows.
 * Automatic = the storefront's rule (spec on ≥ 30 % of the in-stock products, ≥ 2 values). Own list = exactly the ticked
 * specs in this order (a spec is still hidden while no product has a value). Categories without their own list use the
 * nearest parent's list, else automatic. Brand and price filters are always shown.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

interface Key { k: string; names: [string, string, string]; n: number; values: number; auto: boolean }
const TX = {
  h: ['Фильтры на странице категории', 'Filters on the category page'],
  note: ['Бренд и цена показываются всегда. Здесь — фильтры по характеристикам.', 'Brand and price are always shown. These are the spec filters.'],
  auto: ['Автоматически', 'Automatic'], own: ['Свой список', 'Own list'],
  autoNote: ['Характеристика есть у ≥ 30 % товаров и имеет ≥ 2 значения. Сейчас:', 'Spec found on ≥ 30 % of products with ≥ 2 values. Now:'],
  inherit: ['Используется список родительской категории «{p}».', 'Uses the list of the parent category "{p}".'],
  ownNote: ['Отмеченные фильтры в этом порядке (↑ ↓). Подкатегории без своего списка используют этот.', 'Ticked filters in this order (↑ ↓). Subcategories without their own list use this one.'],
  prods: ['{n} товаров в наличии', '{n} products in stock'], has: ['у {n} тов., {v} знач.', '{n} products, {v} values'],
  none: ['—', '—'], newCat: ['Сохраните категорию, чтобы настроить фильтры.', 'Save the category to set up filters.'],
} as const;

export function CategoryFilters({ id, value, inherited, onChange }: {
  id?: number; value: string[] | null; inherited: { name: string } | null; onChange: (v: string[] | null) => void;
}) {
  const { lang } = useI18n() as { lang: 'ru' | 'en' };
  const tx = (k: keyof typeof TX, v: Record<string, string | number> = {}) => TX[k][lang === 'ru' ? 0 : 1].replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const [data, setData] = useState<{ products: number; keys: Key[] } | null>(null);
  useEffect(() => { if (id) api<{ products: number; keys: Key[] }>(`/admin/site-categories/${id}/filter-keys`).then(setData).catch(() => setData(null)); }, [id]);
  const name = (k: Key | undefined, key: string) => (k ? k.names[lang === 'ru' ? 0 : 2] : key);
  if (!id) return <><h2>{tx('h')}</h2><p className="muted small">{tx('newCat')}</p></>;
  const keys = data?.keys || [];
  const byK = new Map(keys.map((k) => [k.k, k]));
  const list = value || [];
  const order = [...list, ...keys.map((k) => k.k).filter((k) => !list.includes(k))];
  const move = (i: number, d: number) => { const b = [...list]; const j = i + d; if (j < 0 || j >= b.length) return; [b[i], b[j]] = [b[j], b[i]]; onChange(b); };

  return (
    <>
      <h2>{tx('h')}</h2>
      <p className="muted small">{tx('note')}{data ? ` ${tx('prods', { n: data.products })}.` : ''}</p>
      <div style={{ display: 'flex', gap: 14 }}>
        <label className="check"><input type="radio" checked={value === null} onChange={() => onChange(null)} /> {tx('auto')}</label>
        <label className="check"><input type="radio" checked={value !== null}
          onChange={() => onChange(keys.filter((k) => k.auto).map((k) => k.k))} /> {tx('own')}</label>
      </div>
      {value === null ? (
        inherited ? <p className="muted small">{tx('inherit', { p: inherited.name })}</p>
          : <p className="muted small">{tx('autoNote')} {keys.filter((k) => k.auto).map((k) => name(k, k.k)).join(', ') || tx('none')}</p>
      ) : (
        <>
          <p className="muted small">{tx('ownNote')}</p>
          <div style={{ display: 'grid', gap: 4 }}>
            {order.map((key) => {
              const k = byK.get(key), on = list.includes(key), i = list.indexOf(key);
              return (
                <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label className="check" style={{ flex: 1 }}>
                    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...list, key] : list.filter((x) => x !== key))} />
                    {name(k, key)} <small className="muted">{k ? tx('has', { n: k.n, v: k.values }) : tx('none')}</small>
                  </label>
                  {on ? <>
                    <button type="button" className="ghost" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="ghost" onClick={() => move(i, 1)}>↓</button>
                  </> : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
