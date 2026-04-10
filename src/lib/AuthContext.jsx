import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [user, setUser] = useState(null);
  const [discogsConfigured, setDiscogsConfigured] = useState(false);
  const [currency, setCurrency] = useState('EUR');

  async function refresh() {
    setLoading(true);
    try {
      const status = await api.getAuthStatus();
      setNeedsBootstrap(status.needsBootstrap);
      setUser(status.user || null);

      if (status.loggedIn) {
        const account = await api.getAccount().catch(() => ({ tokenConfigured: false, currency: 'EUR' }));
        setDiscogsConfigured(Boolean(account.tokenConfigured));
        setCurrency(account.currency || 'EUR');
      } else {
        setDiscogsConfigured(false);
        setCurrency('EUR');
      }
    } catch {
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
      const account = await api.getAccount().catch(() => ({ tokenConfigured: false, currency: 'EUR' }));
      setDiscogsConfigured(Boolean(account.tokenConfigured));
      setCurrency(account.currency || 'EUR');
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
      const account = await api.getAccount().catch(() => ({ tokenConfigured: false, currency: 'EUR' }));
      setDiscogsConfigured(Boolean(account.tokenConfigured));
      setCurrency(account.currency || 'EUR');
      return account;
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
