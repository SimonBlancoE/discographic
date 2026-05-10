import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { normalizeRadarResponse } from '../../shared/contracts/radar.js';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/I18nContext';
import { api } from '../lib/api';

function Radar() {
  const { accountUnavailable, capabilities } = useAuth();
  const { t } = useI18n();
  const [radar, setRadar] = useState(() => normalizeRadarResponse({}));
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar) {
      setRadar(normalizeRadarResponse({}));
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
        setRadar(normalizeRadarResponse({}));
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

  const summaryCards = [
    ['radar.summary.total', radar.summary.total],
    ['radar.summary.active', radar.summary.active],
    ['radar.summary.hidden', radar.summary.hidden],
    ['radar.summary.resolved', radar.summary.resolved],
    ['radar.summary.missingFromSource', radar.summary.missingFromSource],
    ['radar.summary.priced', radar.summary.priced],
    ['radar.summary.pending', radar.summary.pending],
    ['radar.summary.failed', radar.summary.failed],
    ['radar.summary.unavailable', radar.summary.unavailable],
  ] as const;

  return (
    <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
      <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.eyebrow')}</p>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
        {summaryCards.map(([labelKey, value]) => (
          <article key={labelKey} className="rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t(labelKey)}</p>
            <p className="mt-3 font-display text-3xl text-white">{value}</p>
          </article>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-8 text-center text-slate-300">
          {t('radar.loading')}
        </div>
      ) : loadFailed ? (
        <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-8 text-center text-rose-100">
          {t('radar.loadFailed')}
        </div>
      ) : radar.items.length === 0 ? (
        <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-8">
          <h2 className="font-display text-4xl text-white">{t('radar.emptyTitle')}</h2>
          <p className="max-w-2xl text-base text-slate-300">{t('radar.emptyBody')}</p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {radar.items.map((item) => (
            <li key={item.id ?? item.release_id} className="rounded-3xl border border-white/10 bg-slate-950/30 p-5">
              <p className="font-display text-2xl text-white">{item.artist} - {item.title}</p>
              <p className="mt-2 text-sm text-slate-300">
                #{item.release_id} · {item.local.priority} · {item.marketplace.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Radar;
