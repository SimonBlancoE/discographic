import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  normalizeRadarEnrichmentStatus,
  normalizeRadarResponse,
  type RadarEnrichmentStatus,
  type RadarRelease,
  type RadarResponse,
} from '../../shared/contracts/radar.js';
import { useAuth } from '../lib/AuthContext';
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

const ENRICH_POLL_MS = 2000;

function createEmptyRadarResponse(): RadarResponse {
  return normalizeRadarResponse({});
}

function createEmptyRadarEnrichmentStatus(): RadarEnrichmentStatus {
  return normalizeRadarEnrichmentStatus({});
}

function renderRadarRelease(item: RadarRelease) {
  return (
    <li key={item.id ?? item.release_id} className="rounded-3xl border border-white/10 bg-slate-950/30 p-5">
      <p className="font-display text-2xl text-white">
        {item.artist} - {item.title}
      </p>
      <p className="mt-2 text-sm text-slate-300">
        #{item.release_id} · {item.local.priority} · {item.marketplace.status}
      </p>
    </li>
  );
}

function renderRadarContent(radar: RadarResponse, loading: boolean, loadFailed: boolean, t: Translate) {
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

  if (radar.items.length === 0) {
    return (
      <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-8">
        <h2 className="font-display text-4xl text-white">{t('radar.emptyTitle')}</h2>
        <p className="max-w-2xl text-base text-slate-300">{t('radar.emptyBody')}</p>
      </div>
    );
  }

  return <ul className="grid gap-4">{radar.items.map(renderRadarRelease)}</ul>;
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

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar) {
      setRadar(createEmptyRadarResponse());
      setEnrichment(createEmptyRadarEnrichmentStatus());
      setLoading(false);
      setLoadFailed(false);
      setEnrichStatusError('');
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

  return (
    <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
      <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.eyebrow')}</p>

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

      {renderRadarContent(radar, loading, loadFailed, t)}
    </section>
  );
}

export default Radar;
