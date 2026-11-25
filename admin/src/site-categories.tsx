import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Category } from './api';
import type { MatchRule } from './rules';
import { useData, useT } from './pages';
import { IconPicker, IconSvg, type SiteIcon } from './site-icons';
import { RulesEditor } from './rules';

import { CategoryFilters } from './category-filters';

/** Storefront catalog tree (backend/src/site-categories.ts). Section → group → item. */

export interface SiteCat {
  id: number; parentId: number | null; sort: number; slug: string; nameRu: string; nameHy: string; nameEn: string;
  icon: string | null; promoRu: string | null; promoHy: string | null; promoEn: string | null; isVisible: boolean;
  accessCategoryIds: number[]; matchRules: MatchRule[]; filterKeys: string[] | null; productCount: number; inStockCount: number; updatedAt: string;
}
type Draft = Omit<SiteCat, 'id' | 'sort' | 'productCount' | 'inStockCount' | 'updatedAt'> & { id?: number };

const MAX_DEPTH = 3;

const empty = (parentId: number | null): Draft => ({
  parentId, slug: '', nameRu: '', nameHy: '', nameEn: '', icon: parentId === null ? 'pc' : null,
  promoRu: '', promoHy: '', promoEn: '', isVisible: true, accessCategoryIds: [], matchRules: [], filterKeys: null,
});

