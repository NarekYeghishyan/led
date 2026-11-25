'use client';
/**
 * Behaviour of the forms inside the template HTML of the info / account pages (port of site-src/info_shared.html
 * LEDInfoForm + site-src/auth.html): validation (required, min length, e-mail, "repeat password"), then
 *  - login     → POST /api/shop/login → ?next= or the account
 *  - register  → POST /api/shop/register → account profile
 *  - forgot    → 3 steps: send code (resend timer) → code + new password (strength bar) → done (logged in)
 * Errors from the API are shown in the form's .au-err box. Logged-in visitors on login / registration go to the account.
 */
import { useEffect } from 'react';
import { href, type Lang } from '@/lib/i18n';
import { api, ApiError, cache, errHtml, loggedIn, type Me } from '@/lib/auth';

type Data = Record<string, string>;

/** Validates like the templates; returns the form data or null (fields marked .bad, "doesn't match" line shown). */
function validate(f: HTMLFormElement): Data | null {
  let ok = true, mm = false;
  f.querySelectorAll<HTMLInputElement>('[data-same]').forEach((x) => {
    const o = f.querySelector<HTMLInputElement>(`[name="${x.dataset.same}"]`);
    if (o && x.value && x.value !== o.value) { x.classList.add('bad'); ok = false; mm = true; }
  });
  const mis = f.querySelector<HTMLElement>('.rg-mis');
  if (mis) { mis.hidden = !mm; mis.textContent = mm ? mis.dataset.mis || '' : ''; }
  f.querySelectorAll<HTMLInputElement>('[required]:not(:disabled)').forEach((x) => {
    if (x.closest('[hidden]')) return;
    const v = x.value.trim();
    const bad = !v || (x.minLength > 0 && v.length < x.minLength) || (x.type === 'email' && !/^\S+@\S+\.\S+$/.test(x.value));
    const sameOk = !x.dataset.same || x.value === f.querySelector<HTMLInputElement>(`[name="${x.dataset.same}"]`)?.value;
    if (bad || sameOk) x.classList.toggle('bad', bad);
    if (bad) ok = false;
  });
  return ok ? Object.fromEntries(new FormData(f) as unknown as Iterable<[string, string]>) : null;
}

/** Runs `fn` after validation; shows API errors in the form; disables the button meanwhile. */
function bind(f: HTMLFormElement | null, lang: Lang, fn: (d: Data) => Promise<unknown>) {
  if (!f || f.dataset.bound) return () => {};
  f.dataset.bound = '1';
  const err = f.querySelector<HTMLElement>('.au-err');
  const show = (e: unknown) => { if (!err) return; err.hidden = !e; err.innerHTML = e ? errHtml(e instanceof ApiError ? e.code : 'server', lang) : ''; };
  const on = async (e: SubmitEvent) => {
    e.preventDefault();
    if (e.defaultPrevented && f.querySelector('.tel-bad')) return; // phone mask refused it
    const d = validate(f);
    if (!d) return;
    const b = f.querySelector<HTMLButtonElement>('button[type=submit]');
    show(null); if (b) b.disabled = true;
    try { await fn(d); } catch (x) { show(x); } finally { if (b) b.disabled = false; }
  };
  f.addEventListener('submit', on);
  f.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => i.classList.remove('bad')));
  return () => { f.removeEventListener('submit', on); delete f.dataset.bound; };
}

