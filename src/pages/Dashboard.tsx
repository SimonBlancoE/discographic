import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { DashboardRadarSummary, DashboardStats, NamedCountRow } from '../../shared/contracts/dashboardStats.js';
import ConfettiBurst from '../components/ConfettiBurst';
import AchievementsPanel from '../components/AchievementsPanel';
import { DashboardSkeleton } from '../components/LoadingSkeletons';
import RandomReleaseCard from '../components/RandomReleaseCard';
import CommunityPanel from '../components/CommunityPanel';
import ConditionBreakdown from '../components/ConditionBreakdown';
import CollectionValuePanel from '../components/CollectionValuePanel';
import StylesChart from '../components/charts/StylesChart';
import DecadeChart from '../components/charts/DecadeChart';
import FormatChart from '../components/charts/FormatChart';
import GenreChart from '../components/charts/GenreChart';
import GrowthChart from '../components/charts/GrowthChart';
import LabelChart from '../components/charts/LabelChart';
import SyncButton from '../components/SyncButton';
import { buildAchievements } from '../lib/achievements';
import { useAuth } from '../lib/AuthContext';
import { useDashboardStats } from '../lib/DashboardStatsContext';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';

const MILESTONES = [100, 500, 1000, 2500, 5000];
const RADAR_SUMMARY_METRICS = [
  {
    labelKey: 'dashboard.radar.totalWanted',
    valueKey: 'totalWanted',
  },
  {
    labelKey: 'dashboard.radar.activeOpportunities',
    valueKey: 'activeOpportunities',
  },
  {
    labelKey: 'dashboard.radar.belowTarget',
    valueKey: 'belowTarget',
  },
  {
    labelKey: 'dashboard.radar.alreadyOwned',
    valueKey: 'alreadyOwned',
  },
] as const;

function getMilestone(total: number): number | null {
  return [...MILESTONES].reverse().find((milestone) => total >= milestone) || null;
}

