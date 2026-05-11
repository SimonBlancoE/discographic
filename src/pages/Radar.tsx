import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RADAR_MINIMUM_CONDITION,
  RADAR_OPPORTUNITY_REASON,
  RADAR_PRIORITY,
  RADAR_SOURCE_STATUS,
  normalizeRadarResponse,
  normalizeRadarUpdateRunStatus,
  type RadarOpportunityReason,
  type RadarLocalDecisionPayload,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
  type RadarResponse,
  type RadarSyncResult,
  type RadarUpdateRunStatus,
} from '../../shared/contracts/radar.js';
import { MARKETPLACE_STATUS, type MarketplaceStatus } from '../../shared/contracts/marketplace.js';
import RadarWantlistImportPanel from '../components/RadarWantlistImportPanel';
import { useAuth } from '../lib/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { useI18n } from '../lib/I18nContext';
import { api } from '../lib/api';
import type { Translate } from '../lib/types';

const UPDATE_STATUS_CARDS = [
  { labelKey: 'radar.updateCurrent', valueKey: 'current' },
  { labelKey: 'radar.updateTotal', valueKey: 'total' },
  { labelKey: 'radar.updatePending', valueKey: 'pending' },
] as const;

const RADAR_PRIORITY_OPTIONS: RadarPriority[] = [
  RADAR_PRIORITY.LOW,
  RADAR_PRIORITY.NORMAL,
  RADAR_PRIORITY.HIGH,
];

const RADAR_MINIMUM_CONDITION_OPTIONS = [
  RADAR_MINIMUM_CONDITION.MINT,
  RADAR_MINIMUM_CONDITION.NEAR_MINT,
  RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
  RADAR_MINIMUM_CONDITION.VERY_GOOD,
  RADAR_MINIMUM_CONDITION.GOOD_PLUS,
  RADAR_MINIMUM_CONDITION.GOOD,
  RADAR_MINIMUM_CONDITION.FAIR,
  RADAR_MINIMUM_CONDITION.POOR,
] as const;

const RADAR_OPPORTUNITY_REASON_ORDER: RadarOpportunityReason[] = [
  RADAR_OPPORTUNITY_REASON.BELOW_TARGET,
  RADAR_OPPORTUNITY_REASON.HIGH_PRIORITY_AVAILABLE,
  RADAR_OPPORTUNITY_REASON.AVAILABLE_AGAIN,
  RADAR_OPPORTUNITY_REASON.ALREADY_IN_COLLECTION,
];

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

type RadarStateLabelKey =
  | 'radar.state.pending'
  | 'radar.state.unavailable'
  | 'radar.state.failed'
  | 'radar.state.hidden'
  | 'radar.state.resolved'
  | 'radar.state.missingFromSource';

type RadarCollectionMatchLabelKey =
  | 'radar.collectionMatch.single'
  | 'radar.collectionMatch.multiple';

const RADAR_MARKETPLACE_STATE_LABEL_KEYS: Partial<Record<MarketplaceStatus, RadarStateLabelKey>> = {
  [MARKETPLACE_STATUS.PENDING]: 'radar.state.pending',
  [MARKETPLACE_STATUS.UNAVAILABLE]: 'radar.state.unavailable',
  [MARKETPLACE_STATUS.FAILED]: 'radar.state.failed',
};

const UPDATE_POLL_MS = 2000;

type RadarReleaseDraft = {
  priority: RadarPriority;
  targetPrice: string;
  minimumCondition: RadarMinimumCondition | '';
  note: string;
  hidden: boolean;
  resolved: boolean;
};

type RadarSaveHandler = (id: number, payload: RadarLocalDecisionPayload) => Promise<void>;

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

function createReleaseDraft(item: RadarRelease): RadarReleaseDraft {
  return {
    priority: item.local.priority,
    targetPrice: item.local.target_price == null ? '' : item.local.target_price.toFixed(2),
    minimumCondition: item.local.minimum_condition ?? '',
    note: item.local.note,
    hidden: item.local.hidden,
    resolved: item.local.resolved,
  };
}

