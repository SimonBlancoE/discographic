import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConfettiBurst from '../components/ConfettiBurst';
import AchievementsPanel from '../components/AchievementsPanel';
import { DashboardSkeleton } from '../components/LoadingSkeletons';
import RandomReleaseCard from '../components/RandomReleaseCard';
import StylesChart from '../components/charts/StylesChart';
import DecadeChart from '../components/charts/DecadeChart';
import FormatChart from '../components/charts/FormatChart';
import GenreChart from '../components/charts/GenreChart';
import GrowthChart from '../components/charts/GrowthChart';
import LabelChart from '../components/charts/LabelChart';
import SyncButton from '../components/SyncButton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { api } from '../lib/api';
import { buildAchievements } from '../lib/achievements';
import { useAuth } from '../lib/AuthContext';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';

const MILESTONES = [100, 500, 1000, 2500, 5000];

function getMilestone(total) {
  return [...MILESTONES].reverse().find((milestone) => total >= milestone) || null;
}

function ratio(value, total) {
  if (!total) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function HeroPanel({ stats }) {
  const { locale, t } = useI18n();
  const reducedMotion = useReducedMotion();
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  function handleMove(event) {
    if (reducedMotion) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) - 0.5;
    const y = ((event.clientY - bounds.top) / bounds.height) - 0.5;
    setPointer({ x, y });
  }

  function resetPointer() {
    setPointer({ x: 0, y: 0 });
  }

  const chipStyle = (multiplier) => reducedMotion ? undefined : {
    transform: `translate3d(${pointer.x * multiplier}px, ${pointer.y * multiplier}px, 0)`
  };

  return (
    <div className="hero-panel" onMouseMove={handleMove} onMouseLeave={resetPointer}>
      <span className="hero-orb hero-orb--cyan" style={chipStyle(-18)} />
      <span className="hero-orb hero-orb--rose" style={chipStyle(24)} />
      <div className="relative z-10 flex h-full flex-col justify-between gap-8">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('dashboard.heroEyebrow')}</p>
          <h2 className="mt-3 font-display text-4xl text-white sm:text-5xl">{t('dashboard.heroTitle')}</h2>
          <p className="mt-4 max-w-2xl text-base text-slate-300">
            {t('dashboard.heroSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="hero-chip rounded-full border border-white/10 bg-white/5 px-4 py-2" style={chipStyle(14)}>
            {t('dashboard.lastSync', { date: formatDate(stats.lastSync?.finished_at) })}
          </span>
          <span className="hero-chip rounded-full border border-white/10 bg-white/5 px-4 py-2" style={chipStyle(-12)}>
            {t('dashboard.syncedRecords', { count: formatNumber(stats.lastSync?.records_synced || 0) })}
          </span>
          <span className="hero-chip rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-cyan-100" style={chipStyle(18)}>
            {t('dashboard.mappedStyles', { count: formatNumber(stats.styles.length) })}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, displayValue, accent, meta, eyebrow, description }) {

  return (
    <div className="glass-panel stat-card relative overflow-hidden p-5">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{label}</p>
            <p className="mt-4 font-display text-4xl text-slate-50">{displayValue}</p>
          </div>
          {meta ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">{meta}</span> : null}
        </div>
        <div className="rounded-[24px] border border-white/5 bg-slate-950/35 px-4 py-3">
          {eyebrow ? <p className="text-xs uppercase tracking-[0.25em] text-brand-200/80">{eyebrow}</p> : null}
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, description, hint, children }) {
  return (
    <section className="glass-panel p-5">
      <div className="mb-4">
        <h3 className="font-display text-xl text-slate-50">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
        {hint ? <p className="mt-2 text-xs uppercase tracking-[0.25em] text-brand-200/80">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function CoverageMetric({ label, value, total, tone, helper }) {
  const percent = ratio(value, total);
  const remaining = Math.max(total - value, 0);

  return (
    <div className="rounded-[26px] border border-white/5 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
          <p className="mt-3 font-display text-3xl text-white">{percent}%</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.25em] ${tone}`}>{value}/{total}</span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-950/75">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 via-amber-300 to-cyan-300" style={{ width: `${Math.max(percent, value ? 10 : 0)}%` }} />
      </div>
      <p className="mt-3 text-sm text-slate-400">{helper(remaining)}</p>
    </div>
  );
}

function CoveragePanel({ totals }) {
  const { t } = useI18n();
  const total = totals.total_records || 0;
  const rated = totals.rated_records || 0;
  const notes = totals.notes_records || 0;
  const priced = totals.priced_records || 0;
  const readiness = total ? Math.round(((rated + notes + priced) / (total * 3)) * 100) : 0;

  return (
    <section className="glass-panel space-y-6 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="font-display text-2xl text-white">{t('dashboard.coverageTitle')}</h3>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            {t('dashboard.coverageSubtitle')}
          </p>
        </div>
        <div className="rounded-[30px] border border-white/8 bg-slate-950/45 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-200/80">{t('dashboard.readiness')}</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="font-display text-5xl text-white">{readiness}%</span>
            <span className="pb-2 text-sm text-slate-400">{t('dashboard.readinessBody')}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CoverageMetric label={t('collection.rating')} value={rated} total={total} tone="bg-rose-400/15 text-rose-100" helper={(remaining) => remaining > 0 ? t('dashboard.ratingsMissing', { count: formatNumber(remaining) }) : t('dashboard.ratingsDone')} />
        <CoverageMetric label={t('collection.notes')} value={notes} total={total} tone="bg-cyan-400/15 text-cyan-100" helper={(remaining) => remaining > 0 ? t('dashboard.notesMissing', { count: formatNumber(remaining) }) : t('dashboard.notesDone')} />
        <CoverageMetric label={t('collection.price')} value={priced} total={total} tone="bg-amber-300/15 text-amber-100" helper={(remaining) => remaining > 0 ? t('dashboard.pricesMissing', { count: formatNumber(remaining) }) : t('dashboard.pricesDone')} />
      </div>
    </section>
  );
}

function Dashboard() {
  const { discogsConfigured, currency } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [milestoneLabel, setMilestoneLabel] = useState('');
  const milestoneTimeoutRef = useRef(null);

  function openCollectionFilter(key, value) {
    if (!value) {
      return;
    }

    navigate(`/collection?${new URLSearchParams({ [key]: value }).toString()}`);
  }

  async function load() {
    if (!discogsConfigured) {
      setStats(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const payload = await api.getStats();
      setStats(payload);

      const total = payload?.totals?.total_records || 0;
      const milestone = getMilestone(total);
      const milestoneKey = milestone ? `discographic-milestone-${milestone}` : '';

      if (milestone && !window.sessionStorage.getItem(milestoneKey)) {
        window.sessionStorage.setItem(milestoneKey, '1');
        setMilestoneLabel(t('dashboard.milestone', { count: formatNumber(milestone) }));
      }
    } catch (error) {
      toast.error(t('dashboard.loadError', { error: error.message }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [discogsConfigured]);

  useEffect(() => () => {
    if (milestoneTimeoutRef.current) {
      window.clearTimeout(milestoneTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!milestoneLabel) {
      return undefined;
    }

    milestoneTimeoutRef.current = window.setTimeout(() => setMilestoneLabel(''), 1800);
    return () => window.clearTimeout(milestoneTimeoutRef.current);
  }, [milestoneLabel]);

  const statCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      {
        label: t('dashboard.totalRecords'),
        displayValue: formatNumber(stats.totals.total_records || 0),
        accent: 'from-brand-400 to-brand-200',
        meta: t('dashboard.months', { count: stats.growth.length }),
        eyebrow: t('dashboard.realSize'),
        description: t('dashboard.totalRecordsDesc')
      },
      {
        label: t('dashboard.collectionValue'),
        displayValue: stats.totals.total_value || '-',
        accent: 'from-emerald-400 to-cyan-300',
        meta: 'Discogs',
        eyebrow: t('dashboard.marketToday'),
        description: t('dashboard.collectionValueDesc')
      },
      {
        label: t('dashboard.topArtist'),
        displayValue: formatNumber(stats.artists[0]?.count || 0),
        accent: 'from-sky-400 to-indigo-300',
        meta: stats.artists[0]?.artist || '-',
        eyebrow: t('dashboard.whoLeads'),
        description: t('dashboard.topArtistDesc')
      },
      {
        label: t('dashboard.topGenre'),
        displayValue: formatNumber(stats.genres[0]?.count || 0),
        accent: 'from-amber-300 to-orange-300',
        meta: stats.genres[0]?.name || '-',
        eyebrow: t('dashboard.soundPulse'),
        description: t('dashboard.topGenreDesc')
      }
    ];
  }, [stats, t]);

  const achievements = useMemo(() => buildAchievements(stats, t, locale), [stats, t, locale]);

  if (!discogsConfigured) {
    return (
      <section className="glass-panel p-8 text-center">
         <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('settings.accountTitle')}</p>
         <h2 className="mt-3 font-display text-4xl text-white">{t('dashboard.configureTitle')}</h2>
         <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
           {t('dashboard.configureBody')}
         </p>
         <Link to="/settings" className="primary-button mt-6 inline-flex">{t('dashboard.goSettings')}</Link>
       </section>
    );
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!stats) {
    return <div className="glass-panel p-10 text-center text-slate-300">{t('dashboard.noStats')}</div>;
  }

  return (
    <div className="space-y-6">
      {milestoneLabel ? <ConfettiBurst label={milestoneLabel} onDone={() => setMilestoneLabel('')} /> : null}

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <HeroPanel stats={stats} />

        <SyncButton onSyncComplete={load} disabled={!discogsConfigured} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      <CoveragePanel totals={stats.totals} />

      <section className="grid gap-6 xl:grid-cols-2">
        <ChartCard title={t('dashboard.genres')} description={t('dashboard.genresDesc')} hint={t('dashboard.tapHint')}><GenreChart data={stats.genres} onSelect={(value) => openCollectionFilter('genre', value)} /></ChartCard>
        <ChartCard title={t('dashboard.decadesTitle')} description={t('dashboard.decadesDesc')}><DecadeChart data={stats.decades} /></ChartCard>
        <ChartCard title={t('dashboard.formatsTitle')} description={t('dashboard.formatsDesc')}><FormatChart data={stats.formats} /></ChartCard>
        <ChartCard title={t('dashboard.labelsTitle')} description={t('dashboard.labelsDesc')} hint={t('dashboard.labelHint')}><LabelChart data={stats.labels} onSelect={(value) => openCollectionFilter('label', value)} /></ChartCard>
        <ChartCard title={t('dashboard.stylesTitle')} description={t('dashboard.stylesDesc')} hint={t('dashboard.styleHint')}><StylesChart data={stats.styles} onSelect={(value) => openCollectionFilter('style', value)} /></ChartCard>
        <ChartCard title={t('dashboard.growthTitle')} description={t('dashboard.growthDesc')}><GrowthChart data={stats.growth} /></ChartCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl text-slate-50">{t('dashboard.marketplaceTop')}</h3>
              <p className="text-sm text-slate-400">{t('dashboard.marketplaceDesc')}</p>
            </div>
            <Link to="/collection" className="text-sm text-brand-200 transition hover:text-brand-100">{t('dashboard.viewCollection')}</Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-3 pr-4">{t('dashboard.record')}</th>
                  <th className="py-3 pr-4">{t('collection.artist')}</th>
                  <th className="py-3 pr-4">{t('collection.year')}</th>
                    <th className="py-3 text-right">{t('dashboard.minPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.topValue.length > 0 ? (
                  stats.topValue.map((release) => (
                    <tr key={release.id} className="border-t border-white/5 text-slate-200">
                      <td className="py-3 pr-4">
                        <Link to={`/release/${release.id}`} className="transition hover:text-brand-200">{release.title}</Link>
                      </td>
                      <td className="py-3 pr-4">{release.artist}</td>
                      <td className="py-3 pr-4">{release.year || '-'}</td>
                      <td className="py-3 text-right text-brand-100">{formatCurrency(release.estimated_value, currency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="border-t border-white/5 py-6 text-center text-sm text-slate-400">
                      {t('dashboard.noValues')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel p-5">
          <h3 className="font-display text-xl text-slate-50">{t('dashboard.artistLeaderboard')}</h3>
          <p className="mb-4 text-sm text-slate-400">{t('dashboard.artistLeaderboardDesc')}</p>
          <div className="space-y-3">
            {stats.artists.map((artist, index) => (
              <Link
                key={artist.artist}
                to={`/collection?${new URLSearchParams({ search: artist.artist }).toString()}`}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3 transition hover:border-brand-300/40 hover:bg-white/10"
              >
                <div className="flex items-center gap-3 transition hover:text-brand-200">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 text-brand-100">{index + 1}</span>
                  <span className="font-medium text-slate-100">{artist.artist}</span>
                </div>
                <span className="text-sm text-slate-400">{t('dashboard.records', { count: formatNumber(artist.count) })}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <RandomReleaseCard />

      <AchievementsPanel achievements={achievements} />
    </div>
  );
}

export default Dashboard;
