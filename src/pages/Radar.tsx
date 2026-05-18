import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RADAR_OPPORTUNITY_REASON,
  RADAR_PRIORITY,
  normalizeRadarResponse,
  normalizeRadarUpdateRunStatus,
  type RadarRelease,
  type RadarResponse,
  type RadarSyncResult,
  type RadarUpdateRunStatus,
} from '../../shared/contracts/radar.js';
import { MARKETPLACE_STATUS, type MarketplaceStatus } from '../../shared/contracts/marketplace.js';
import RadarWantlistImportPanel from '../components/RadarWantlistImportPanel';
import { useAuth } from '../lib/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { formatCurrency, formatDate } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { api } from '../lib/api';
import {
  getOrderedRadarOpportunityReasons,
  getRadarCollectionMatchLabelKey,
  getRadarStateLabelKeys,
  type RadarStateLabelKey,
} from '../lib/radarPresentation';
import type { Translate } from '../lib/types';

const UPDATE_STATUS_CARDS = [
  { labelKey: 'radar.updateCurrent', valueKey: 'current' },
  { labelKey: 'radar.updateTotal', valueKey: 'total' },
  { labelKey: 'radar.updatePending', valueKey: 'pending' },
] as const;

const RADAR_WANTLIST_IMPORT_SECTION_ID = 'radar-wantlist-fallback';

type RadarFilterId =
  | 'all'
  | 'opportunities'
  | 'below_target'
  | 'high_priority'
  | 'in_collection'
  | 'attention'
  | 'hidden_resolved'
  | 'pending'
  | 'failed';

type RadarPrimaryMetricId = Extract<
  RadarFilterId,
  'opportunities' | 'below_target' | 'high_priority' | 'in_collection' | 'attention'
>;

const RADAR_PRIMARY_METRICS = [
  { id: 'opportunities', labelKey: 'radar.filter.opportunities' },
  { id: 'below_target', labelKey: 'radar.filter.belowTarget' },
  { id: 'high_priority', labelKey: 'radar.filter.highPriority' },
  { id: 'in_collection', labelKey: 'radar.filter.inCollection' },
  { id: 'attention', labelKey: 'radar.filter.attention' },
] as const satisfies readonly {
  id: RadarPrimaryMetricId;
  labelKey: string;
}[];

const RADAR_SECONDARY_SUMMARY_CHIPS = [
  { labelKey: 'radar.summary.total', valueKey: 'total' },
  { labelKey: 'radar.summary.hidden', valueKey: 'hidden' },
  { labelKey: 'radar.summary.resolved', valueKey: 'resolved' },
  { labelKey: 'radar.summary.missingFromSource', valueKey: 'missingFromSource' },
  { labelKey: 'radar.summary.priced', valueKey: 'priced' },
  { labelKey: 'radar.summary.pending', valueKey: 'pending' },
  { labelKey: 'radar.summary.failed', valueKey: 'failed' },
  { labelKey: 'radar.summary.unavailable', valueKey: 'unavailable' },
] as const satisfies readonly {
  labelKey: string;
  valueKey: keyof RadarResponse['summary'];
}[];

const RADAR_AUXILIARY_FILTERS = [
  { id: 'all', labelKey: 'radar.filter.all' },
  { id: 'hidden_resolved', labelKey: 'radar.filter.hiddenResolved' },
  { id: 'pending', labelKey: 'radar.filter.pending' },
  { id: 'failed', labelKey: 'radar.filter.failed' },
] as const satisfies readonly {
  id: RadarFilterId;
  labelKey: string;
}[];

const RADAR_MARKETPLACE_STATE_LABEL_KEYS: Partial<Record<MarketplaceStatus, RadarStateLabelKey>> = {
  [MARKETPLACE_STATUS.PENDING]: 'radar.state.pending',
  [MARKETPLACE_STATUS.UNAVAILABLE]: 'radar.state.unavailable',
  [MARKETPLACE_STATUS.FAILED]: 'radar.state.failed',
};

