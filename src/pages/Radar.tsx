import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  normalizeRadarResponse,
  type RadarRelease,
  type RadarResponse,
  type RadarSyncResult,
} from '../../shared/contracts/radar.js';
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

function createEmptyRadarResponse(): RadarResponse {
  return normalizeRadarResponse({});
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
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncResult, setSyncResult] = useState<RadarSyncResult | null>(null);

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar) {
      setRadar(createEmptyRadarResponse());
      setLoading(false);
      setLoadFailed(false);
      setSyncing(false);
      setSyncError('');
      setSyncResult(null);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadFailed(false);

    api.getRadar()
      .then((nextRadar) => {
        if (cancelled) {
          return;
        }

        setRadar(nextRadar);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setLoadFailed(true);
        setRadar(createEmptyRadarResponse());
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountUnavailable, capabilities.canUseRadar]);

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

      {renderRadarContent(radar, loading, loadFailed, t)}
    </section>
  );
}

export default Radar;
