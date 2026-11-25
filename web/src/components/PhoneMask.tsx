'use client';
/**
 * +374 XX XXX XXX mask for every phone field on the page (input[type=tel] / [inputmode=tel], also ones added later) —
 * port of site-src/phone_mask.html. Accepts pasted 0XX… / 374… / +374…; a form with an incomplete number does not submit
 * (field marked .tel-bad).
 */
import { useEffect } from 'react';

const SEL = 'input[inputmode="tel"],input[type="tel"]';
const fmt = (v: string): [string, number] => {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('374')) d = d.slice(3); else if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 8);
  let s = '+374';
  if (d.length) s += ` ${d.slice(0, 2)}`;
  if (d.length > 2) s += ` ${d.slice(2, 5)}`;
  if (d.length > 5) s += ` ${d.slice(5)}`;
  return [s, d.length];
};
const isTel = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.matches(SEL);
const full = (el: HTMLInputElement) => fmt(el.value)[1] === 8;

export function PhoneMask() {
  useEffect(() => {
    const focusin = (e: Event) => {
      const el = e.target; if (!isTel(el)) return;
      el.maxLength = 16; el.autocomplete = 'tel'; if (!el.value) el.value = '+374 ';
      setTimeout(() => el.setSelectionRange(el.value.length, el.value.length));
    };
    const focusout = (e: Event) => { const el = e.target; if (isTel(el) && fmt(el.value)[1] === 0) el.value = ''; };
    const input = (e: Event) => {
      const el = e.target; if (!isTel(el)) return;
      const atEnd = (el.selectionStart ?? 0) >= el.value.length;
      el.value = fmt(el.value)[0];
      if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
      el.classList.toggle('tel-bad', el.classList.contains('tel-bad') && !full(el));
    };
    const keydown = (e: KeyboardEvent) => {
      const el = e.target; if (isTel(el) && e.key === 'Backspace' && (el.selectionStart ?? 0) <= 5 && (el.selectionEnd ?? 0) <= 5) e.preventDefault();
    };
    const submit = (e: Event) => {
      const bad = [...(e.target as HTMLElement).querySelectorAll<HTMLInputElement>(SEL)].filter((el) => !el.disabled && !full(el));
      if (bad.length) { e.preventDefault(); e.stopImmediatePropagation(); bad.forEach((el) => el.classList.add('tel-bad')); bad[0].focus(); }
    };
    document.addEventListener('focusin', focusin);
    document.addEventListener('focusout', focusout);
    document.addEventListener('input', input);
    document.addEventListener('keydown', keydown);
    document.addEventListener('submit', submit, true);
    return () => {
      document.removeEventListener('focusin', focusin); document.removeEventListener('focusout', focusout);
      document.removeEventListener('input', input); document.removeEventListener('keydown', keydown);
      document.removeEventListener('submit', submit, true);
    };
  }, []);
  return null;
}
