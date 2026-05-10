import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RADAR_MINIMUM_CONDITION,
  RADAR_OPPORTUNITY_REASON,
  RADAR_PRIORITY,
  normalizeRadarEnrichmentStatus,
  normalizeRadarResponse,
  type RadarOpportunityReason,
  type RadarEnrichmentStatus,
  type RadarLocalDecisionPayload,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
  type RadarResponse,
  type RadarSyncResult,
} from '../../shared/contracts/radar.js';
import RadarWantlistImportPanel from '../components/RadarWantlistImportPanel';
import { useAuth } from '../lib/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { useI18n } from '../lib/I18nContext';
import { api } from '../lib/api';
import type { Translate } from '../lib/types';

const RADAR_SUMMARY_CARDS = [
  { labelKey: 'radar.summary.total', valueKey: 'total' },
  { labelKey: 'radar.summary.active', valueKey: 'active' },
  { labelKey: 'radar.summary.hidden', valueKey: 'hidden' },
  { labelKey: 'radar.summary.resolved', valueKey: 'resolved' },
  { labelKey: 'radar.summary.missingFromSource', valueKey: 'missingFromSource' },
  { labelKey: 'radar.summary.priced', valueKey: 'priced' },
  { labelKey: 'radar.summary.pending', valueKey: 'pending' },
  { labelKey: 'radar.summary.failed', valueKey: 'failed' },
  { labelKey: 'radar.summary.unavailable', valueKey: 'unavailable' },
] as const;

