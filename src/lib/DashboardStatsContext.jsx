import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDashboardBadgeGenres } from '../../shared/contracts/dashboardStats.js';
import { useAuth } from './AuthContext';
import { api } from './api';

const DashboardStatsContext = createContext(null);

export function DashboardStatsProvider({ children }) {
  const { accountUnavailable, discogsConfigured } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!discogsConfigured || accountUnavailable) {
      setStats(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setLoading(true);

    try {
      const payload = await api.getStats();
      setStats(payload);
      setError(null);
      return payload;
    } catch (nextError) {
      setStats(null);
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [accountUnavailable, discogsConfigured]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const badgeGenres = useMemo(() => getDashboardBadgeGenres(stats), [stats]);

  const value = useMemo(() => ({
    stats,
    badgeGenres,
    loading,
    error,
    refresh
  }), [stats, badgeGenres, loading, error, refresh]);

  return <DashboardStatsContext.Provider value={value}>{children}</DashboardStatsContext.Provider>;
}

export function useDashboardStats() {
  const context = useContext(DashboardStatsContext);
  if (!context) {
    throw new Error('useDashboardStats must be used within DashboardStatsProvider');
  }
  return context;
}
