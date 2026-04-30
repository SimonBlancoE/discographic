import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { normalizeAccountState, normalizeAuthStatus } from '../../shared/contracts/account';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [accountState, setAccountState] = useState(() => normalizeAccountState());

  async function refreshAccountState(auth = accountState) {
    try {
      const account = await api.getAccount();
      const nextState = normalizeAccountState({ auth, account });
      setAccountState(nextState);
      return nextState;
    } catch (error) {
      const nextState = normalizeAccountState({ auth, accountUnavailable: true });
      setAccountState(nextState);
      throw error;
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const status = await api.getAuthStatus();

      if (status.loggedIn) {
        await refreshAccountState(status).catch(() => null);
      } else {
        setAccountState(normalizeAccountState({ auth: status }));
      }
    } catch {
      setAccountState(normalizeAccountState());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(() => ({
    loading,
    accountState,
    capabilities: accountState.capabilities,
    needsBootstrap: accountState.needsBootstrap,
    user: accountState.user,
    loggedIn: accountState.loggedIn,
    isAdmin: accountState.isAdmin,
    discogsConfigured: accountState.discogs.tokenConfigured === true,
    accountUnavailable: accountState.accountUnavailable,
    currency: accountState.preferences.currency,
    async login(username, password) {
      const result = await api.login({ username, password });
      const auth = normalizeAuthStatus({ needsBootstrap: false, loggedIn: true, user: result.user });
      setAccountState(normalizeAccountState({ auth }));
      setLoading(false);
      await refreshAccountState(auth).catch(() => null);
      return result;
    },
    async bootstrap(username, password) {
      const result = await api.bootstrap({ username, password });
      const auth = normalizeAuthStatus({ needsBootstrap: false, loggedIn: true, user: result.user });
      setAccountState(normalizeAccountState({ auth, account: { tokenConfigured: false } }));
      setLoading(false);
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
      const nextState = normalizeAccountState({
        auth: accountState,
        account: {
          discogsUsername: accountState.discogs.username || '',
          tokenConfigured: accountState.discogs.tokenConfigured === true,
          tokenPreview: accountState.discogs.tokenPreview,
          currency: nextCurrency
        }
      });
      setAccountState(nextState);
      return nextState.preferences.currency;
    },
    refresh
  }), [loading, accountState]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
