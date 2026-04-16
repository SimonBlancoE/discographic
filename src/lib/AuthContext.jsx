import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { DEFAULT_CURRENCY } from '../../shared/currency';
import { PREFERENCE_KEYS } from '../../shared/preferences';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [user, setUser] = useState(null);
  const [discogsConfigured, setDiscogsConfigured] = useState(false);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  function applyAccount(account) {
    setDiscogsConfigured(Boolean(account.tokenConfigured));
    setCurrency(account.currency || DEFAULT_CURRENCY);
  }

  async function refresh() {
    setLoading(true);
    try {
      const status = await api.getAuthStatus();
      setNeedsBootstrap(status.needsBootstrap);
      setUser(status.user || null);

      if (status.loggedIn) {
        applyAccount(await api.getAccount());
      } else {
        setDiscogsConfigured(false);
        setCurrency(DEFAULT_CURRENCY);
      }
    } catch (error) {
      console.error('[auth] refresh failed:', error);
      setUser(null);
      setDiscogsConfigured(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(() => ({
    loading,
    needsBootstrap,
    user,
    loggedIn: Boolean(user),
    isAdmin: user?.role === 'admin',
    discogsConfigured,
    currency,
    async login(username, password) {
      const result = await api.login({ username, password });
      setNeedsBootstrap(false);
      setUser(result.user);
      setLoading(false);
      applyAccount(await api.getAccount());
      return result;
    },
    async bootstrap(username, password) {
      const result = await api.bootstrap({ username, password });
      setNeedsBootstrap(false);
      setUser(result.user);
      setLoading(false);
      setDiscogsConfigured(false);
      return result;
    },
    async logout() {
      await api.logout();
      await refresh();
    },
    async refreshAccount() {
      const account = await api.getAccount();
      applyAccount(account);
      return account;
    },
    async setCurrencyPreference(nextCurrency) {
      await api.setPreference(PREFERENCE_KEYS.CURRENCY, nextCurrency);
      setCurrency(nextCurrency);
      return nextCurrency;
    },
    refresh
  }), [loading, needsBootstrap, user, discogsConfigured, currency]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
