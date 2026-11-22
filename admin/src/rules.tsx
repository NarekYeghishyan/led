import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { useT } from './pages';

/** Name rules of a site category (backend category-rules.ts). Any rule matches → the product goes in; inside a rule all filled fields must hold. */
export interface MatchRule { s?: string[]; w?: string[]; n?: string[]; a?: number[] }
type Field = 's' | 'w' | 'n';

/** "a, b, /x{1,2}/" → ['a', 'b', '/x{1,2}/'] — commas inside /…/ stay. */
export function splitItems(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    const tr = cur.trim();
    const inRe = tr.startsWith('/') && !(tr.length > 1 && tr.endsWith('/'));
    if (ch === ',' && !inRe) { if (tr) out.push(tr); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

interface TestResult { count: number; inStock: number; sample: { id: number; name: string; inStock: boolean }[] }

export function RulesEditor({ rules, accessIds, onChange }: { rules: MatchRule[]; accessIds: number[]; onChange: (r: MatchRule[]) => void }) {
  const { t, fmt } = useT();
  // text being typed, so "a, " doesn't jump while typing; the array is what gets saved
  const [text, setText] = useState<Record<string, string>>({});
  const [test, setTest] = useState<TestResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = (i: number, f: Field) => `${i}.${f}`;
  const value = (i: number, f: Field) => text[key(i, f)] ?? (rules[i]?.[f] || []).join(', ');
  const edit = (i: number, f: Field, v: string) => {
    setText((x) => ({ ...x, [key(i, f)]: v }));
    const next = rules.map((r, j) => (j === i ? { ...r, [f]: splitItems(v) } : r));
    onChange(next);
    setTest(null);
  };
  const remove = (i: number) => { setText({}); onChange(rules.filter((_, j) => j !== i)); setTest(null); };
  async function check() {
    setBusy(true); setErr('');
    try { setTest(await api<TestResult>('/admin/product-categories/rules-test', { method: 'POST', body: JSON.stringify({ rules, accessIds }) })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const fields: [Field, string][] = [['s', t('rl.starts')], ['w', t('rl.contains')], ['n', t('rl.not')]];
  return (
    <>
      <h2>{t('rl.title')}</h2>
      <p className="muted small">{t('rl.note')}</p>
      {rules.map((r, i) => (
        <div key={i} className="sc-rule">
          <span className="sc-rule-n">{i + 1}</span>
          <div className="sc-rule-f">
            {fields.map(([f, label]) => (
              <label key={f}>{label}<input value={value(i, f)} onChange={(e) => edit(i, f, e.target.value)} placeholder={t(`rl.ph.${f}`)} /></label>
            ))}
            {r.a?.length ? <p className="muted small">{t('rl.access', { ids: r.a.join(', ') })}</p> : null}
          </div>
          <button type="button" className="ghost bad" title={t('rl.remove')} onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      {!rules.length && <p className="muted small">{t('rl.none')}</p>}
      <div className="sc-btns">
        <button type="button" className="secondary" onClick={() => { onChange([...rules, {}]); setTest(null); }}>＋ {t('rl.add')}</button>
        <button type="button" className="secondary" disabled={busy || (!rules.length && !accessIds.length)} onClick={check}>{t('rl.test')}</button>
      </div>
      {err && <div className="error">{err}</div>}
      {test && (
        <div className="sc-test">
          <b>{t('rl.result', { n: fmt.num(test.count, 0), s: fmt.num(test.inStock, 0) })}</b>
          <ul>{test.sample.map((p) => <li key={p.id} className={p.inStock ? '' : 'muted'}><Link to={`/products/${p.id}`}>{p.name}</Link></li>)}</ul>
          <p className="muted small">{t('rl.saveHint')}</p>
        </div>
      )}
    </>
  );
}
