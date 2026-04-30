import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { DashboardStatsProvider, useDashboardStats } from './lib/DashboardStatsContext';
import { useI18n } from './lib/I18nContext';
import VinylBadge from './components/VinylBadge';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Collection = lazy(() => import('./pages/Collection'));
const CollectionWall = lazy(() => import('./pages/CollectionWall'));
const ReleaseDetail = lazy(() => import('./pages/ReleaseDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));
const Setup = lazy(() => import('./pages/Setup'));

function AppLoading() {
  const { t } = useI18n();

  return <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 text-slate-300">{t('app.loading')}</div>;
}

function AppLayoutFrame() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { badgeGenres } = useDashboardStats();

  return (
    <div className="min-h-screen bg-app text-slate-100">
      <div className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <header className="glass-panel mb-8 flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/" className="brand-lockup inline-flex items-center gap-5 text-slate-50 no-underline">
              <VinylBadge genres={badgeGenres} />
              <div>
                <p className="text-[11px] uppercase tracking-[0.38em] text-brand-200">{t('app.tagline')}</p>
                <h1 className="font-display text-4xl font-semibold tracking-wide">{t('app.name')}</h1>
              </div>
            </Link>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <nav className="flex flex-wrap gap-2">
              <NavLink to="/" end className={({ isActive }) => `nav-pill ${isActive ? 'nav-pill-active' : ''}`}>{t('nav.dashboard')}</NavLink>
              <NavLink to="/collection" className={({ isActive }) => `nav-pill ${isActive ? 'nav-pill-active' : ''}`}>{t('nav.collection')}</NavLink>
              <NavLink to="/wall" className={({ isActive }) => `nav-pill ${isActive ? 'nav-pill-active' : ''}`}>{t('nav.wall')}</NavLink>
              <NavLink to="/settings" className={({ isActive }) => `nav-pill ${isActive ? 'nav-pill-active' : ''}`}>{t('nav.settings')}</NavLink>
            </nav>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <label className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                <span className="mr-2">{t('language.label')}</span>
                <select value={locale} onChange={(event) => setLocale(event.target.value)} className="bg-transparent text-sm normal-case outline-none">
                  <option value="es" className="bg-slate-950">{t('language.es')}</option>
                  <option value="en" className="bg-slate-950">{t('language.en')}</option>
                </select>
              </label>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">{t('app.user')}: {user?.username}</span>
              <button type="button" onClick={logout} className="secondary-button">{t('app.logout')}</button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/wall" element={<CollectionWall />} />
              <Route path="/release/:id" element={<ReleaseDetail />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function AppLayout() {
  return (
    <DashboardStatsProvider>
      <AppLayoutFrame />
    </DashboardStatsProvider>
  );
}

function App() {
  const { loading, needsBootstrap, loggedIn } = useAuth();

  if (loading) {
    return <AppLoading />;
  }

  if (needsBootstrap) {
    return (
      <Suspense fallback={<AppLoading />}>
        <Setup />
      </Suspense>
    );
  }

  if (!loggedIn) {
    return (
      <Suspense fallback={<AppLoading />}>
        <Login />
      </Suspense>
    );
  }

  return <AppLayout />;
}

export default App;
