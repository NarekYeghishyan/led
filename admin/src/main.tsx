import { StrictMode, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { api, auth } from './api';
import { CategoriesPage, DashboardPage, ProductPage, ProductsPage, SyncPage } from './pages';
import './styles.css';

function Login() {
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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>LED Computers</h1>
        <p className="muted">Admin panel</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="error">{error}</div>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function Layout() {
  const nav = useNavigate();
  if (!auth.token) return <Navigate to="/login" replace />;
  return (
    <div className="layout">
      <aside>
        <div className="brand">LED<span>Computers</span></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/products">Products</NavLink>
          <NavLink to="/categories">Categories</NavLink>
          <NavLink to="/sync">Sync</NavLink>
        </nav>
        <button className="link" onClick={() => { auth.set(null); nav('/login'); }}>Sign out</button>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:id" element={<ProductPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="sync" element={<SyncPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
