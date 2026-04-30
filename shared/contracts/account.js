import { DEFAULT_CURRENCY, normalizeCurrency } from '../currency.js';

function asBoolean(value) {
  return value === true || value === 1;
}

function asNumber(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

export function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const id = asNumber(user.id);
  if (id == null) {
    return null;
  }

  return {
    id,
    username: asText(user.username),
    role: asText(user.role, 'user') || 'user',
    created_at: asNullableText(user.created_at)
  };
}

export function normalizeAuthStatus(payload = {}) {
  const user = normalizeUser(payload.user);
  const loggedIn = asBoolean(payload.loggedIn) || Boolean(user);

  return {
    needsBootstrap: asBoolean(payload.needsBootstrap),
    loggedIn,
    user: loggedIn ? user : null
  };
}

export function normalizeAccountResponse(payload = {}) {
  return {
    discogsUsername: asText(payload.discogsUsername).trim(),
    tokenConfigured: asBoolean(payload.tokenConfigured),
    tokenPreview: asNullableText(payload.tokenPreview),
    currency: normalizeCurrency(payload.currency)
  };
}

function buildCapabilities({ loggedIn, isAdmin, tokenConfigured, accountUnavailable }) {
  const hasDiscogs = loggedIn && tokenConfigured === true && !accountUnavailable;
  const canManageAccount = loggedIn && !accountUnavailable;

  return {
    canUseCollection: hasDiscogs,
    canSyncDiscogs: hasDiscogs,
    canImport: hasDiscogs,
    canExport: hasDiscogs,
    canManageAccount,
    canAdminUsers: loggedIn && isAdmin
  };
}

export function normalizeAccountState({ auth = {}, account = null, accountUnavailable = false } = {}) {
  const authStatus = normalizeAuthStatus(auth);
  const user = authStatus.user;
  const loggedIn = authStatus.loggedIn;
  const isAdmin = user?.role === 'admin';

  if (!loggedIn) {
    return {
      needsBootstrap: authStatus.needsBootstrap,
      loggedIn: false,
      user: null,
      isAdmin: false,
      accountUnavailable: false,
      discogs: {
        username: null,
        tokenConfigured: false,
        tokenPreview: null
      },
      preferences: {
        currency: DEFAULT_CURRENCY
      },
      capabilities: buildCapabilities({
        loggedIn: false,
        isAdmin: false,
        tokenConfigured: false,
        accountUnavailable: false
      })
    };
  }

  if (accountUnavailable) {
    return {
      needsBootstrap: authStatus.needsBootstrap,
      loggedIn: true,
      user,
      isAdmin,
      accountUnavailable: true,
      discogs: {
        username: null,
        tokenConfigured: null,
        tokenPreview: null
      },
      preferences: {
        currency: DEFAULT_CURRENCY
      },
      capabilities: buildCapabilities({
        loggedIn: true,
        isAdmin,
        tokenConfigured: null,
        accountUnavailable: true
      })
    };
  }

  const accountState = normalizeAccountResponse(account || {});

  return {
    needsBootstrap: authStatus.needsBootstrap,
    loggedIn: true,
    user,
    isAdmin,
    accountUnavailable: false,
    discogs: {
      username: accountState.discogsUsername || null,
      tokenConfigured: accountState.tokenConfigured,
      tokenPreview: accountState.tokenPreview
    },
    preferences: {
      currency: accountState.currency
    },
    capabilities: buildCapabilities({
      loggedIn: true,
      isAdmin,
      tokenConfigured: accountState.tokenConfigured,
      accountUnavailable: false
    })
  };
}
