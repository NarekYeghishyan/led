'use client';
/**
 * Customer accounts → /api/shop (backend/src/shop.ts), same contract as the templates' site-src/auth.html:
 * session = httpOnly cookie (never readable here); localStorage 'led-user' / 'led-adr' only cache the customer's own
 * name / phone / addresses for checkout prefill (and the static pages' header link).
 */
import type { Lang } from './i18n';
import { fixLinks } from './pages';

export const REGIONS: [string, string, string, string][] = [['Yerevan', 'Ереван', 'Երևան', 'Yerevan'], ['Aragatsotn', 'Арагацотн', 'Արագածոտն', 'Aragatsotn'],
  ['Ararat', 'Арарат', 'Արարատ', 'Ararat'], ['Armavir', 'Армавир', 'Արմավիր', 'Armavir'], ['Gegharkunik', 'Гегаркуник', 'Գեղարքունիք', 'Gegharkunik'],
  ['Kotayk', 'Котайк', 'Կոտայք', 'Kotayk'], ['Lori', 'Лори', 'Լոռի', 'Lori'], ['Shirak', 'Ширак', 'Շիրակ', 'Shirak'], ['Syunik', 'Сюник', 'Սյունիք', 'Syunik'],
  ['Tavush', 'Тавуш', 'Տավուշ', 'Tavush'], ['Vayots Dzor', 'Вайоц Дзор', 'Վայոց ձոր', 'Vayots Dzor'], ['Outside Armenia', 'За пределами Армении', 'Հայաստանից դուրս', 'Outside Armenia']];
const LI: Record<Lang, number> = { ru: 0, hy: 1, en: 2 };
export const regionName = (v: string | null | undefined, lang: Lang) => { const r = REGIONS.find((x) => x[0] === v); return r ? r[1 + LI[lang]] : v || ''; };

/** API error codes → message (may contain links to the login / reset pages). [ru, hy, en] */
const E: Record<string, [string, string, string]> = {
  bad_login: ['Неверный логин или пароль', 'Սխալ մուտքանուն կամ գաղտնաբառ', 'Wrong login or password'],
  reset_required: ['Для этого аккаунта нужно задать новый пароль — <a href="/forgot-password.html">восстановить пароль</a>', 'Այս հաշվի համար անհրաժեշտ է նոր գաղտնաբառ՝ <a href="/forgot-password.html">վերականգնել գաղտնաբառը</a>', 'This account needs a new password — <a href="/forgot-password.html">reset your password</a>'],
  blocked: ['Аккаунт заблокирован. Позвоните нам: 010 502-802', 'Հաշիվն արգելափակված է։ Զանգահարեք՝ 010 502‑802', 'The account is blocked. Call us: 010 502-802'],
  phone_taken: ['Этот номер уже зарегистрирован. <a href="/login.html">Войдите</a> или <a href="/forgot-password.html">восстановите пароль</a>.', 'Այս համարն արդեն գրանցված է։ <a href="/login.html">Մուտք գործեք</a> կամ <a href="/forgot-password.html">վերականգնեք գաղտնաբառը</a>։', 'This number is already registered. <a href="/login.html">Log in</a> or <a href="/forgot-password.html">reset your password</a>.'],
  bad_phone: ['Введите номер в формате +374 XX XXX XXX', 'Մուտքագրեք համարը +374 XX XXX XXX ձևաչափով', 'Enter the number as +374 XX XXX XXX'],
  weak_password: ['Пароль — не менее 6 символов', 'Գաղտնաբառը՝ առնվազն 6 նիշ', 'Password: at least 6 characters'],
  no_login: ['Введите телефон или e-mail', 'Մուտքագրեք հեռախոսը կամ էլ. հասցեն', 'Enter your phone or email'],
  bad_code: ['Неверный или просроченный код', 'Սխալ կամ ժամկետանց կոդ', 'Wrong or expired code'],
  too_many: ['Слишком много попыток. Попробуйте через 15 минут.', 'Չափազանց շատ փորձեր։ Փորձեք 15 րոպեից։', 'Too many attempts. Try again in 15 minutes.'],
  bad_old_password: ['Текущий пароль неверен', 'Ընթացիկ գաղտնաբառը սխալ է', 'Current password is wrong'],
  email_taken: ['Этот e-mail уже используется другим аккаунтом', 'Այս էլ. հասցեն արդեն օգտագործվում է այլ հաշվում', 'This email is used by another account'],
  bad_email: ['Неверный e-mail', 'Սխալ էլ. հասցե', 'Invalid email'],
  no_session: ['Сеанс закончился — <a href="/login.html">войдите снова</a>', 'Սեանսն ավարտվել է՝ <a href="/login.html">մուտք գործեք կրկին</a>', 'Session ended — <a href="/login.html">log in again</a>'],
  server: ['Ошибка сервера, попробуйте ещё раз', 'Սերվերի սխալ, փորձեք կրկին', 'Server error, please try again'],
  sms_off: ['У этого аккаунта нет e-mail, а SMS пока не подключены. Позвоните нам: 010 502-802 — менеджер поможет сменить пароль.', 'Այս հաշիվը էլ. հասցե չունի, իսկ SMS-ները դեռ միացված չեն։ Զանգահարեք՝ 010 502‑802, մենեջերը կօգնի փոխել գաղտնաբառը։', 'This account has no email and SMS is not available yet. Call us: 010 502-802 — a manager will help you change the password.'],
};
/** Error message as HTML (fixed, trusted strings; links point to the language's pages). */
export const errHtml = (code: string | undefined, lang: Lang) => fixLinks((E[code || 'server'] || E.server)[LI[lang]], lang);