const RADAR_RELEASE_FIELD_LABEL_CLASS = 'text-[11px] uppercase tracking-[0.2em] text-slate-500';
const RADAR_RELEASE_FIELD_STRONG_VALUE_CLASS = 'mt-1 font-semibold text-white';
const RADAR_RELEASE_FIELD_VALUE_CLASS = 'mt-1 text-slate-200';
const UPDATE_POLL_MS = 2000;

function createEmptyRadarResponse(): RadarResponse {
  return normalizeRadarResponse({});
}

function createEmptyRadarUpdateRunStatus(): RadarUpdateRunStatus {
  return normalizeRadarUpdateRunStatus({});
}

function renderWantlistSyncResult(wantlist: RadarSyncResult, t: Translate) {
  return (
    <div className="rounded-3xl border border-emerald-300/20 bg-emerald-950/20 p-5 text-emerald-50">
      <p className="text-sm uppercase tracking-[0.28em] text-emerald-200">{t('radar.syncResultTitle')}</p>
      <p className="mt-2 text-base">{t('radar.syncResultSummary', { count: wantlist.totalFetched })}</p>
      <p className="mt-2 text-sm text-emerald-100/90">
        {t('radar.syncBreakdown', {
          added: wantlist.added,
          updated: wantlist.updated,
          reactivated: wantlist.reactivated,
          markedMissing: wantlist.markedMissing,
        })}
      </p>
    </div>
  );
}

type RadarGettingStartedProps = {
  onStartUpdate: () => void;
  onShowWantlistImport: () => void;
  updateActionDisabled: boolean;
  updateRunning: boolean;
  t: Translate;
};

function renderRadarGettingStarted({
  onStartUpdate,
  onShowWantlistImport,
  updateActionDisabled,
  updateRunning,
  t,
}: RadarGettingStartedProps) {
  return (
    <div
      data-radar-getting-started="true"
      className="rounded-3xl border border-brand-200/20 bg-brand-400/10 p-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.28em] text-brand-100">{t('radar.eyebrow')}</p>
          <h2 className="font-display text-3xl text-white">{t('radar.gettingStartedTitle')}</h2>
          <p className="max-w-3xl text-sm text-slate-200">{t('radar.gettingStartedBody')}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onStartUpdate}
            disabled={updateActionDisabled}
            className="primary-button disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateRunning ? t('radar.updating') : t('radar.updateAction')}
          </button>
          <button
            type="button"
            onClick={onShowWantlistImport}
            aria-controls={RADAR_WANTLIST_IMPORT_SECTION_ID}
            className="secondary-button"
          >
            {t('radar.importAction')}
          </button>
        </div>
      </div>
    </div>
  );
}

function hasRadarAttentionIssue(item: RadarRelease): boolean {
  return item.marketplace.status === MARKETPLACE_STATUS.PENDING
    || item.marketplace.status === MARKETPLACE_STATUS.FAILED
    || item.marketplace.status === MARKETPLACE_STATUS.UNAVAILABLE;
}

function matchesRadarFilter(item: RadarRelease, filterId: RadarFilterId): boolean {
  switch (filterId) {
    case 'all':
      return true;
    case 'opportunities':
      return item.opportunity.default_visible && item.opportunity.reasons.length > 0;
    case 'below_target':
      return item.opportunity.reasons.includes(RADAR_OPPORTUNITY_REASON.BELOW_TARGET);
    case 'high_priority':
      return item.local.priority === RADAR_PRIORITY.HIGH;
    case 'in_collection':
      return item.opportunity.is_in_collection
        || item.opportunity.reasons.includes(RADAR_OPPORTUNITY_REASON.ALREADY_IN_COLLECTION);
    case 'attention':
      return hasRadarAttentionIssue(item);
    case 'hidden_resolved':
      return item.local.hidden || item.local.resolved;
    case 'pending':
      return item.marketplace.status === MARKETPLACE_STATUS.PENDING;
    case 'failed':
      return item.marketplace.status === MARKETPLACE_STATUS.FAILED;
  }
}