const ENRICH_STATUS_CARDS = [
  { labelKey: 'radar.enrichCurrent', valueKey: 'current' },
  { labelKey: 'radar.enrichTotal', valueKey: 'total' },
  { labelKey: 'radar.enrichPending', valueKey: 'pending' },
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

const ENRICH_POLL_MS = 2000;

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

function createEmptyRadarEnrichmentStatus(): RadarEnrichmentStatus {
  return normalizeRadarEnrichmentStatus({});
}

function renderSyncResult(syncResult: RadarSyncResult, t: Translate) {
  return (
    <div className="rounded-3xl border border-emerald-300/20 bg-emerald-950/20 p-5 text-emerald-50">
      <p className="text-sm uppercase tracking-[0.28em] text-emerald-200">{t('radar.syncResultTitle')}</p>
      <p className="mt-2 text-base">{t('radar.syncResultSummary', { count: syncResult.totalFetched })}</p>
      <p className="mt-2 text-sm text-emerald-100/90">
        {t('radar.syncBreakdown', {
          added: syncResult.added,
          updated: syncResult.updated,
          reactivated: syncResult.reactivated,
          markedMissing: syncResult.markedMissing,
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

function getVisibleRadarItems(radar: RadarResponse): RadarRelease[] {
  return radar.items.filter((item) => item.opportunity.default_visible);
}

function getOrderedOpportunityReasons(item: RadarRelease): RadarOpportunityReason[] {
  return RADAR_OPPORTUNITY_REASON_ORDER.filter((reason) => item.opportunity.reasons.includes(reason));
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
          <p className="text-sm text-slate-300">
            #{item.release_id} · {item.marketplace.status}
          </p>
          {opportunityReasons.length ? (
            <div className="flex flex-wrap gap-2">
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

function renderRadarContent(
  radar: RadarResponse,
  loading: boolean,
  loadFailed: boolean,
  t: Translate,
  onSave: RadarSaveHandler,
) {
  const visibleItems = getVisibleRadarItems(radar);

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

  if (visibleItems.length === 0) {
    return (
      <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-8">
        <h2 className="font-display text-4xl text-white">{t('radar.emptyTitle')}</h2>
        <p className="max-w-2xl text-base text-slate-300">{t('radar.emptyBody')}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {visibleItems.map((item) => (
        <RadarReleaseCard key={item.id ?? item.release_id} item={item} t={t} onSave={onSave} />
      ))}
    </ul>
  );
}

function Radar() {
  const { accountUnavailable, capabilities } = useAuth();
  const { t } = useI18n();
  const [radar, setRadar] = useState(createEmptyRadarResponse);
  const [enrichment, setEnrichment] = useState(createEmptyRadarEnrichmentStatus);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [enrichStatusError, setEnrichStatusError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncResult, setSyncResult] = useState<RadarSyncResult | null>(null);

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar) {
      setRadar(createEmptyRadarResponse());
      setEnrichment(createEmptyRadarEnrichmentStatus());
      setLoading(false);
      setLoadFailed(false);
      setEnrichStatusError('');
      setSyncing(false);
      setSyncError('');
      setSyncResult(null);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadFailed(false);
    setEnrichStatusError('');

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
          setEnrichment(statusResult.value);
        } else {
          setEnrichment(createEmptyRadarEnrichmentStatus());
          setEnrichStatusError(t('radar.enrichStatusError'));
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
    if (accountUnavailable || !capabilities.canUseRadar || !enrichment.isRunning) {
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

        setEnrichStatusError('');
        setEnrichment(nextStatus);

        if (nextStatus.isRunning) {
          timer = window.setTimeout(pollStatus, ENRICH_POLL_MS);
          return;
        }

        const nextRadar = await api.getRadar();
        if (!cancelled) {
          setRadar(nextRadar);
        }
      } catch {
        if (!cancelled) {
          setEnrichStatusError(t('radar.enrichStatusError'));
        }
      }
    }

    timer = window.setTimeout(pollStatus, ENRICH_POLL_MS);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [accountUnavailable, capabilities.canUseRadar, enrichment.isRunning]);

  async function saveRadarRelease(id: number, payload: RadarLocalDecisionPayload) {
    const nextRadar = await api.updateRadarRelease(id, payload);
    setRadar(nextRadar);
  }

  async function handleEnrich() {
    setActionBusy(true);

    try {
      await api.enrichRadar();
      setEnrichStatusError('');
      setEnrichment(await api.getRadarStatus());
    } catch {
      setEnrichStatusError(t('radar.enrichStatusError'));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStopEnrich() {
    setActionBusy(true);

    try {
      await api.stopRadarEnrich();
      setEnrichStatusError('');

      const [nextStatus, nextRadar] = await Promise.all([
        api.getRadarStatus(),
        api.getRadar(),
      ]);

      setEnrichment(nextStatus);
      setRadar(nextRadar);
    } catch {
      setEnrichStatusError(t('radar.enrichStatusError'));
    } finally {
      setActionBusy(false);
    }
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

  async function handleSync() {
    setSyncing(true);
    setSyncError('');

    try {
      const response = await api.syncRadar();
      setRadar(response.radar);
      setSyncResult(response.result);
      setLoadFailed(false);
    } catch (error) {
      setSyncError(t('radar.syncError', { error: getErrorMessage(error, t('client.networkError')) }));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.eyebrow')}</p>
        <button
          type="button"
          onClick={handleSync}
          disabled={loading || syncing}
          className="primary-button disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? t('radar.syncing') : t('radar.syncAction')}
        </button>
      </div>

      {syncResult ? renderSyncResult(syncResult, t) : null}

      {syncError ? (
        <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-5 text-rose-100">
          {syncError}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
        {RADAR_SUMMARY_CARDS.map(({ labelKey, valueKey }) => (
          <article key={labelKey} className="rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t(labelKey)}</p>
            <p className="mt-3 font-display text-3xl text-white">{radar.summary[valueKey]}</p>
          </article>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.enrichTitle')}</p>
              <h2 className="mt-2 font-display text-3xl text-white">{t(`radar.enrichState.${enrichment.status}`)}</h2>
            </div>
            <p className="max-w-2xl text-sm text-slate-300">{t('radar.enrichBody')}</p>
            <p className="text-sm text-slate-300">{enrichment.message}</p>
          </div>

          <div className="flex items-center gap-3">
            {enrichment.isRunning ? (
              <button
                type="button"
                onClick={handleStopEnrich}
                disabled={actionBusy}
                className="secondary-button text-sm disabled:opacity-50"
              >
                {t('radar.enrichStop')}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnrich}
                disabled={actionBusy || enrichment.pending === 0}
                className="secondary-button text-sm disabled:opacity-50"
              >
                {t('radar.enrichStart')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-900/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
            style={{ width: `${enrichment.progressPercent}%` }}
          />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.enrichStatus')}</p>
            <p className="mt-3 font-display text-2xl text-white">{t(`radar.enrichState.${enrichment.status}`)}</p>
          </article>
          {ENRICH_STATUS_CARDS.map(({ labelKey, valueKey }) => (
            <article key={labelKey} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t(labelKey)}</p>
              <p className="mt-3 font-display text-2xl text-white">{enrichment[valueKey]}</p>
            </article>
          ))}
        </div>

        {enrichStatusError ? (
          <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">
            {enrichStatusError}
          </div>
        ) : null}
      </div>

      <RadarWantlistImportPanel
        onApplied={(nextRadar) => {
          setRadar(nextRadar);
          setLoadFailed(false);
        }}
      />

      {renderRadarContent(radar, loading, loadFailed, t, saveRadarRelease)}
    </section>
  );
}

export default Radar;
