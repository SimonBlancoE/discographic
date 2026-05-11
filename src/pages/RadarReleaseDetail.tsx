import { type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type RadarCollectionMatch,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
} from '../../shared/contracts/radar.js';
import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';
import {
  RADAR_MINIMUM_CONDITION_OPTIONS,
  RADAR_PRIORITY_OPTIONS,
  createRadarReleaseDraft,
  createRadarReleasePayload,
  formatRadarMarketplaceValue,
  getOrderedRadarOpportunityReasons,
  getRadarCollectionMatchLabelKey,
  getRadarSourceOriginLabelKey,
  getRadarSourceStatusLabelKey,
  getRadarStateLabelKeys,
  type RadarReleaseDraft,
} from '../lib/radarPresentation';
import type { Translate } from '../lib/types';
import type { ApiError } from '../lib/types';

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
      {t(getRadarCollectionMatchLabelKey(collectionMatch.copy_count), {
        count: collectionMatch.copy_count,
      })}
    </Link>
  );
}

type RadarDetailFrameProps = {
  children: ReactNode;
  t: Translate;
};

function RadarDetailFrame({ children, t }: RadarDetailFrameProps) {
  return (
    <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
      <Link to="/radar" data-radar-detail-back="true" className="inline-flex items-center gap-2 text-sm text-brand-200 transition hover:text-brand-100">
        {t('radar.detailBack')}
      </Link>
      {children}
    </section>
  );
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
        setDraft(createRadarReleaseDraft(payload));
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
      const nextRadar = await api.updateRadarRelease(release.id, createRadarReleasePayload(draft));
      const updatedRelease = nextRadar.items.find((item) => item.id === release.id);
      const nextRelease = updatedRelease ?? (await api.getRadarRelease(release.id));
      setRelease(nextRelease);
      setDraft(createRadarReleaseDraft(nextRelease));
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(patch: Partial<RadarReleaseDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  if (loading) {
    return (
      <RadarDetailFrame t={t}>
        <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-8 text-center text-slate-300">
          {t('radar.detailLoading')}
        </div>
      </RadarDetailFrame>
    );
  }

  if (loadFailed) {
    return (
      <RadarDetailFrame t={t}>
        <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-8 text-center text-rose-100">
          {t('radar.detailLoadFailed')}
        </div>
      </RadarDetailFrame>
    );
  }

  if (notFound || !release || !draft) {
    return (
      <RadarDetailFrame t={t}>
        <div className="rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-8 text-center text-slate-300">
          {t('radar.detailNotFound')}
        </div>
      </RadarDetailFrame>
    );
  }

  const releaseKey = release.id ?? release.release_id ?? 0;
  const displayCurrency = release.display_currency || 'EUR';
  const collectionMatch = release.opportunity.collection_match;
  const opportunityReasons = getOrderedRadarOpportunityReasons(release);
  const stateLabelKeys = getRadarStateLabelKeys(release);

  return (
    <RadarDetailFrame t={t}>
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
            <p className="mt-3 text-lg text-white">{formatRadarMarketplaceValue(release)}</p>
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
              onChange={(event) => updateDraft({ priority: event.target.value as RadarPriority })}
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
                updateDraft({ targetPrice: target.value });
              }}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-200">
            <span>{t('radar.minimumCondition')}</span>
            <select
              name={`radar-minimum-condition-${releaseKey}`}
              value={draft.minimumCondition}
              onChange={(event) => updateDraft({ minimumCondition: event.target.value as RadarMinimumCondition | '' })}
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
                updateDraft({ note: target.value });
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
              onChange={(event) => updateDraft({ hidden: event.target.checked })}
            />
            <span>{t('radar.hidden')}</span>
          </label>

          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name={`radar-resolved-${releaseKey}`}
              checked={draft.resolved}
              onChange={(event) => updateDraft({ resolved: event.target.checked })}
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
    </RadarDetailFrame>
  );
}

export default RadarReleaseDetail;