function ratio(value: number, total: number): number {
  if (!total) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function greetingKey(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return 'dashboard.greetingEvening';
  if (hour < 13) return 'dashboard.greetingMorning';
  if (hour < 21) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

/** A calm welcome: who you are, what the collection looks like, and two real destinations. */
function WelcomePanel({ stats }: { stats: DashboardStats }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const decades = stats.decades.map((row) => row.name);
  const topGenre = stats.genres[0]?.name;
  const covers = stats.topValue.slice(0, 3);

  return (
    <section className="glass-panel @container relative overflow-hidden" aria-labelledby="welcome-title">
      <div className="grid items-center gap-6 p-6 sm:p-8 @[40rem]:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0">
        <p className="text-sm text-slate-400">
          {t(greetingKey(), { name: user?.username || '' })}
        </p>
        <h2 id="welcome-title" className="mt-2 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">
          {t('dashboard.welcomeHeadline', { count: formatNumber(stats.totals.total_records || 0) })}
        </h2>
        {topGenre && decades.length ? (
          <p className="mt-3 text-base text-slate-300">
            {t('dashboard.welcomeSummary', { genre: topGenre, from: decades[0], to: decades[decades.length - 1] })}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/collection" className="primary-button">{t('dashboard.exploreCollection')}</Link>
          <Link to="/wall" className="secondary-button">{t('dashboard.openWall')}</Link>
        </div>
        <p className="mt-5 text-xs text-slate-500">
          {t('dashboard.lastSync', { date: formatDate(stats.lastSync?.finished_at) })}
        </p>
      </div>

      {covers.length === 3 ? (
        // Its own grid column, so it can never sit on top of the headline; hidden when the panel is narrow.
        <div className="pointer-events-none relative hidden h-40 w-56 justify-self-end @[40rem]:block" aria-hidden="true">
          {covers.map((release, index) => (
            <img
              key={release.id}
              src={`/api/media/cover/${release.id}?variant=wall`}
              alt=""
              className="absolute top-0 h-40 w-40 rounded-md object-cover shadow-[0_16px_32px_rgba(0,0,0,0.5)]"
              style={{ right: `${index * 28}px`, transform: `rotate(${(index - 1) * 4}deg)`, zIndex: 3 - index, filter: index ? 'brightness(0.7)' : undefined }}
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
          ))}
        </div>
      ) : null}
      </div>
    </section>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="glass-panel stat-card @container min-w-0 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 truncate font-display text-2xl text-white @[14rem]:text-3xl" title={value}>{value}</p>
      {detail ? <p className="mt-1 truncate text-sm text-slate-400" title={detail}>{detail}</p> : null}
    </div>
  );
}

function ChartCard({ title, description, hint, children }: {
  title: string;
  description: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel min-w-0 p-5">
      <div className="mb-4">
        <h3 className="font-display text-xl text-slate-50">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
        {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function CoverageMetric({ label, value, total, helper }: {
  label: string;
  value: number;
  total: number;
  helper: (remaining: number) => string;
}) {
  const percent = ratio(value, total);
  const remaining = Math.max(total - value, 0);

  return (
    <div className="min-w-0 rounded-xl border border-white/5 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-3 font-display text-3xl text-white">{percent}%</p>
        </div>
        <span className="text-xs tabular-nums text-slate-500">{value}/{total}</span>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-white/5">
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max(percent, value ? 10 : 0)}%` }} />
      </div>
      <p className="mt-3 text-sm text-slate-400">{helper(remaining)}</p>
    </div>
  );
}

function CoveragePanel({ totals }: { totals: DashboardStats['totals'] }) {
  const { t } = useI18n();
  const total = totals.total_records || 0;
  const rated = totals.rated_records || 0;
  const notes = totals.notes_records || 0;
  const priced = totals.priced_records || 0;
  const pendingValues = totals.value_pending_records || 0;
  const failedValues = totals.value_failed_records || 0;
  const unavailableValues = totals.value_unavailable_records || 0;
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
        <div className="rounded-xl border border-white/5 bg-black/20 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t('dashboard.readiness')}</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="font-display text-4xl text-white">{readiness}%</span>
            <span className="pb-2 text-sm text-slate-400">{t('dashboard.readinessBody')}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CoverageMetric label={t('collection.rating')} value={rated} total={total} helper={(remaining) => remaining > 0 ? t('dashboard.ratingsMissing', { count: formatNumber(remaining) }) : t('dashboard.ratingsDone')} />
        <CoverageMetric label={t('collection.notes')} value={notes} total={total} helper={(remaining) => remaining > 0 ? t('dashboard.notesMissing', { count: formatNumber(remaining) }) : t('dashboard.notesDone')} />
        <CoverageMetric label={t('collection.price')} value={priced} total={total} helper={(remaining) => remaining > 0 ? t('dashboard.pricesMissing', {
          count: formatNumber(remaining),
          pending: formatNumber(pendingValues),
          failed: formatNumber(failedValues),
          unavailable: formatNumber(unavailableValues)
        }) : t('dashboard.pricesDone')} />
      </div>
    </section>
  );
}

function RadarSummaryPanel({ radar }: { radar: DashboardRadarSummary }) {
  const { t } = useI18n();

  return (
    <section className="glass-panel overflow-hidden p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t('dashboard.radarTitle')}</p>
          <h3 className="mt-2 font-display text-2xl text-white">{t('nav.radar')}</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">{t('dashboard.radarBody')}</p>
        </div>
        <Link to="/radar" className="secondary-button self-start">
          {t('dashboard.radarOpen')}
        </Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {RADAR_SUMMARY_METRICS.map(({ labelKey, valueKey }) => (
          <div key={labelKey} className="min-w-0 rounded-xl border border-white/5 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t(labelKey)}</p>
            <p className="mt-3 font-display text-3xl text-white">{formatNumber(radar[valueKey])}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Dashboard() {
  const { accountUnavailable, discogsConfigured, currency } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { stats, loading, error, refresh } = useDashboardStats();
  const [milestoneLabel, setMilestoneLabel] = useState('');
  const milestoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownErrorRef = useRef('');

  function openCollectionFilter(key: string, value: string) {
    if (!value) {
      return;
    }

    navigate(`/collection?${new URLSearchParams({ [key]: value }).toString()}`);
  }

  useEffect(() => () => {
    if (milestoneTimeoutRef.current) {
      window.clearTimeout(milestoneTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!stats) {
      return;
    }

    const total = stats.totals.total_records || 0;
    const milestone = getMilestone(total);
    const milestoneKey = milestone ? `discographic-milestone-${milestone}` : '';

    if (milestone && !window.sessionStorage.getItem(milestoneKey)) {
      window.sessionStorage.setItem(milestoneKey, '1');
      setMilestoneLabel(t('dashboard.milestone', { count: formatNumber(milestone) }));
    }
  }, [stats, t]);

  useEffect(() => {
    if (!error) {
      shownErrorRef.current = '';
      return;
    }

    if (shownErrorRef.current === error.message) {
      return;
    }

    shownErrorRef.current = error.message;
    toast.error(t('dashboard.loadError', { error: error.message }));
  }, [error, t, toast]);

  useEffect(() => {
    if (!milestoneLabel) {
      return undefined;
    }

    milestoneTimeoutRef.current = setTimeout(() => setMilestoneLabel(''), 1800);
    return () => {
      if (milestoneTimeoutRef.current) {
        clearTimeout(milestoneTimeoutRef.current);
      }
    };
  }, [milestoneLabel]);

  const statCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      {
        label: t('dashboard.totalRecords'),
        value: formatNumber(stats.totals.total_records || 0),
        detail: t('dashboard.months', { count: stats.growth.length }),
      },
      {
        label: t('dashboard.collectionValue'),
        value: stats.totals.total_value ? formatCurrency(stats.totals.total_value, currency) : '-',
        detail: t('dashboard.marketToday'),
      },
      {
        label: t('dashboard.topArtist'),
        value: stats.artists[0]?.artist || '-',
        detail: stats.artists[0] ? t('dashboard.records', { count: formatNumber(stats.artists[0].count) }) : undefined,
      },
      {
        label: t('dashboard.topGenre'),
        value: stats.genres[0]?.name || '-',
        detail: stats.genres[0] ? t('dashboard.records', { count: formatNumber(stats.genres[0].count) }) : undefined,
      },
    ];
  }, [currency, stats, t]);

  const achievements = useMemo(() => buildAchievements(stats, t, locale), [stats, t, locale]);

  if (accountUnavailable) {
    return (
      <section className="glass-panel p-8 text-center">
        <p className="text-sm uppercase tracking-[0.14em] text-brand-200">{t('settings.accountTitle')}</p>
        <h2 className="mt-3 font-display text-4xl text-white">{t('dashboard.accountUnavailableTitle')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
          {t('dashboard.accountUnavailableBody')}
        </p>
        <Link to="/settings" className="primary-button mt-6 inline-flex">{t('dashboard.goSettings')}</Link>
      </section>
    );
  }

  if (!discogsConfigured) {
    return (
      <section className="glass-panel p-8 text-center">
         <p className="text-sm uppercase tracking-[0.14em] text-brand-200">{t('settings.accountTitle')}</p>
         <h2 className="mt-3 font-display text-4xl text-white">{t('dashboard.configureTitle')}</h2>
         <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
           {t('dashboard.configureBody')}
         </p>
         <Link to="/settings" className="primary-button mt-6 inline-flex">{t('dashboard.goSettings')}</Link>
       </section>
    );
  }

  // Background refreshes (after a sync or price review) keep the current dashboard on screen.
  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  if (!stats) {
    return <div className="glass-panel p-10 text-center text-slate-300">{t('dashboard.noStats')}</div>;
  }

  return (
    <div className="space-y-6">
      {milestoneLabel ? <ConfettiBurst label={milestoneLabel} onDone={() => setMilestoneLabel('')} /> : null}

      <section className="grid items-start gap-6 xl:grid-cols-[1.4fr_0.9fr] [&>*]:min-w-0">
        <WelcomePanel stats={stats} />

        <SyncButton onSyncComplete={() => { void refresh(); }} disabled={!discogsConfigured} />
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      <CollectionValuePanel value={stats.collectionValue} onUpdated={() => { void refresh(); }} />

      <CommunityPanel community={stats.community} onUpdated={() => { void refresh(); }} />

      <ConditionBreakdown conditions={stats.conditions} folders={stats.folders} />

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
                      <td className="py-3 text-right tabular-nums text-slate-100">{formatCurrency(release.estimated_value, currency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="border-t border-white/5 py-6 text-center text-sm text-slate-400">
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
          <div className="space-y-1.5">
            {stats.artists.slice(0, 10).map((artist, index) => (
              <Link
                key={artist.artist}
                to={`/collection?${new URLSearchParams({ search: artist.artist }).toString()}`}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-3 py-2 transition hover:border-brand-300/40 hover:bg-white/[0.07]"
              >
                <div className="flex items-center gap-3 transition hover:text-brand-200">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-xs tabular-nums text-slate-300">{index + 1}</span>
                  <span className="font-medium text-slate-100">{artist.artist}</span>
                </div>
                <span className="text-sm text-slate-400">{t('dashboard.records', { count: formatNumber(artist.count) })}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CoveragePanel totals={stats.totals} />

      <RadarSummaryPanel radar={stats.radar} />

      <RandomReleaseCard />

      <AchievementsPanel achievements={achievements} />
    </div>
  );
}

export default Dashboard;
