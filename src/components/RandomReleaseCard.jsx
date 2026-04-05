import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { formatCurrency, joinNames } from '../lib/format';
import { useI18n } from '../lib/I18nContext';

function RandomReleaseCard() {
  const { locale, t } = useI18n();
  const { currency } = useAuth();
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [shuffleLabel, setShuffleLabel] = useState('');

  const shuffleWords = locale === 'en'
    ? ['Looking for a gem...', 'Digging through crates...', 'Spinning the platter...', 'Pulling a sleeve...']
    : ['Buscando joya...', 'Revolviendo cajas...', 'Girando plato...', 'Sacando funda...'];

  async function pullRandom() {
    setLoading(true);
    setSpinning(true);
    setError('');
    setShuffleLabel(shuffleWords[Math.floor(Math.random() * shuffleWords.length)]);
    try {
      const [next] = await Promise.all([
        api.getRandomRelease(),
        new Promise((resolve) => window.setTimeout(resolve, 750))
      ]);
      setRelease(next);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSpinning(false);
      setLoading(false);
    }
  }

  return (
    <section className="glass-panel random-card overflow-hidden p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex-1 space-y-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('random.eyebrow')}</p>
            <h3 className="mt-2 font-display text-3xl text-white">{t('random.title')}</h3>
            <p className="mt-3 max-w-xl text-sm text-slate-400">
              {t('random.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={pullRandom} disabled={loading} className="primary-button disabled:opacity-60">
              {loading ? t('random.spin') : release ? t('random.another') : t('random.surprise')}
            </button>
            {release ? (
              <Link to={`/release/${release.id}`} className="secondary-button">
                {t('random.open')}
              </Link>
            ) : null}
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {spinning ? <p className="text-sm text-cyan-200/90">{shuffleLabel}</p> : null}
        </div>

        <div className="relative w-full max-w-sm">
          <div className="random-card__halo" aria-hidden="true" />
          <div className={`relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/70 p-4 shadow-[0_26px_60px_rgba(2,6,23,0.45)] transition duration-500 ${spinning ? 'random-card__shell--spinning' : ''}`}>
            {release ? (
              <div className="space-y-4">
                <div className="aspect-square overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/80">
                  {release.detail_cover_url || release.cover_url ? (
                    <img src={release.detail_cover_url || release.cover_url} alt={release.title} className={`h-full w-full object-cover transition duration-500 ${spinning ? 'scale-110 blur-[2px]' : ''}`} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-6xl">💿</div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-brand-200">{t('random.pick')}</p>
                  <h4 className="mt-2 font-display text-2xl text-white">{release.title}</h4>
                  <p className="mt-1 text-base text-slate-300">{release.artist}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                     <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{release.year || t('random.unknownYear')}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{joinNames(release.genres)}</span>
                    {release.estimated_value ? <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-100">{formatCurrency(release.estimated_value, currency)}</span> : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex aspect-square flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-white/10 bg-white/5 text-center text-slate-400">
                <div className="random-card__record" aria-hidden="true" />
                 <p className="max-w-xs text-sm">{t('random.placeholder')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default RandomReleaseCard;
