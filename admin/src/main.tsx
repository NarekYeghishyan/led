import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, auth } from './api';
import { I18nProvider, LangSwitch, useI18n } from './i18n';
import { ThemeSwitch } from './theme';
import { CategoriesPage, DashboardPage, ImportPage, LogsPage, TablePage, TablesPage, ProductPage, ProductsPage, SyncPage } from './pages';
import { CustomerPage, CustomersPage } from './customers';
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
        <div className="login-head"><h1><img className="login-logo" src="/admin/logo.png" alt="LED Computers" /></h1><div className="switches"><ThemeSwitch /><LangSwitch /></div></div>
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
  const brand = <NavLink to="/" end className="brand" aria-label="LED Computers"><img src="/admin/logo.png" alt="LED Computers" /></NavLink>;
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
          <NavLink to="/" end><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/></svg>{t('nav.dashboard')}</NavLink>
          <NavLink to="/products"><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/></svg>{t('nav.products')}</NavLink>
          <NavLink to="/customers"><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6"/></svg>{t('nav.customers')}</NavLink>
          <NavLink to="/categories"><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l2-3h5l2 3h9v13H3z"/></svg>{t('nav.categories')}</NavLink>
          <NavLink to="/sync"><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M3 21v-5h5"/></svg>{t('nav.sync')}</NavLink>
          <NavLink to="/tables"><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>{t('nav.tables')}</NavLink>
          <NavLink to="/logs"><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/></svg>{t('nav.logs')}</NavLink>
          <NavLink to="/import"><svg className="ni" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>{t('nav.import')}</NavLink>
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
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerPage />} />
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
