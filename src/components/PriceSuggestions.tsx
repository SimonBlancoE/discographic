import { useEffect, useState } from 'react';
import type { PriceSuggestionsResponse } from '../../shared/contracts/priceSuggestions.js';
import { conditionShortLabel } from '../../shared/contracts/collectionFields.js';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { formatCurrency } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import Icon from './Icon';

const SELLER_SETTINGS_URL = 'https://www.discogs.com/settings/seller';

/** Discogs price suggestions per grade, fetched on demand (one request, cached on the server). */
function PriceSuggestions({ releaseId, mediaCondition }: { releaseId: number; mediaCondition: string | null }) {
  const { t } = useI18n();
  const [data, setData] = useState<PriceSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
  }, [releaseId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api.getPriceSuggestions(releaseId));
    } catch (loadError) {
      setError(getErrorMessage(loadError, t('client.networkError')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icon name="tag" size={15} className="text-amber-300" />
            {t('suggestions.title')}
          </p>
          <p className="mt-1 text-xs text-slate-400">{t('suggestions.hint')}</p>
        </div>
        {!data ? (
          <button type="button" onClick={load} disabled={loading} className="secondary-button flex-none px-3 py-1.5 text-xs disabled:opacity-60">
            {loading ? t('suggestions.loading') : t('suggestions.load')}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      {data && !data.available ? (
        data.reason === 'seller_settings' ? (
          <div className="mt-3 text-sm text-slate-300">
            <p>{t('suggestions.sellerSettings')}</p>
            <a href={SELLER_SETTINGS_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-brand-200 hover:text-brand-100">
              {t('suggestions.sellerSettingsLink')}
              <Icon name="external" size={13} />
            </a>
          </div>
        ) : (
          <p className="mt-3 text-sm text-rose-300">{data.message || t('suggestions.error')}</p>
        )
      ) : null}

      {data?.available ? (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {data.suggestions.map((suggestion) => {
              const isYours = suggestion.condition === mediaCondition;
              return (
                <li
                  key={suggestion.condition}
                  title={suggestion.condition}
                  className={`rounded-xl border px-2.5 py-2 ${isYours ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/5 bg-white/[0.02]'}`}
                >
                  <p className="text-[11px] font-semibold text-slate-400">
                    {conditionShortLabel(suggestion.condition)}
                    {isYours ? <span className="ml-1 text-amber-200">· {t('suggestions.yourCopy')}</span> : null}
                  </p>
                  <p className={`mt-0.5 text-sm tabular-nums ${isYours ? 'font-semibold text-amber-100' : 'text-slate-200'}`}>
                    {formatCurrency(suggestion.value, data.currency)}
                  </p>
                </li>
              );
            })}
          </ul>
          {!mediaCondition ? <p className="mt-2 text-xs text-slate-500">{t('suggestions.gradeYourCopy')}</p> : null}
        </>
      ) : null}
    </div>
  );
}

export default PriceSuggestions;