export function InfoForms({ lang }: { lang: Lang }) {
  useEffect(() => {
    const root = document.querySelector('.ip-main');
    if (!root) return;
    const off: (() => void)[] = [];
    const account = href(lang, '/account');
    const next = () => { const n = new URLSearchParams(location.search).get('next'); return n && /^\/(?!\/)/.test(n) ? n : account; };

    // already logged in → login / registration open the account (after checking the session is still alive)
    if (root.querySelector('form[data-api=login],form[data-api=register]') && loggedIn()) {
      api<Me>('/me').then((u) => { cache(u); location.replace(next()); }).catch(() => {});
    }
    root.querySelectorAll<HTMLFormElement>('form[data-api=login]').forEach((f) => off.push(bind(f, lang, (d) =>
      api<Me>('/login', { method: 'POST', body: { login: d.login, password: d.password, remember: !!d.remember } })
        .then((u) => { cache(u); location.href = next(); }))));
    root.querySelectorAll<HTMLFormElement>('form[data-api=register]').forEach((f) => off.push(bind(f, lang, (d) =>
      api<Me>('/register', { method: 'POST', body: { phone: d.phone, password: d.password } })
        .then((u) => { cache(u); location.href = `${account}#profile`; }))));

    // contacts "write to us": no message inbox on the server yet → opens the visitor's mail app with the message filled in
    root.querySelectorAll<HTMLFormElement>('form.ip-form:not([data-api]):not(.fp-1):not(.fp-2)').forEach((f) => off.push(bind(f, lang, async (d) => {
      const sel = f.querySelector<HTMLSelectElement>('select[name=dept]');
      const dept = sel?.selectedOptions[0]?.text || '';
      const to = sel && sel.selectedIndex === sel.options.length - 1 ? 'service@led.am' : 'led@led.am'; // last option = service centre
      const body = `${d.msg}\n\n${d.name}${d.phone ? `\n${d.phone}` : ''}\n${d.email}`;
      location.href = `mailto:${to}?subject=${encodeURIComponent(`led.am — ${dept}`)}&body=${encodeURIComponent(body)}`;
    })));

    // forgot password: 3 steps
    root.querySelectorAll<HTMLElement>('.fp-w').forEach((w) => {
      const f1 = w.querySelector<HTMLFormElement>('.fp-1'), f2 = w.querySelector<HTMLFormElement>('.fp-2'), f3 = w.querySelector<HTMLElement>('.fp-3');
      const re = w.querySelector<HTMLButtonElement>('.fp-re'), note = w.querySelector<HTMLElement>('.fp-note');
      if (!f1 || !f2 || !f3 || !re) return;
      let tm: ReturnType<typeof setInterval> | undefined, who = '';
      const step = (i: number) => {
        f1.hidden = i !== 0; f2.hidden = i !== 1; f3.hidden = i !== 2;
        w.querySelectorAll<HTMLElement>('.fp-steps span').forEach((s) => { const k = Number(s.dataset.i); s.classList.toggle('on', k === i); s.classList.toggle('dn', k < i); });
      };
      const count = () => {
        let n = 60; re.disabled = true; clearInterval(tm);
        const tick = () => { re.textContent = n > 0 ? `${re.dataset.w} ${n} ${re.dataset.s}` : re.dataset.t || ''; re.disabled = n > 0; if (n-- <= 0) clearInterval(tm); };
        tick(); tm = setInterval(tick, 1000);
      };
      const err2 = (e: unknown) => { const x = f2.querySelector<HTMLElement>('.au-err'); if (x) { x.hidden = !e; x.innerHTML = e ? errHtml(e instanceof ApiError ? e.code : 'server', lang) : ''; } };
      const send = () => api<{ to?: string; channel?: string; configured?: boolean }>('/password/forgot', { method: 'POST', body: { login: who, lang } }).then((r) => {
        const to = w.querySelector('.fp-to'); if (to) to.textContent = r.to || who;
        if (note) { const offSms = r.channel === 'sms' && !!r.to && !r.configured; note.hidden = !offSms; note.innerHTML = offSms ? errHtml('sms_off', lang) : ''; }
        step(1); count(); setTimeout(() => f2.querySelector<HTMLInputElement>('.fp-code')?.focus(), 50);
      });
      off.push(bind(f1, lang, (d) => { who = String(d.login || '').trim(); return send(); }));
      const chg = w.querySelector('.fp-chg');
      const onChg = (e: Event) => { e.preventDefault(); err2(null); step(0); };
      chg?.addEventListener('click', onChg);
      const onRe = () => { err2(null); send().catch(err2); };
      re.addEventListener('click', onRe);
      const code = f2.querySelector<HTMLInputElement>('.fp-code');
      const onCode = () => { if (code) code.value = code.value.replace(/\D/g, '').slice(0, 6); };
      code?.addEventListener('input', onCode);
      const pw = f2.querySelector<HTMLInputElement>('[name=password]'), bar = f2.querySelector<HTMLElement>('.fp-meter i');
      const onPw = () => {
        if (!pw || !bar) return;
        const v = pw.value;
        const sc = Number(v.length >= 6) + Number(v.length >= 10) + Number(/[A-Z]/.test(v)) + Number(/\d/.test(v)) + Number(/[^\w]/.test(v));
        bar.style.width = `${(sc / 5) * 100}%`;
        bar.style.background = ['#E5484D', '#E5484D', '#F5A524', '#F5A524', '#30A46C', '#30A46C'][sc];
      };
      pw?.addEventListener('input', onPw);
      off.push(bind(f2, lang, (d) => api<Me>('/password/reset', { method: 'POST', body: { login: who, code: d.code, password: d.password } })
        .then((u) => { clearInterval(tm); cache(u); f2.reset(); step(2); })));
      step(0);
      off.push(() => { clearInterval(tm); chg?.removeEventListener('click', onChg); re.removeEventListener('click', onRe); code?.removeEventListener('input', onCode); pw?.removeEventListener('input', onPw); });
    });
    return () => off.forEach((f) => f());
  }, [lang]);
  return null;
}