function getFilteredRadarItems(items: RadarRelease[], filterId: RadarFilterId): RadarRelease[] {
  return items.filter((item) => matchesRadarFilter(item, filterId));
}

function getRadarPrimaryMetricCounts(items: RadarRelease[]): Record<RadarPrimaryMetricId, number> {
  const counts: Record<RadarPrimaryMetricId, number> = {
    opportunities: 0,
    below_target: 0,
    high_priority: 0,
    in_collection: 0,
    attention: 0,
  };

  for (const item of items) {
    for (const { id } of RADAR_PRIMARY_METRICS) {
      if (matchesRadarFilter(item, id)) {
        counts[id] += 1;
      }
    }
  }

  return counts;
}

type RadarFilterBarProps = {
  selectedFilter: RadarFilterId;
  t: Translate;
  onFilterChange: (filterId: RadarFilterId) => void;
};

type RadarOperationalHeaderProps = {
  items: RadarRelease[];
  summary: RadarResponse['summary'];
  selectedFilter: RadarFilterId;
  t: Translate;
  onFilterChange: (filterId: RadarFilterId) => void;
};

function RadarOperationalHeader({
  items,
  summary,
  selectedFilter,
  t,
  onFilterChange,
}: RadarOperationalHeaderProps) {
  const metricCounts = getRadarPrimaryMetricCounts(items);

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-6">
      <div className="grid gap-3 xl:grid-cols-5">
        {RADAR_PRIMARY_METRICS.map(({ id, labelKey }) => {
          const selected = id === selectedFilter;
          const buttonClassName = selected
            ? 'border-brand-100 bg-brand-400/15 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
            : 'border-white/10 bg-slate-950/50 hover:border-white/25 hover:bg-slate-900/70';

          return (
            <button
              key={id}
              type="button"
              data-radar-filter={id}
              data-radar-metric={id}
              aria-pressed={selected}
              onClick={() => onFilterChange(id)}
              className={`min-h-28 rounded-3xl border p-4 text-left transition ${buttonClassName}`}
            >
              <p className="text-xs uppercase leading-5 tracking-[0.22em] text-slate-400">{t(labelKey)}</p>
              <p className="mt-4 font-display text-4xl text-white">{metricCounts[id]}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        {RADAR_SECONDARY_SUMMARY_CHIPS.map(({ labelKey, valueKey }) => (
          <div
            key={labelKey}
            className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 px-3 py-2 text-sm"
          >
            <span className="text-slate-400">{t(labelKey)}</span>
            <span className="font-semibold text-white">{summary[valueKey]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RadarFilterBar({
  selectedFilter,
  t,
  onFilterChange,
}: RadarFilterBarProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.filtersTitle')}</p>
        <div className="flex flex-wrap gap-2">
          {RADAR_AUXILIARY_FILTERS.map(({ id, labelKey }) => {
            const selected = id === selectedFilter;
            const buttonClassName = selected
              ? 'border-brand-100 bg-brand-400/15 text-white'
              : 'border-white/10 bg-slate-950/40 text-slate-300 hover:border-white/25 hover:text-white';

            return (
              <button
                key={id}
                type="button"
                data-radar-filter={id}
                onClick={() => onFilterChange(id)}
                className={`rounded-full border px-4 py-2 text-sm transition ${buttonClassName}`}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getRadarCurrentPrice(item: RadarRelease, t: Translate): string {
  const displayCurrency = item.display_currency || 'EUR';

  if (item.marketplace.status === MARKETPLACE_STATUS.PRICED && item.marketplace.estimated_price != null) {
    return formatCurrency(item.marketplace.estimated_price, displayCurrency);
  }

  const stateLabelKey = RADAR_MARKETPLACE_STATE_LABEL_KEYS[item.marketplace.status];
  return stateLabelKey ? t(stateLabelKey) : '-';
}

type RadarReleaseField = {
  labelKey: string;
  value: string;
  valueClassName: string;
};

function getRadarReleaseFields(item: RadarRelease, t: Translate): RadarReleaseField[] {
  const displayCurrency = item.display_currency || 'EUR';
  const targetPrice = item.local.target_price == null
    ? '-'
    : formatCurrency(item.local.target_price, displayCurrency);

  return [
    {
      labelKey: 'radar.currentPrice',
      value: getRadarCurrentPrice(item, t),
      valueClassName: RADAR_RELEASE_FIELD_STRONG_VALUE_CLASS,
    },
    {
      labelKey: 'radar.targetPrice',
      value: targetPrice,
      valueClassName: RADAR_RELEASE_FIELD_STRONG_VALUE_CLASS,
    },
    {
      labelKey: 'radar.priority',
      value: t(`radar.priority.${item.local.priority}`),
      valueClassName: RADAR_RELEASE_FIELD_STRONG_VALUE_CLASS,
    },
    {
      labelKey: 'radar.wantlistDate',
      value: formatDate(item.date_added),
      valueClassName: RADAR_RELEASE_FIELD_VALUE_CLASS,
    },
    {
      labelKey: 'radar.lastPriceReview',
      value: formatDate(item.marketplace.last_checked_at),
      valueClassName: RADAR_RELEASE_FIELD_VALUE_CLASS,
    },
  ];
}

type RadarReleaseRowProps = {
  item: RadarRelease;
  t: Translate;
};

function RadarReleaseRow({
  item,
  t,
}: RadarReleaseRowProps) {
  const releaseKey = item.id ?? item.release_id ?? 0;
  const detailPath = `/radar/${releaseKey}`;
  const opportunityReasons = getOrderedRadarOpportunityReasons(item);
  const stateLabelKeys = getRadarStateLabelKeys(item);
  const collectionMatch = item.opportunity.collection_match;
  const hasLabels = stateLabelKeys.length > 0 || opportunityReasons.length > 0;
  const releaseFields = getRadarReleaseFields(item, t);

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <Link
            to={detailPath}
            data-radar-detail={String(releaseKey)}
            aria-label={`${t('radar.openDetail')}: ${item.artist} - ${item.title}`}
            className="group -m-3 flex w-full min-w-0 gap-4 rounded-2xl border border-transparent p-3 text-inherit no-underline transition hover:border-brand-200/30 hover:bg-white/5 focus-visible:border-brand-100 focus-visible:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100/40"
          >
            {item.cover_url ? (
              <img
                src={item.cover_url}
                alt={`${item.artist} - ${item.title}`}
                data-radar-cover={String(releaseKey)}
                className="h-20 w-20 flex-none rounded-2xl border border-white/10 object-cover shadow-[0_12px_30px_rgba(15,23,42,0.35)] transition group-hover:border-brand-100/40"
              />
            ) : (
              <div
                data-radar-cover={String(releaseKey)}
                className="flex h-20 w-20 flex-none items-end rounded-2xl border border-dashed border-white/10 bg-slate-900/80 p-3 text-[11px] uppercase tracking-[0.22em] text-slate-500 transition group-hover:border-brand-100/40"
              >
                #{item.release_id}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">#{item.release_id}</p>
                <p className="truncate text-sm text-slate-300">{item.artist}</p>
                <p className="font-display text-xl leading-tight text-white transition group-hover:text-brand-100">
                  {item.title}
                </p>
                {item.year ? <p className="text-sm text-slate-500">{item.year}</p> : null}
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                {releaseFields.map(({ labelKey, value, valueClassName }) => (
                  <div key={labelKey}>
                    <dt className={RADAR_RELEASE_FIELD_LABEL_CLASS}>{t(labelKey)}</dt>
                    <dd className={valueClassName}>{value}</dd>
                  </div>
                ))}
              </dl>

              {hasLabels ? (
                <div className="flex flex-wrap gap-2">
                  {stateLabelKeys.map((labelKey) => (
                    <span
                      key={labelKey}
                      className="inline-flex items-center rounded-full border border-amber-300/25 bg-amber-950/35 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-100"
                    >
                      {t(labelKey)}
                    </span>
                  ))}
                  {opportunityReasons.map((reason) => (
                    <span
                      key={reason}
                      className="inline-flex items-center rounded-full border border-emerald-300/25 bg-emerald-950/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-100"
                    >
                      {t(`radar.opportunity.${reason}`)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </Link>

          {collectionMatch?.primary_release_id != null ? (
            <div className="pt-1 sm:pl-24">
              <Link
                to={`/collection/${collectionMatch.primary_release_id}`}
                data-radar-collection={String(releaseKey)}
                className="inline-flex items-center text-sm text-cyan-200 no-underline transition hover:text-cyan-100"
              >
                {t(getRadarCollectionMatchLabelKey(collectionMatch.copy_count), {
                  count: collectionMatch.copy_count,
                })}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
          <Link
            to={detailPath}
            data-radar-detail-action={String(releaseKey)}
            className="inline-flex items-center justify-center rounded-full border border-brand-100/60 bg-brand-400/15 px-4 py-2 text-sm text-white no-underline transition hover:border-brand-100 hover:bg-brand-400/25"
          >
            {t('radar.openDetail')}
          </Link>
          <a
            href={`https://www.discogs.com/release/${item.release_id}`}
            target="_blank"
            rel="noreferrer"
            data-radar-discogs={String(releaseKey)}
            className="inline-flex items-center justify-center rounded-full border border-brand-200/40 px-4 py-2 text-sm text-brand-100 no-underline transition hover:border-brand-100 hover:text-white"
          >
            {t('radar.openDiscogs')}
          </a>
        </div>
      </div>
    </li>
  );
}

type RadarContentProps = {
  items: RadarRelease[];
  hasAnyRadarItems: boolean;
  loading: boolean;
  loadFailed: boolean;
  t: Translate;
};

function renderEmptyRadarMessage(titleKey: string, bodyKey: string, t: Translate) {
  return (
    <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-8">
      <h2 className="font-display text-4xl text-white">{t(titleKey)}</h2>
      <p className="max-w-2xl text-base text-slate-300">{t(bodyKey)}</p>
    </div>
  );
}

function renderRadarContent({
  items,
  hasAnyRadarItems,
  loading,
  loadFailed,
  t,
}: RadarContentProps) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-8 text-center text-slate-300">
        {t('radar.loading')}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-8 text-center text-rose-100">
        {t('radar.loadFailed')}
      </div>
    );
  }

  if (items.length === 0) {
    const titleKey = hasAnyRadarItems ? 'radar.filterEmptyTitle' : 'radar.emptyTitle';
    const bodyKey = hasAnyRadarItems ? 'radar.filterEmptyBody' : 'radar.emptyBody';

    return renderEmptyRadarMessage(titleKey, bodyKey, t);
  }

  return (
    <ul className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/30 divide-y divide-white/10">
      {items.map((item) => (
        <RadarReleaseRow key={item.id ?? item.release_id} item={item} t={t} />
      ))}
    </ul>
  );
}

function Radar() {
  const { accountUnavailable, capabilities } = useAuth();
  const { t } = useI18n();
  const importSectionRef = useRef<HTMLElement | null>(null);
  const importHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [radar, setRadar] = useState(createEmptyRadarResponse);
  const [updateRun, setUpdateRun] = useState(createEmptyRadarUpdateRunStatus);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updateStatusError, setUpdateStatusError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<RadarFilterId>('all');
  const filteredItems = getFilteredRadarItems(radar.items, selectedFilter);
  const hasWantlistSyncResult = updateRun.wantlist.totalFetched > 0;
  const showGettingStarted = !loading && !loadFailed && radar.items.length === 0;
  const updateActionDisabled = loading || actionBusy || updateRun.isRunning;

  function applyRadarUpdateResult(nextStatus: RadarUpdateRunStatus, nextRadar: RadarResponse) {
    if (nextStatus.wantlist.totalFetched > 0) {
      setSelectedFilter('all');
    }

    setUpdateRun(nextStatus);
    setRadar(nextRadar);
  }

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar) {
      setRadar(createEmptyRadarResponse());
      setUpdateRun(createEmptyRadarUpdateRunStatus());
      setLoading(false);
      setLoadFailed(false);
      setUpdateStatusError('');
      setUpdateError('');
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadFailed(false);
    setUpdateStatusError('');

    Promise.allSettled([api.getRadar(), api.getRadarStatus()])
      .then(([radarResult, statusResult]) => {
        if (cancelled) {
          return;
        }

        if (radarResult.status === 'fulfilled') {
          setRadar(radarResult.value);
        } else {
          setLoadFailed(true);
          setRadar(createEmptyRadarResponse());
        }

        if (statusResult.status === 'fulfilled') {
          setUpdateRun(statusResult.value);
        } else {
          setUpdateRun(createEmptyRadarUpdateRunStatus());
          setUpdateStatusError(t('radar.updateStatusError'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountUnavailable, capabilities.canUseRadar]);

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar || !updateRun.isRunning) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    async function pollStatus() {
      let nextStatus: RadarUpdateRunStatus;

      try {
        nextStatus = await api.getRadarStatus();
      } catch {
        if (!cancelled) {
          setUpdateStatusError(t('radar.updateStatusError'));
          timer = window.setTimeout(pollStatus, UPDATE_POLL_MS);
        }
        return;
      }

      if (cancelled) {
        return;
      }

      setUpdateStatusError('');
      setUpdateRun(nextStatus);

      if (nextStatus.isRunning) {
        timer = window.setTimeout(pollStatus, UPDATE_POLL_MS);
        return;
      }

      try {
        const nextRadar = await api.getRadar();
        if (!cancelled) {
          applyRadarUpdateResult(nextStatus, nextRadar);
        }
      } catch {
        if (!cancelled) {
          setUpdateStatusError(t('radar.updateStatusError'));
        }
      }
    }

    timer = window.setTimeout(pollStatus, UPDATE_POLL_MS);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [accountUnavailable, capabilities.canUseRadar, updateRun.isRunning, t]);

  async function handleStartUpdate() {
    setActionBusy(true);
    setUpdateError('');

    try {
      const nextStatus = await api.startRadarUpdateRun();
      setUpdateStatusError('');
      if (!nextStatus.isRunning) {
        applyRadarUpdateResult(nextStatus, await api.getRadar());
      } else {
        setUpdateRun(nextStatus);
      }
    } catch (error) {
      setUpdateError(t('radar.updateError', { error: getErrorMessage(error, t('client.networkError')) }));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStopUpdate() {
    setActionBusy(true);

    try {
      const [nextStatus, nextRadar] = await Promise.all([
        api.stopRadarUpdateRun(),
        api.getRadar(),
      ]);

      setUpdateStatusError('');
      applyRadarUpdateResult(nextStatus, nextRadar);
    } catch {
      setUpdateStatusError(t('radar.updateStatusError'));
    } finally {
      setActionBusy(false);
    }
  }

  function showWantlistImportPanel() {
    const scrollTarget = typeof importHeadingRef.current?.scrollIntoView === 'function'
      ? importHeadingRef.current
      : importSectionRef.current;

    if (typeof scrollTarget?.scrollIntoView === 'function') {
      scrollTarget.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }

    importHeadingRef.current?.focus();
  }

  if (accountUnavailable) {
    return <div className="glass-panel p-8 text-center text-amber-100">{t('radar.accountUnavailable')}</div>;
  }

  if (!capabilities.canUseRadar) {
    return (
      <section className="glass-panel mx-auto max-w-3xl space-y-5 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.eyebrow')}</p>
        <div className="space-y-3">
          <h2 className="font-display text-4xl text-white">{t('radar.blockedTitle')}</h2>
          <p className="text-base text-slate-300">{t('radar.blockedBody')}</p>
        </div>
        <div>
          <Link to="/settings" className="primary-button inline-flex items-center justify-center no-underline">
            {t('radar.openSettings')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.eyebrow')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={showWantlistImportPanel}
            aria-controls={RADAR_WANTLIST_IMPORT_SECTION_ID}
            className="secondary-button"
          >
            {t('radar.importAction')}
          </button>
          <button
            type="button"
            onClick={handleStartUpdate}
            disabled={updateActionDisabled}
            className="primary-button disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateRun.isRunning ? t('radar.updating') : t('radar.updateAction')}
          </button>
        </div>
      </div>

      {hasWantlistSyncResult ? renderWantlistSyncResult(updateRun.wantlist, t) : null}

      {updateError ? (
        <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-5 text-rose-100">
          {updateError}
        </div>
      ) : null}

      {showGettingStarted
        ? renderRadarGettingStarted({
          onStartUpdate: () => void handleStartUpdate(),
          onShowWantlistImport: showWantlistImportPanel,
          updateActionDisabled,
          updateRunning: updateRun.isRunning,
          t,
        })
        : null}

      <RadarOperationalHeader
        items={radar.items}
        summary={radar.summary}
        selectedFilter={selectedFilter}
        t={t}
        onFilterChange={setSelectedFilter}
      />

      <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.updateTitle')}</p>
              <h2 className="mt-2 font-display text-3xl text-white">{t(`radar.updatePhase.${updateRun.phase}`)}</h2>
            </div>
            <p className="max-w-2xl text-sm text-slate-300">{t('radar.updateBody')}</p>
            <p className="text-sm text-slate-300">{updateRun.message}</p>
          </div>

          <div className="flex items-center gap-3">
            {updateRun.canStop ? (
              <button
                type="button"
                onClick={handleStopUpdate}
                disabled={actionBusy}
                className="secondary-button text-sm disabled:opacity-50"
              >
                {t('radar.updateStop')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-900/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
            style={{ width: `${updateRun.progressPercent}%` }}
          />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.updateStatus')}</p>
            <p className="mt-3 font-display text-2xl text-white">{t(`radar.updatePhase.${updateRun.phase}`)}</p>
          </article>
          {UPDATE_STATUS_CARDS.map(({ labelKey, valueKey }) => (
            <article key={labelKey} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t(labelKey)}</p>
              <p className="mt-3 font-display text-2xl text-white">{updateRun[valueKey]}</p>
            </article>
          ))}
        </div>

        {updateStatusError ? (
          <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">
            {updateStatusError}
          </div>
        ) : null}
      </div>

      <RadarFilterBar selectedFilter={selectedFilter} t={t} onFilterChange={setSelectedFilter} />

      {renderRadarContent({
        items: filteredItems,
        hasAnyRadarItems: radar.items.length > 0,
        loading,
        loadFailed,
        t,
      })}

      <RadarWantlistImportPanel
        sectionId={RADAR_WANTLIST_IMPORT_SECTION_ID}
        sectionRef={importSectionRef}
        headingRef={importHeadingRef}
        onApplied={(nextRadar) => {
          setSelectedFilter('all');
          setRadar(nextRadar);
          setLoadFailed(false);
        }}
      />
    </section>
  );
}

export default Radar;
