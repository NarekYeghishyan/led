import { useState } from 'react';
import { useI18n } from './i18n';

export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'led_admin_theme';

function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage blocked */ }
  return 'auto';
}

function apply(t: Theme) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

apply(stored()); // before first render, no flash

const ICONS: Record<Theme, string> = { auto: '◐', light: '☀', dark: '☾' };

export function ThemeSwitch() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(stored);
  const pick = (v: Theme) => {
    setTheme(v);
    apply(v);
    try { v === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch { /* ignore */ }
  };
  return (
    <div className="theme">
      {(['auto', 'light', 'dark'] as Theme[]).map((v) => (
        <button key={v} type="button" className={v === theme ? 'on' : ''} title={t(`theme.${v}`)} aria-label={t(`theme.${v}`)} onClick={() => pick(v)}>
          {ICONS[v]}
        </button>
      ))}
    </div>
  );
}