function createReleasePayload(draft: RadarReleaseDraft): RadarLocalDecisionPayload {
  return {
    local: {
      priority: draft.priority,
      target_price: draft.targetPrice.trim() ? Number(draft.targetPrice) : null,
      minimum_condition: draft.minimumCondition || null,
      note: draft.note,
      hidden: draft.hidden,
      resolved: draft.resolved,
    },
  };
}

function getOrderedOpportunityReasons(item: RadarRelease): RadarOpportunityReason[] {
  return RADAR_OPPORTUNITY_REASON_ORDER.filter((reason) => item.opportunity.reasons.includes(reason));
}

function getCollectionMatchLabelKey(copyCount: number): RadarCollectionMatchLabelKey {
  return copyCount === 1
    ? 'radar.collectionMatch.single'
    : 'radar.collectionMatch.multiple';
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

function getRadarStateLabelKeys(item: RadarRelease): RadarStateLabelKey[] {
  const labelKeys: RadarStateLabelKey[] = [];
  const marketplaceStateLabelKey = RADAR_MARKETPLACE_STATE_LABEL_KEYS[item.marketplace.status];

  if (marketplaceStateLabelKey) {
    labelKeys.push(marketplaceStateLabelKey);
  }

  if (item.source.status === RADAR_SOURCE_STATUS.MISSING) {
    labelKeys.push('radar.state.missingFromSource');
  }

  if (item.local.hidden) {
    labelKeys.push('radar.state.hidden');
  }

  if (item.local.resolved) {
    labelKeys.push('radar.state.resolved');
  }

  return labelKeys;
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

type RadarReleaseCardProps = {
  item: RadarRelease;
  t: Translate;
  onSave: RadarSaveHandler;
};

function RadarReleaseCard({
  item,
  t,
  onSave,
}: RadarReleaseCardProps) {
  const [draft, setDraft] = useState(() => createReleaseDraft(item));
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setDraft(createReleaseDraft(item));
    setSaveFailed(false);
  }, [item]);

  const displayCurrency = item.display_currency || 'EUR';
  const releaseKey = item.id ?? item.release_id ?? 0;
  const opportunityReasons = getOrderedOpportunityReasons(item);
  const stateLabelKeys = getRadarStateLabelKeys(item);
  const collectionMatch = item.opportunity.collection_match;
  const hasLabels = stateLabelKeys.length > 0 || opportunityReasons.length > 0;

  async function handleSave() {
    if (item.id == null) {
      return;
    }

    setSaving(true);
    setSaveFailed(false);

    try {
      await onSave(item.id, createReleasePayload(draft));
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-3xl border border-white/10 bg-slate-950/30 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="font-display text-2xl text-white">
            {item.artist} - {item.title}
          </p>
          <p className="text-sm text-slate-300">#{item.release_id}</p>
          {collectionMatch?.primary_release_id != null ? (
            <Link
              to={`/collection/${collectionMatch.primary_release_id}`}
              data-radar-collection={String(releaseKey)}
              className="inline-flex items-center text-sm text-cyan-200 no-underline transition hover:text-cyan-100"
            >
              {t(getCollectionMatchLabelKey(collectionMatch.copy_count), {
                count: collectionMatch.copy_count,
              })}
            </Link>
          ) : null}
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

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.priority')}</span>
          <select
            name={`radar-priority-${releaseKey}`}
            value={draft.priority}
            onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as RadarPriority }))}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          >
            {RADAR_PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {t(`radar.priority.${priority}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.targetPrice')} ({displayCurrency})</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            name={`radar-target-price-${releaseKey}`}
            value={draft.targetPrice}
            onInput={(event) => {
              const target = event.target as HTMLInputElement;
              setDraft((current) => ({ ...current, targetPrice: target.value }));
            }}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          />
        </label>

        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.minimumCondition')}</span>
          <select
            name={`radar-minimum-condition-${releaseKey}`}
            value={draft.minimumCondition}
            onChange={(event) => setDraft((current) => ({
              ...current,
              minimumCondition: event.target.value as RadarMinimumCondition | '',
            }))}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          >
            <option value="">{t('radar.minimumCondition.none')}</option>
            {RADAR_MINIMUM_CONDITION_OPTIONS.map((condition) => (
              <option key={condition} value={condition}>
                {t(`radar.minimumCondition.${condition}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400">{t('radar.minimumCondition.info')}</p>
        </label>

        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.note')}</span>
          <textarea
            name={`radar-note-${releaseKey}`}
            value={draft.note}
            onInput={(event) => {
              const target = event.target as HTMLTextAreaElement;
              setDraft((current) => ({ ...current, note: target.value }));
            }}
            rows={4}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-200">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name={`radar-hidden-${releaseKey}`}
            checked={draft.hidden}
            onChange={(event) => setDraft((current) => ({ ...current, hidden: event.target.checked }))}
          />
          <span>{t('radar.hidden')}</span>
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name={`radar-resolved-${releaseKey}`}
            checked={draft.resolved}
            onChange={(event) => setDraft((current) => ({ ...current, resolved: event.target.checked }))}
          />
          <span>{t('radar.resolved')}</span>
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          data-radar-save={String(releaseKey)}
          onClick={() => void handleSave()}
          disabled={saving}
          className="primary-button inline-flex items-center justify-center disabled:opacity-60"
        >
          {saving ? t('radar.saving') : t('radar.save')}
        </button>
        {saveFailed ? <p className="text-sm text-rose-200">{t('radar.saveFailed')}</p> : null}
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
  onSave: RadarSaveHandler;
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
  onSave,
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
    <ul className="grid gap-4">
      {items.map((item) => (
        <RadarReleaseCard key={item.id ?? item.release_id} item={item} t={t} onSave={onSave} />
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
      try {
        const nextStatus = await api.getRadarStatus();

        if (cancelled) {
          return;
        }

        setUpdateStatusError('');
        setUpdateRun(nextStatus);

        if (nextStatus.isRunning) {
          timer = window.setTimeout(pollStatus, UPDATE_POLL_MS);
          return;
        }

        const nextRadar = await api.getRadar();
        if (!cancelled) {
          setRadar(nextRadar);
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

  async function saveRadarRelease(id: number, payload: RadarLocalDecisionPayload) {
    const nextRadar = await api.updateRadarRelease(id, payload);
    setRadar(nextRadar);
  }

  async function handleStartUpdate() {
    setActionBusy(true);
    setUpdateError('');

    try {
      const nextStatus = await api.startRadarUpdateRun();
      setUpdateRun(nextStatus);
      setUpdateStatusError('');
      if (!nextStatus.isRunning) {
        setRadar(await api.getRadar());
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
      setUpdateRun(nextStatus);
      setRadar(nextRadar);
    } catch {
      setUpdateStatusError(t('radar.updateStatusError'));
    } finally {
      setActionBusy(false);
    }
  }

  function focusWantlistImport() {
    if (typeof importHeadingRef.current?.scrollIntoView === 'function') {
      importHeadingRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    } else if (typeof importSectionRef.current?.scrollIntoView === 'function') {
      importSectionRef.current.scrollIntoView({
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
            onClick={focusWantlistImport}
            aria-controls="radar-wantlist-fallback"
            className="secondary-button"
          >
            {t('radar.importAction')}
          </button>
          <button
            type="button"
            onClick={handleStartUpdate}
            disabled={loading || actionBusy || updateRun.isRunning}
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
        onSave: saveRadarRelease,
      })}

      <RadarWantlistImportPanel
        sectionId="radar-wantlist-fallback"
        sectionRef={importSectionRef}
        headingRef={importHeadingRef}
        onApplied={(nextRadar) => {
          setRadar(nextRadar);
          setLoadFailed(false);
        }}
      />
    </section>
  );
}

export default Radar;
