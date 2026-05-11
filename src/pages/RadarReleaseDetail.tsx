import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  RADAR_MINIMUM_CONDITION,
  RADAR_OPPORTUNITY_REASON,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
  type RadarCollectionMatch,
  type RadarLocalDecisionPayload,
  type RadarMinimumCondition,
  type RadarOpportunityReason,
  type RadarPriority,
  type RadarRelease,
} from '../../shared/contracts/radar.js';
import { MARKETPLACE_STATUS, type MarketplaceStatus } from '../../shared/contracts/marketplace.js';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useI18n } from '../lib/I18nContext';
import type { Translate } from '../lib/types';
import type { ApiError } from '../lib/types';

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

type RadarReleaseDraft = {
  priority: RadarPriority;
  targetPrice: string;
  minimumCondition: RadarMinimumCondition | '';
  note: string;
  hidden: boolean;
  resolved: boolean;
};

const RADAR_MARKETPLACE_STATE_LABEL_KEYS: Partial<Record<MarketplaceStatus, RadarStateLabelKey>> = {
  [MARKETPLACE_STATUS.PENDING]: 'radar.state.pending',
  [MARKETPLACE_STATUS.UNAVAILABLE]: 'radar.state.unavailable',
  [MARKETPLACE_STATUS.FAILED]: 'radar.state.failed',
};

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
  return copyCount === 1 ? 'radar.collectionMatch.single' : 'radar.collectionMatch.multiple';
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

function getRadarSourceOriginLabelKey(origin: RadarRelease['source']['origin']) {
  switch (origin) {
    case RADAR_SOURCE_ORIGIN.DISCOGS:
      return 'radar.sourceOrigin.discogs';
    case RADAR_SOURCE_ORIGIN.FILE:
      return 'radar.sourceOrigin.file';
    case RADAR_SOURCE_ORIGIN.BOTH:
      return 'radar.sourceOrigin.both';
    default:
      return 'radar.sourceOrigin.none';
  }
}

function getRadarSourceStatusLabelKey(status: RadarRelease['source']['status']) {
  return status === RADAR_SOURCE_STATUS.MISSING
    ? 'radar.sourceStatus.missing'
    : 'radar.sourceStatus.active';
}

function getCollectionLink(item: RadarRelease, collectionMatch: RadarCollectionMatch | null, t: Translate) {
  if (collectionMatch?.primary_release_id == null) {
    return null;
  }

  return (
    <Link
      to={`/collection/${collectionMatch.primary_release_id}`}
      data-radar-collection={String(item.id ?? item.release_id ?? 0)}
      className="inline-flex items-center text-sm text-cyan-200 no-underline transition hover:text-cyan-100"
    >
      {t(getCollectionMatchLabelKey(collectionMatch.copy_count), {
        count: collectionMatch.copy_count,
      })}
    </Link>
  );
}

function formatMarketplaceValue(item: RadarRelease): string {
  if (item.marketplace.estimated_price == null) {
    return '-';
  }

  const displayCurrency = item.display_currency || 'EUR';
  return `${item.marketplace.estimated_price.toFixed(2)} ${displayCurrency}`;
}

