import { DEFAULT_CURRENCY, normalizeCurrency, type Currency } from '../currency.js';

type UnknownRecord = Record<string, unknown>;
type AuthPayload = {
  needsBootstrap?: unknown;
  loggedIn?: unknown;
  user?: unknown;
} | null | undefined;
type AccountPayload = {
  discogsUsername?: unknown;
  tokenConfigured?: unknown;
  tokenPreview?: unknown;
  currency?: unknown;
} | null | undefined;

export type NormalizedUser = {
  id: number;
  username: string;
  role: string;
  created_at: string | null;
};

export type AuthStatus = {
  needsBootstrap: boolean;
  loggedIn: boolean;
  user: NormalizedUser | null;
};

export type AccountResponse = {
  discogsUsername: string;
  tokenConfigured: boolean;
  tokenPreview: string | null;
  currency: Currency;
};

export type AccountCapabilities = {
  canUseCollection: boolean;
  canUseRadar: boolean;
  canSyncDiscogs: boolean;
  canImport: boolean;
  canExport: boolean;
  canManageAccount: boolean;
  canAdminUsers: boolean;
};

export type AccountState = {
  needsBootstrap: boolean;
  loggedIn: boolean;
  user: NormalizedUser | null;
  isAdmin: boolean;
  accountUnavailable: boolean;
  discogs: {
    username: string | null;
    tokenConfigured: boolean | null;
    tokenPreview: string | null;
  };
  preferences: {
    currency: Currency;
  };
  capabilities: AccountCapabilities;
};

function asBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

export function normalizeUser(user: unknown): NormalizedUser | null {
  const record = asRecord(user);
  if (!record) {
    return null;
  }

  const id = asNumber(record.id);
  if (id == null) {
    return null;
  }

  return {
    id,
    username: asText(record.username),
    role: asText(record.role, 'user') || 'user',
    created_at: asNullableText(record.created_at)
  };
}

export function normalizeAuthStatus(payload: AuthPayload = {}): AuthStatus {
  const source = payload ?? {};
  const user = normalizeUser(source.user);
  const loggedIn = asBoolean(source.loggedIn) || Boolean(user);

  return {
    needsBootstrap: asBoolean(source.needsBootstrap),
    loggedIn,
    user: loggedIn ? user : null
  };
}

export function normalizeAccountResponse(payload: AccountPayload = {}): AccountResponse {
  const source = payload ?? {};
  return {
    discogsUsername: asText(source.discogsUsername).trim(),
    tokenConfigured: asBoolean(source.tokenConfigured),
    tokenPreview: asNullableText(source.tokenPreview),
    currency: normalizeCurrency(source.currency)
  };
}

function buildCapabilities({
  loggedIn,
  isAdmin,
  tokenConfigured,
  accountUnavailable,
}: {
  loggedIn: boolean;
  isAdmin: boolean;
  tokenConfigured: boolean | null;
  accountUnavailable: boolean;
}): AccountCapabilities {
  const hasConfiguredDiscogsAccount = loggedIn && tokenConfigured === true && !accountUnavailable;
  const canManageAccount = loggedIn && !accountUnavailable;

  return {
    canUseCollection: hasConfiguredDiscogsAccount,
    canUseRadar: hasConfiguredDiscogsAccount,
    canSyncDiscogs: hasConfiguredDiscogsAccount,
    canImport: hasConfiguredDiscogsAccount,
    canExport: hasConfiguredDiscogsAccount,
    canManageAccount,
    canAdminUsers: loggedIn && isAdmin
  };
}

export function normalizeAccountState({
  auth = {},
  account = null,
  accountUnavailable = false,
}: {
  auth?: AuthPayload;
  account?: AccountPayload;
  accountUnavailable?: boolean;
} = {}): AccountState {
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