export class ApiError extends Error { constructor(public code: string, public status: number, m?: string) { super(m || code); } }

export async function api<T = unknown>(path: string, o: { method?: string; body?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/shop${path}`, { method: o.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body ? JSON.stringify(o.body) : undefined });
  } catch { throw new ApiError('server', 0); }
  let d: { code?: string; message?: string } | null = null;
  try { d = await r.json(); } catch { /* empty */ }
  if (!r.ok) {
    if (r.status === 401 && path.startsWith('/me')) cache(null);
    throw new ApiError(d?.code || (r.status === 429 ? 'too_many' : r.status === 401 ? 'no_session' : 'server'), r.status, d?.message);
  }
  return d as T;
}

export interface Me {
  id: number; name: string | null; phone: string | null; email: string | null; login: string | null; city: string | null; address: string | null;
  type: 'consumer' | 'dealer' | 'corporate' | string; company: string | null; lawName: string | null; lawAddress: string | null;
  factualAddress: string | null; taxcode: string | null; bankinfo: string | null; addresses: Address[] | null; registeredAt: string | null;
  createdAt: string | null; adminView?: string | null; orderCount?: number;
}
export interface Address { l: string; city: string; a: string; def?: number }

/** Customer's own data for checkout prefill (same shape the templates use). null = logged out. */
export function cache(u: Me | null) {
  try {
    if (!u) { localStorage.removeItem('led-user'); localStorage.removeItem('led-adr'); }
    else {
      localStorage.setItem('led-user', JSON.stringify({ id: u.id, fname: u.name || '', name: u.name || '', phone: u.phone || '', email: u.email || '',
        login: u.login || '', city: regionName(u.city, 'ru'), address: u.address || '', type: u.type || 'consumer', company: u.company || u.lawName || '',
        law_name: u.lawName || '', taxcode: u.taxcode || '' }));
      localStorage.setItem('led-adr', JSON.stringify(u.addresses || []));
    }
  } catch { /* private mode */ }
  dispatchEvent(new Event('led:user'));
}
export const loggedIn = () => { try { return !!localStorage.getItem('led-user'); } catch { return false; } };
export const logout = () => api('/logout', { method: 'POST' }).catch(() => {}).finally(() => cache(null));
