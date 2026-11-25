/**
 * Admin corrections of parsed specs (products.spec_edit, plan step 8), applied on top of the name parser everywhere the
 * storefront reads specs (filters, facets, cards, product page, compare). Kept in memory by product name (the parser is
 * keyed by name too), reloaded at most every 60 s or right after an admin save.
 */
import type { DataSource } from 'typeorm';

let edits = new Map<string, Record<string, string>>();
let at = 0;
let loading: Promise<void> | null = null;

export const dropSpecEdits = () => { at = 0; };
export const specEditsOf = (name: string) => edits.get(name);

export function loadSpecEdits(ds: DataSource) {
  if (Date.now() - at < 60000) return Promise.resolve();
  loading ||= ds.query(`SELECT name, spec_edit FROM products WHERE spec_edit <> '{}'::jsonb AND deleted_at IS NULL`)
    .then((rows: { name: string; spec_edit: Record<string, string> }[]) => { edits = new Map(rows.map((r) => [r.name, r.spec_edit])); at = Date.now(); })
    .finally(() => { loading = null; });
  return loading;
}
