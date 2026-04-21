import { useEffect, useState } from 'react';
import CoverWall from '../components/CoverWall';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/I18nContext';

function CollectionWall() {
  const { accountUnavailable, discogsConfigured } = useAuth();
  const { t } = useI18n();
  const [releases, setReleases] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!discogsConfigured || accountUnavailable) {
      setLoading(false);
      return;
    }

    api.getCollectionCovers()
      .then((payload) => {
        setReleases(payload.releases || []);
        setFilters(payload.filters || {});
      })
      .catch((nextError) => setError(nextError.message))
      .finally(() => setLoading(false));
  }, [discogsConfigured, accountUnavailable]);

  if (accountUnavailable) {
    return <div className="glass-panel p-8 text-center text-amber-100">{t('wall.accountUnavailable')}</div>;
  }

  if (!discogsConfigured) {
    return <div className="glass-panel p-8 text-center text-slate-300">{t('wall.configure')}</div>;
  }

  if (loading) {
    return <div className="glass-panel p-8 text-center text-slate-300">{t('wall.loading')}</div>;
  }

  if (error) {
    return <div className="glass-panel p-8 text-center text-rose-300">{error}</div>;
  }

  return <CoverWall releases={releases} filters={filters} />;
}

export default CollectionWall;
