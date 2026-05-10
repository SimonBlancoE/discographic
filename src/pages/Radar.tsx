import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { normalizeRadarResponse, type RadarRelease, type RadarResponse } from '../../shared/contracts/radar.js';
import RadarWantlistImportPanel from '../components/RadarWantlistImportPanel';
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

function createEmptyRadarResponse(): RadarResponse {
  return normalizeRadarResponse({});
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

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar) {
      setRadar(createEmptyRadarResponse());
      setLoading(false);
      setLoadFailed(false);
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

      <RadarWantlistImportPanel />

      {renderRadarContent(radar, loading, loadFailed, t)}
    </section>
  );
}

export default Radar;