function RadarReleaseDetail() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const [release, setRelease] = useState<RadarRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<RadarReleaseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setLoadFailed(false);
        setNotFound(false);
        setSaveFailed(false);
        const payload = await api.getRadarRelease(id);

        if (cancelled) {
          return;
        }

        setRelease(payload);
        setDraft(createReleaseDraft(payload));
      } catch (error) {
        if (cancelled) {
          return;
        }

        const apiError = error as ApiError;
        setRelease(null);
        setDraft(null);
        if (apiError.status === 404) {
          setNotFound(true);
          return;
        }

        setLoadFailed(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!id) {
      setRelease(null);
      setDraft(null);
      setLoading(false);
      setNotFound(true);
      return () => {
        cancelled = true;
      };
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    if (release?.id == null || !draft) {
      return;
    }

    setSaving(true);
    setSaveFailed(false);

    try {
      const nextRadar = await api.updateRadarRelease(release.id, createReleasePayload(draft));
      const nextRelease = nextRadar.items.find((item) => item.id === release.id) ?? await api.getRadarRelease(release.id);
      setRelease(nextRelease);
      setDraft(createReleaseDraft(nextRelease));
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
        <Link to="/radar" data-radar-detail-back="true" className="inline-flex items-center gap-2 text-sm text-brand-200 transition hover:text-brand-100">
          {t('radar.detailBack')}
        </Link>
        <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-8 text-center text-slate-300">
          {t('radar.detailLoading')}
        </div>
      </section>
    );
  }

  if (loadFailed) {
    return (
      <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
        <Link to="/radar" data-radar-detail-back="true" className="inline-flex items-center gap-2 text-sm text-brand-200 transition hover:text-brand-100">
          {t('radar.detailBack')}
        </Link>
        <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-8 text-center text-rose-100">
          {t('radar.detailLoadFailed')}
        </div>
      </section>
    );
  }

  if (notFound || !release || !draft) {
    return (
      <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
        <Link to="/radar" data-radar-detail-back="true" className="inline-flex items-center gap-2 text-sm text-brand-200 transition hover:text-brand-100">
          {t('radar.detailBack')}
        </Link>
        <div className="rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-8 text-center text-slate-300">
          {t('radar.detailNotFound')}
        </div>
      </section>
    );
  }

  const releaseKey = release.id ?? release.release_id ?? 0;
  const collectionMatch = release.opportunity.collection_match;
  const opportunityReasons = getOrderedOpportunityReasons(release);
  const stateLabelKeys = getRadarStateLabelKeys(release);

  return (
    <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
      <Link to="/radar" data-radar-detail-back="true" className="inline-flex items-center gap-2 text-sm text-brand-200 transition hover:text-brand-100">
        {t('radar.detailBack')}
      </Link>

      <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <div>
              <p className="font-display text-3xl text-white">{release.artist} - {release.title}</p>
              <p className="mt-2 text-sm text-slate-300">#{release.release_id}{release.year ? ` • ${release.year}` : ''}</p>
            </div>
            {getCollectionLink(release, collectionMatch, t)}
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
          </div>
          <a
            href={`https://www.discogs.com/release/${release.release_id}`}
            target="_blank"
            rel="noreferrer"
            data-radar-discogs={String(releaseKey)}
            className="inline-flex items-center justify-center rounded-full border border-brand-200/40 px-4 py-2 text-sm text-brand-100 no-underline transition hover:border-brand-100 hover:text-white"
          >
            {t('radar.openDiscogs')}
          </a>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.detailMarketplacePrice')}</p>
            <p className="mt-3 text-lg text-white">{formatMarketplaceValue(release)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.detailSourceOrigin')}</p>
            <p className="mt-3 text-lg text-white">{t(getRadarSourceOriginLabelKey(release.source.origin))}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t('radar.detailSourceStatus')}</p>
            <p className="mt-3 text-lg text-white">{t(getRadarSourceStatusLabelKey(release.source.status))}</p>
          </article>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-200">
            <span>{t('radar.priority')}</span>
            <select
              name={`radar-priority-${releaseKey}`}
              value={draft.priority}
              onChange={(event) => setDraft((current) => current ? {
                ...current,
                priority: event.target.value as RadarPriority,
              } : current)}
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
            <span>{t('radar.targetPrice')} ({release.display_currency || 'EUR'})</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              name={`radar-target-price-${releaseKey}`}
              value={draft.targetPrice}
              onInput={(event) => {
                const target = event.target as HTMLInputElement;
                setDraft((current) => current ? { ...current, targetPrice: target.value } : current);
              }}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-200">
            <span>{t('radar.minimumCondition')}</span>
            <select
              name={`radar-minimum-condition-${releaseKey}`}
              value={draft.minimumCondition}
              onChange={(event) => setDraft((current) => current ? {
                ...current,
                minimumCondition: event.target.value as RadarMinimumCondition | '',
              } : current)}
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
                setDraft((current) => current ? { ...current, note: target.value } : current);
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
              onChange={(event) => setDraft((current) => current ? { ...current, hidden: event.target.checked } : current)}
            />
            <span>{t('radar.hidden')}</span>
          </label>

          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name={`radar-resolved-${releaseKey}`}
              checked={draft.resolved}
              onChange={(event) => setDraft((current) => current ? { ...current, resolved: event.target.checked } : current)}
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
      </div>
    </section>
  );
}

export default RadarReleaseDetail;
