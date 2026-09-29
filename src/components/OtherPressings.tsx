import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { MasterVersionsResponse } from '../../shared/contracts/masterVersions.js';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { formatCompactNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import CoverImage from './CoverImage';
import Icon from './Icon';

const INITIAL_VISIBLE = 8;

/**
 * Other pressings of the same master release, loaded on demand (one Discogs request, cached
 * server-side) so opening a release detail never spends rate limit on it.
 */
function OtherPressings({ releaseId, discogsReleaseId }: { releaseId: number; discogsReleaseId: number | null }) {
  const { t } = useI18n();
  const [data, setData] = useState<MasterVersionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [vinylOnly, setVinylOnly] = useState(false);

  useEffect(() => {
    setData(null);
    setError('');
    setShowAll(false);
  }, [releaseId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api.getReleaseVersions(releaseId));
    } catch (loadError) {
      setError(getErrorMessage(loadError, t('client.networkError')));
    } finally {
      setLoading(false);
    }
  }

  const versions = (data?.versions ?? []).filter((version) => !vinylOnly || /vinyl|LP|7"|12"|10"/i.test(version.format ?? ''));
  const visible = showAll ? versions : versions.slice(0, INITIAL_VISIBLE);

  return (
    <section className="glass-panel p-5" aria-labelledby="other-pressings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="other-pressings-title" className="flex items-center gap-2 font-display text-xl text-white">
            <Icon name="layers" size={18} className="text-brand-300" />
            {t('pressings.title')}
          </h3>
          <p className="mt-1 text-sm text-slate-400">{t('pressings.subtitle')}</p>
        </div>
        {data ? (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={vinylOnly} onChange={(event) => setVinylOnly(event.target.checked)} className="accent-brand-300" />
            {t('pressings.vinylOnly')}
          </label>
        ) : (
          <button type="button" onClick={load} disabled={loading} className="secondary-button disabled:opacity-60">
            {loading ? t('pressings.loading') : t('pressings.load')}
          </button>
        )}
      </div>

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

      {data && !data.masterId ? <p className="mt-4 text-sm text-slate-400">{t('pressings.noMaster')}</p> : null}

      {data?.masterId ? (
        <>
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">
            {t('pressings.count', { count: data.total })}
            {data.total > data.versions.length ? ` · ${t('pressings.partial', { count: data.versions.length })}` : ''}
          </p>
          <ul className="mt-3 divide-y divide-white/5">
            {visible.map((version) => {
              const isCurrent = version.releaseId === discogsReleaseId;
              return (
                <li key={version.releaseId} className={`flex items-center gap-3 py-2.5 ${isCurrent ? 'rounded-xl bg-brand-400/5 px-2' : ''}`}>
                  <CoverImage src={version.thumb} alt="" loading="lazy" className="h-11 w-11 flex-none rounded-lg object-cover" placeholderClassName="h-11 w-11 flex-none rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-100">
                      {version.format || version.title}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {[version.released, version.country, version.label, version.catno].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="hidden flex-none text-right text-xs text-slate-400 sm:block">
                    <span title={t('release.communityHave')}>{formatCompactNumber(version.have)} ◉</span>
                    <span className="ml-2 text-brand-200/80" title={t('release.communityWant')}>{formatCompactNumber(version.want)} ♥</span>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    {isCurrent ? <span className="pill-tag border-brand-300/40 text-brand-100">{t('pressings.thisOne')}</span> : null}
                    {!isCurrent && version.localReleaseId ? (
                      <Link to={`/release/${version.localReleaseId}`} className="pill-tag border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10">{t('pressings.owned')}</Link>
                    ) : null}
                    {version.inRadar ? <span className="pill-tag border-cyan-300/30 text-cyan-200">{t('pressings.wanted')}</span> : null}
                    <a
                      href={`https://www.discogs.com/release/${version.releaseId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="icon-button h-8 w-8"
                      aria-label={t('pressings.openDiscogs')}
                      title={t('pressings.openDiscogs')}
                    >
                      <Icon name="external" size={14} />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
          {versions.length > INITIAL_VISIBLE ? (
            <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-3 text-sm text-brand-200 hover:text-brand-100">
              {showAll ? t('pressings.showLess') : t('pressings.showAll', { count: versions.length })}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default OtherPressings;
