import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './lib/AuthContext';
import { DashboardStatsProvider, useDashboardStats } from './lib/DashboardStatsContext';
import { useI18n } from './lib/I18nContext';
import VinylBadge from './components/VinylBadge';
import Icon, { type IconName } from './components/Icon';
import ErrorBoundary from './components/ErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Collection = lazy(() => import('./pages/Collection'));
const PrintCatalog = lazy(() => import('./pages/PrintCatalog'));
const Radar = lazy(() => import('./pages/Radar'));
const RadarReleaseDetail = lazy(() => import('./pages/RadarReleaseDetail'));
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
  const location = useLocation();

  if (location.pathname === '/collection/print') {
    return (
      <div className="min-h-screen bg-white text-slate-900">
        <Suspense fallback={<AppLoading />}>
          <Routes>
            <Route path="/collection/print" element={<PrintCatalog />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  const navItems: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
    { to: '/', label: t('nav.dashboard'), icon: 'dashboard', end: true },
    { to: '/collection', label: t('nav.collection'), icon: 'collection' },
    { to: '/radar', label: t('nav.radar'), icon: 'radar' },
    { to: '/wall', label: t('nav.wall'), icon: 'wall' },
    { to: '/settings', label: t('nav.settings'), icon: 'settings' },
  ];

  return (
    <div className="min-h-screen bg-app text-slate-100">
      <a href="#main" className="skip-link">{t('app.skipToContent')}</a>

      <aside className="app-sidebar" aria-label={t('app.name')}>
        <Link to="/" className="brand-lockup brand-lockup--compact">
          <VinylBadge genres={badgeGenres} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-brand-200">{t('app.tagline')}</p>
            <p className="font-display text-2xl font-semibold tracking-wide text-white">{t('app.name')}</p>
          </div>
        </Link>

        <nav className="mt-8 flex flex-col gap-1">
          <NavLink to="/" end className={({ isActive }) => `side-link ${isActive ? 'side-link--active' : ''}`}><Icon name="dashboard" />{t('nav.dashboard')}</NavLink>
          <NavLink to="/collection" className={({ isActive }) => `side-link ${isActive ? 'side-link--active' : ''}`}><Icon name="collection" />{t('nav.collection')}</NavLink>
          <NavLink to="/radar" className={({ isActive }) => `side-link ${isActive ? 'side-link--active' : ''}`}><Icon name="radar" />{t('nav.radar')}</NavLink>
          <NavLink to="/wall" className={({ isActive }) => `side-link ${isActive ? 'side-link--active' : ''}`}><Icon name="wall" />{t('nav.wall')}</NavLink>
          <NavLink to="/settings" className={({ isActive }) => `side-link ${isActive ? 'side-link--active' : ''}`}><Icon name="settings" />{t('nav.settings')}</NavLink>
        </nav>

        <div className="mt-auto space-y-3 border-t border-white/5 pt-5">
          <label className="flex items-center justify-between gap-2 rounded-xl bg-white/3 px-3 py-2 text-xs text-slate-400">
            <span className="flex items-center gap-2"><Icon name="globe" size={15} />{t('language.label')}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value)} className="bg-transparent text-sm text-slate-100 outline-hidden">
              <option value="es" className="bg-slate-950">{t('language.es')}</option>
              <option value="en" className="bg-slate-950">{t('language.en')}</option>
            </select>
          </label>
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-3">
              <span className="avatar-chip">{(user?.username || '?').slice(0, 1).toUpperCase()}</span>
              <span className="truncate text-sm text-slate-200">{user?.username}</span>
            </div>
            <button type="button" onClick={logout} className="icon-button" aria-label={t('app.logout')} title={t('app.logout')}>
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      <header className="app-topbar">
        <Link to="/" className="brand-lockup brand-lockup--compact">
          <VinylBadge genres={badgeGenres} />
          <span className="font-display text-xl font-semibold tracking-wide text-white">{t('app.name')}</span>
        </Link>
        <div className="flex items-center gap-2">
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            aria-label={t('language.label')}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs uppercase text-slate-200 outline-hidden"
          >
            <option value="es" className="bg-slate-950">ES</option>
            <option value="en" className="bg-slate-950">EN</option>
          </select>
          <button type="button" onClick={logout} className="icon-button" aria-label={t('app.logout')} title={t('app.logout')}>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>

      <div className="app-shell">
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/radar" element={<Radar />} />
              <Route path="/radar/:id" element={<RadarReleaseDetail />} />
              <Route path="/wall" element={<CollectionWall />} />
              <Route path="/release/:id" element={<ReleaseDetail />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <nav className="app-tabbar" aria-label={t('app.name')}>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tab-link ${isActive ? 'tab-link--active' : ''}`}>
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
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
