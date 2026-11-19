import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, auth } from './api';
import { I18nProvider, LangSwitch, useI18n } from './i18n';
import { ThemeSwitch } from './theme';
import { CategoriesPage, DashboardPage, ImportPage, LogsPage, TablePage, TablesPage, ProductPage, ProductsPage, SyncPage } from './pages';
import './styles.css';

function Login() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      auth.set(r.token);
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('login.wrong') : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <div className="login-head"><h1>LED Computers</h1><div className="switches"><ThemeSwitch /><LangSwitch /></div></div>
        <p className="muted">{t('login.title')}</p>
        <label>{t('login.email')}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>{t('login.password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="error">{error}</div>}
        <button disabled={busy}>{busy ? t('login.busy') : t('login.submit')}</button>
      </form>
    </div>
  );
}

function Layout() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);

  // Close the drawer on navigation; Escape closes it; lock page scroll while open.
  useEffect(() => setOpen(false), [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [open]);

  if (!auth.token) return <Navigate to="/login" replace />;
  const brand = <div className="brand">LED<span>{t('brand.sub')}</span></div>;
  return (
    <div className={`layout${open ? ' menu-open' : ''}`}>
      <header className="topbar">
        <button className="burger" aria-label={t('nav.menu')} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
        {brand}
      </header>
      <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="sidebar">
        <div className="aside-head">
          {brand}
          <button className="close" aria-label={t('nav.close')} onClick={() => setOpen(false)}>×</button>
        </div>
        <nav>
          <NavLink to="/" end>{t('nav.dashboard')}</NavLink>
          <NavLink to="/products">{t('nav.products')}</NavLink>
          <NavLink to="/categories">{t('nav.categories')}</NavLink>
          <NavLink to="/sync">{t('nav.sync')}</NavLink>
          <NavLink to="/tables">{t('nav.tables')}</NavLink>
          <NavLink to="/logs">{t('nav.logs')}</NavLink>
          <NavLink to="/import">{t('nav.import')}</NavLink>
        </nav>
        <div className="switches"><LangSwitch /><ThemeSwitch /></div>
        <button className="link" onClick={() => { auth.set(null); nav('/login'); }}>{t('nav.signout')}</button>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/:id" element={<ProductPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="sync" element={<SyncPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="tables" element={<TablesPage />} />
            <Route path="tables/:name" element={<TablePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
