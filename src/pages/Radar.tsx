import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/I18nContext';

function Radar() {
  const { accountUnavailable, capabilities } = useAuth();
  const { t } = useI18n();

  if (accountUnavailable) {
    return <div className="glass-panel p-8 text-center text-amber-100">{t('radar.accountUnavailable')}</div>;
  }

  if (!capabilities.canUseRadar) {
    return (
      <section className="glass-panel mx-auto max-w-3xl space-y-5 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('nav.radar')}</p>
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
    <section className="glass-panel mx-auto max-w-4xl space-y-4 p-8">
      <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.emptyEyebrow')}</p>
      <div className="space-y-3">
        <h2 className="font-display text-4xl text-white">{t('radar.emptyTitle')}</h2>
        <p className="max-w-2xl text-base text-slate-300">{t('radar.emptyBody')}</p>
      </div>
    </section>
  );
}

export default Radar;
