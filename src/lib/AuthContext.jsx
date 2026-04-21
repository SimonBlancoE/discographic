import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { DEFAULT_CURRENCY } from '../../shared/currency';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [user, setUser] = useState(null);
  const [discogsConfigured, setDiscogsConfigured] = useState(false);
  const [accountUnavailable, setAccountUnavailable] = useState(false);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  async function refreshAccountState() {
    try {
      const account = await api.getAccount();
      setDiscogsConfigured(Boolean(account.tokenConfigured));
      setCurrency(account.currency || DEFAULT_CURRENCY);
      setAccountUnavailable(false);
      return account;
    } catch (error) {
      setDiscogsConfigured(false);
      setCurrency(DEFAULT_CURRENCY);
      setAccountUnavailable(true);
      throw error;
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const status = await api.getAuthStatus();
      setNeedsBootstrap(status.needsBootstrap);
      setUser(status.user || null);

      if (status.loggedIn) {
        await refreshAccountState().catch(() => null);
      } else {
        setDiscogsConfigured(false);
        setAccountUnavailable(false);
        setCurrency(DEFAULT_CURRENCY);
      }
    } catch {
      setUser(null);
      setDiscogsConfigured(false);
      setAccountUnavailable(false);
      setCurrency(DEFAULT_CURRENCY);
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
    accountUnavailable,
    currency,
    async login(username, password) {
      const result = await api.login({ username, password });
      setNeedsBootstrap(false);
      setUser(result.user);
      setLoading(false);
      await refreshAccountState().catch(() => null);
      return result;
    },
    async bootstrap(username, password) {
      const result = await api.bootstrap({ username, password });
      setNeedsBootstrap(false);
      setUser(result.user);
      setLoading(false);
      setDiscogsConfigured(false);
      setAccountUnavailable(false);
      return result;
    },
    async logout() {
      await api.logout();
      await refresh();
    },
    async refreshAccount() {
      return refreshAccountState();
    },
    async setCurrencyPreference(nextCurrency) {
      await api.setPreference('currency', nextCurrency);
      setCurrency(nextCurrency);
      return nextCurrency;
    },
    refresh
  }), [loading, needsBootstrap, user, discogsConfigured, accountUnavailable, currency]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
