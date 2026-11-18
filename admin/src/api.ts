const TOKEN_KEY = 'led_admin_token';

export const auth = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string | null) {
    try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(`/api${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    auth.set(null);
    window.location.assign(`${import.meta.env.BASE_URL}login`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.message || res.statusText);
  return body as T;
}

export interface ProductRow {
  id: number; externalId: number; barcode: string | null; name: string; brand: string | null;
  unit: string | null; price: number | null; quantity: number; discontinued: boolean;
  inPriceList: boolean; isVisible: boolean; deletedAt: string | null; syncedAt: string | null;
  categoryExternalId: number | null; categoryName: string | null; currencyName: string | null;
}
export interface Paged<T> { items: T[]; total: number; page: number; limit: number }
export interface Category { id: number; externalId: number; name: string; productCount: number; deletedAt: string | null }
export interface Stats {
  products: number; inStock: number; outOfStock: number; deleted: number; categories: number; lastSyncAt: string | null;
  agentSeenAt: string | null; agentVersion: string | null; agentError: string | null;
}
export interface ChangeRow {
  id: string; at: string; entity: string; action: 'created' | 'updated' | 'restored' | 'deleted';
  externalId: number; name: string | null; changes: Record<string, [unknown, unknown]>;
}
export interface SyncLogRow {
  id: number; receivedAt: string; entity: string; batchId: string | null; upserts: number; deletes: number;
  agentVersion: string | null; error: string | null;
}

/** Locale-aware formatters; get them with useFmt() in pages. */
export function makeFmt(locale: string, t: (k: 'ago.never' | 'ago.s' | 'ago.m' | 'ago.h' | 'ago.d', v?: Record<string, number>) => string) {
  return {
    date: (s: string | null) => (s ? new Date(s).toLocaleString(locale) : '—'),
    num: (n: number | null | undefined, digits = 2) =>
      n === null || n === undefined ? '—' : n.toLocaleString(locale, { maximumFractionDigits: digits }),
    ago(s: string | null) {
      if (!s) return t('ago.never');
      const sec = Math.round((Date.now() - new Date(s).getTime()) / 1000);
      if (sec < 60) return t('ago.s', { n: Math.max(sec, 0) });
      if (sec < 3600) return t('ago.m', { n: Math.round(sec / 60) });
      if (sec < 86400) return t('ago.h', { n: Math.round(sec / 3600) });
      return t('ago.d', { n: Math.round(sec / 86400) });
    },
  };
}