export function SiteCategoriesPage() {
  const { t, fmt } = useT();
  const [params, setParams] = useSearchParams();
  const [rev, setRev] = useState(0);
  const { data, error } = useData<SiteCat[]>(`/admin/site-categories?r=${rev}`);
  const { data: access } = useData<Category[]>('/admin/categories');
  const [iconRev, setIconRev] = useState(0);
  const { data: icons } = useData<SiteIcon[]>(`/admin/site-icons?r=${iconRev}`);
  const iconBy = useMemo(() => new Map((icons || []).map((i) => [i.key, i])), [icons]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = () => setRev((r) => r + 1);

  const byParent = useMemo(() => {
    const m = new Map<number | null, SiteCat[]>();
    for (const c of data || []) m.set(c.parentId, [...(m.get(c.parentId) || []), c]);
    for (const a of m.values()) a.sort((x, y) => x.sort - y.sort || x.id - y.id);
    return m;
  }, [data]);
  const byId = useMemo(() => new Map((data || []).map((c) => [c.id, c])), [data]);
  const depth = (c: SiteCat | undefined): number => (c ? 1 + depth(c.parentId === null ? undefined : byId.get(c.parentId)) : 0);
  const subtree = (id: number): number => 1 + (byParent.get(id) || []).reduce((n, c) => n + subtree(c.id), 0);
  const label = (c: SiteCat) => c.nameRu || c.nameEn || c.nameHy || '—';

  // open the editor for ?id= (kept in the URL so a reload shows the same category)
  const selId = Number(params.get('id')) || null;
  useEffect(() => {
    if (!data || !selId) return;
    const c = byId.get(selId);
    if (c && draft?.id !== c.id) {
      setDraft({ ...c, promoRu: c.promoRu ?? '', promoHy: c.promoHy ?? '', promoEn: c.promoEn ?? '' });
      setOpen((o) => { const n = new Set(o); for (let p = c.parentId; p !== null; p = byId.get(p)?.parentId ?? null) n.add(p); return n; });
    }
  }, [data, selId]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (c: SiteCat) => { setMsg(''); setErr(''); setParams({ id: String(c.id) }); setDraft({ ...c, promoRu: c.promoRu ?? '', promoHy: c.promoHy ?? '', promoEn: c.promoEn ?? '' }); };
  const addChild = (parentId: number | null) => {
    setMsg(''); setErr(''); setParams({}); setDraft(empty(parentId));
    if (parentId !== null) setOpen((o) => new Set(o).add(parentId));
  };
  const toggle = (id: number) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function run<T>(f: () => Promise<T>, ok?: string) {
    setBusy(true); setErr(''); setMsg('');
    try { const r = await f(); if (ok) setMsg(ok); reload(); return r; } catch (e) { setErr((e as Error).message); return null; } finally { setBusy(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const body = JSON.stringify(draft);
    const r = await run(() => draft.id
      ? api<SiteCat>(`/admin/site-categories/${draft.id}`, { method: 'PATCH', body })
      : api<SiteCat>('/admin/site-categories', { method: 'POST', body }), t('sc.saved'));
    if (r) { setParams({ id: String(r.id) }); setDraft({ ...r, promoRu: r.promoRu ?? '', promoHy: r.promoHy ?? '', promoEn: r.promoEn ?? '' }); }
  }
  async function remove() {
    if (!draft?.id) return;
    const n = subtree(draft.id);
    if (!confirm(n > 1 ? t('sc.confirmDelN', { n: n - 1 }) : t('sc.confirmDel'))) return;
    const r = await run(() => api(`/admin/site-categories/${draft.id}`, { method: 'DELETE' }), t('sc.deleted'));
    if (r) { setDraft(null); setParams({}); }
  }
  const move = (c: SiteCat, dir: 'up' | 'down') => run(() => api(`/admin/site-categories/${c.id}/move`, { method: 'POST', body: JSON.stringify({ dir }) }));
  const quickHide = (c: SiteCat) => run(() => api(`/admin/site-categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ isVisible: !c.isVisible }) }));

  // search: show matching categories with their parents
  const needle = q.trim().toLowerCase();
  const match = (c: SiteCat): boolean => !needle
    || [c.nameRu, c.nameHy, c.nameEn, c.slug].some((s) => s.toLowerCase().includes(needle))
    || (byParent.get(c.id) || []).some(match);

  function Row({ c, level }: { c: SiteCat; level: number }) {
    const kids = (byParent.get(c.id) || []).filter(match);
    const isOpen = open.has(c.id) || !!needle;
    const sibs = byParent.get(c.parentId) || [];
    const i = sibs.indexOf(c);
    return (
      <li>
        <div className={`sc-row${draft?.id === c.id ? ' sel' : ''}${c.isVisible ? '' : ' off'}`} style={{ paddingLeft: 6 + level * 20 }}>
          {byParent.get(c.id)?.length
            ? <button type="button" className="sc-tw" aria-label={isOpen ? t('sc.collapse') : t('sc.expand')} onClick={() => toggle(c.id)}>{isOpen ? '▾' : '▸'}</button>
            : <span className="sc-tw" />}
          <button type="button" className="sc-name" onClick={() => select(c)}>
            {level === 0 && <span className="sc-ic" title={c.icon || ''}><IconSvg icon={iconBy.get(c.icon || '')} size={18} /></span>}
            <span>{label(c)}</span>
            {(byParent.get(c.id)?.length ?? 0) > 0 && <small className="muted">{byParent.get(c.id)!.length}</small>}
            {!c.isVisible && <span className="tag bad">{t('sc.hidden')}</span>}
            {c.productCount > 0 && <span className={`tag${c.inStockCount ? ' ok' : ''}`} title={t('sc.linkedTip', { all: fmt.num(c.productCount, 0) })}>{fmt.num(c.inStockCount, 0)}</span>}
          </button>
          <span className="sc-act">
            <button type="button" className="ghost" title={t('sc.up')} disabled={busy || i <= 0} onClick={() => move(c, 'up')}>↑</button>
            <button type="button" className="ghost" title={t('sc.down')} disabled={busy || i >= sibs.length - 1} onClick={() => move(c, 'down')}>↓</button>
            <button type="button" className="ghost" title={c.isVisible ? t('sc.hide') : t('sc.show')} disabled={busy} onClick={() => quickHide(c)}>{c.isVisible ? '◉' : '○'}</button>
            {level < MAX_DEPTH - 1 && <button type="button" className="ghost" title={t('sc.addChild')} onClick={() => addChild(c.id)}>＋</button>}
          </span>
        </div>
        {isOpen && kids.length > 0 && <ul>{kids.map((k) => <Row key={k.id} c={k} level={level + 1} />)}</ul>}
      </li>
    );
  }

  const roots = (byParent.get(null) || []).filter(match);
  const total = data?.length ?? 0;

  return (
    <>
      <header className="page-head">
        <h1>{t('sc.title')} {data && <small>{total}</small>}</h1>
        <button onClick={() => addChild(null)}>＋ {t('sc.addSection')}</button>
        <a href="/" target="_blank" rel="noreferrer">{t('sc.openSite')} ↗</a>
      </header>
      <p className="muted">{t('sc.note')}</p>
      {error && <div className="error">{error}</div>}
      <div className="sc">
        <section className="card sc-tree">
          <div className="filters">
            <input placeholder={t('sc.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="ghost" onClick={() => setOpen(new Set((data || []).map((c) => c.id)))}>{t('sc.expandAll')}</button>
            <button type="button" className="ghost" onClick={() => setOpen(new Set())}>{t('sc.collapseAll')}</button>
          </div>
          {!data && !error && <p className="muted">…</p>}
          {data && !roots.length && <p className="muted">{t('sc.empty')}</p>}
          <ul className="sc-list">{roots.map((c) => <Row key={c.id} c={c} level={0} />)}</ul>
        </section>

        <section className="card sc-edit">
          {!draft && <p className="muted">{t('sc.pick')}</p>}
          {draft && (
            <Editor key={draft.id ?? `new-${draft.parentId}`} draft={draft} setDraft={setDraft} busy={busy} msg={msg} err={err}
              onSubmit={save} onDelete={remove} cats={data || []} byId={byId} depth={depth} subtree={subtree} access={access || []} label={label}
              icons={icons || []} onIconsChanged={() => { setIconRev((r) => r + 1); reload(); }} />
          )}
        </section>
      </div>
    </>
  );
}

function Editor({ draft, setDraft, busy, msg, err, onSubmit, onDelete, cats, byId, depth, subtree, access, label, icons, onIconsChanged }: {
  draft: Draft; setDraft: (d: Draft) => void; busy: boolean; msg: string; err: string; onSubmit: (e: FormEvent) => void;
  onDelete: () => void; cats: SiteCat[]; byId: Map<number, SiteCat>; depth: (c: SiteCat | undefined) => number;
  subtree: (id: number) => number; access: Category[]; label: (c: SiteCat) => string; icons: SiteIcon[]; onIconsChanged: () => void;
}) {
  const { t } = useT();
  const [picker, setPicker] = useState(false);
  const curIcon = icons.find((i) => i.key === (draft.icon || 'pc'));
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const isSection = draft.parentId === null;
  const parent = draft.parentId === null ? undefined : byId.get(draft.parentId);
  const level = depth(parent); // 0 = section, 1 = group, 2 = item
  const levelName = [t('sc.lvl.section'), t('sc.lvl.group'), t('sc.lvl.item')][level] ?? '';
  const path = (c: SiteCat | undefined): string => (c ? `${c.parentId === null ? '' : path(byId.get(c.parentId)) + ' › '}${label(c)}` : '');

  // where it can be moved: root or any category that keeps the tree ≤ 3 levels and is not inside itself
  const height = draft.id ? levelsBelow(draft.id, cats) : 1;
  const inside = (c: SiteCat): boolean => !!draft.id && (c.id === draft.id || (c.parentId !== null && inside(byId.get(c.parentId)!)));
  const parents = cats.filter((c) => !inside(c) && depth(c) + height <= MAX_DEPTH);

  const [aq, setAq] = useState('');
  const linked = draft.accessCategoryIds.map((id) => access.find((a) => a.externalId === id) || { externalId: id, name: `#${id}`, productCount: 0 } as Category);
  const found = aq.trim()
    ? access.filter((a) => !a.deletedAt && !draft.accessCategoryIds.includes(a.externalId)
      && (a.name.toLowerCase().includes(aq.trim().toLowerCase()) || String(a.externalId) === aq.trim())).slice(0, 8)
    : [];

  return (
    <form className="cu-form" onSubmit={onSubmit}>
      <h2>{draft.id ? label(draft as SiteCat) : t('sc.new')} <span className="badge">{levelName}</span></h2>
      {parent && <p className="muted small">{path(parent)}</p>}
      <div className="cu-grid sc-names">
        <label>{t('sc.nameRu')}<input value={draft.nameRu} onChange={(e) => set({ nameRu: e.target.value })} required autoFocus={!draft.id} /></label>
        <label>{t('sc.nameHy')}<input value={draft.nameHy} onChange={(e) => set({ nameHy: e.target.value })} lang="hy" /></label>
        <label>{t('sc.nameEn')}<input value={draft.nameEn} onChange={(e) => set({ nameEn: e.target.value })} lang="en" /></label>
        <label>{t('sc.slug')}<input value={draft.slug} onChange={(e) => set({ slug: e.target.value })} placeholder={t('sc.slugAuto')} className="mono" /></label>
      </div>
      {isSection && (
        <>
          <div className="sc-iconf">
            <span className="muted">{t('sc.icon')}</span>
            <button type="button" className="sc-iconbtn" onClick={() => setPicker(true)}>
              <span className="ic-site"><IconSvg icon={curIcon} size={22} /></span>
              <span>{curIcon?.name || draft.icon || '—'}</span>
              <span className="muted small">{t('sc.iconChange')}</span>
            </button>
          </div>
          {picker && <IconPicker icons={icons} value={draft.icon} onChanged={onIconsChanged} onClose={() => setPicker(false)}
            onPick={(key) => { set({ icon: key }); setPicker(false); }} />}
          <h2>{t('sc.promo')}</h2>
          <div className="cu-grid sc-names">
            <label>RU<input value={draft.promoRu ?? ''} onChange={(e) => set({ promoRu: e.target.value })} /></label>
            <label>HY<input value={draft.promoHy ?? ''} onChange={(e) => set({ promoHy: e.target.value })} lang="hy" /></label>
            <label>EN<input value={draft.promoEn ?? ''} onChange={(e) => set({ promoEn: e.target.value })} lang="en" /></label>
          </div>
        </>
      )}
      <label>{t('sc.parent')}
        <select value={draft.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">— {t('sc.root')} —</option>
          {parents.map((c) => <option key={c.id} value={c.id}>{path(c)}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={draft.isVisible} onChange={(e) => set({ isVisible: e.target.checked })} />{t('sc.visible')}</label>

      <h2>{t('sc.access')}</h2>
      <p className="muted small">{t('sc.accessNote')}</p>
      <div className="sc-chips">
        {linked.map((a) => (
          <span key={a.externalId} className="sc-chip">{a.name} <small className="muted">#{a.externalId} · {a.productCount}</small>
            <button type="button" aria-label="×" onClick={() => set({ accessCategoryIds: draft.accessCategoryIds.filter((x) => x !== a.externalId) })}>×</button>
          </span>
        ))}
        {!linked.length && <span className="muted small">{t('sc.noAccess')}</span>}
      </div>
      <input placeholder={t('sc.accessSearch')} value={aq} onChange={(e) => setAq(e.target.value)} />
      {found.length > 0 && (
        <div className="sc-found">
          {found.map((a) => (
            <button type="button" key={a.externalId} className="ghost" onClick={() => { set({ accessCategoryIds: [...draft.accessCategoryIds, a.externalId] }); setAq(''); }}>
              ＋ {a.name} <small className="muted">#{a.externalId} · {a.productCount}</small>
            </button>
          ))}
        </div>
      )}

      <RulesEditor rules={draft.matchRules || []} accessIds={draft.accessCategoryIds} onChange={(matchRules) => set({ matchRules })} />

      <CategoryFilters id={draft.id} value={draft.filterKeys ?? null} onChange={(filterKeys) => set({ filterKeys })}
        inherited={(() => { for (let c = draft.parentId === null ? undefined : byId.get(draft.parentId); c; c = c.parentId === null ? undefined : byId.get(c.parentId)) if (c.filterKeys) return { name: label(c) }; return null; })()} />

      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <div className="sc-btns">
        <button disabled={busy}>{draft.id ? t('sc.save') : t('sc.create')}</button>
        {draft.id && <button type="button" className="danger" disabled={busy} onClick={onDelete}>
          {t('sc.delete')}{subtree(draft.id) > 1 ? ` (+${subtree(draft.id) - 1})` : ''}</button>}
      </div>
    </form>
  );
}

/** How many levels the category spans with its children (itself = 1). */
function levelsBelow(id: number, cats: SiteCat[]): number {
  const kids = cats.filter((c) => c.parentId === id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => levelsBelow(k.id, cats))) : 0);
}
