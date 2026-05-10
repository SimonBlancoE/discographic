import { LOCALE_STORAGE_KEY, resolveLocale, translate } from '../../shared/i18n.js';
import {
  normalizeAccountResponse,
  normalizeAuthStatus,
  type AccountResponse,
  type AuthStatus,
  type NormalizedUser,
} from '../../shared/contracts/account.js';
import { normalizeDashboardStats, type DashboardStats } from '../../shared/contracts/dashboardStats.js';
import {
  normalizeCollectionResponse,
  normalizeRandomRelease,
  normalizeReleaseDetail,
  normalizeWallResponse,
  type CollectionRelease,
  type ReleaseDetail,
  type WallRelease,
} from '../../shared/contracts/release.js';
import { normalizeRadarResponse, type RadarResponse } from '../../shared/contracts/radar.js';
import {
  normalizeImportSyncState,
  normalizeSyncStatus,
  type ImportSyncState,
  type SyncStatusState,
} from '../../shared/contracts/syncStatus.js';
import type { Currency } from '../../shared/currency.js';
import type { CollectionFilters } from '../../shared/collectionFilters.js';
import type {
  AccountUpdateResponse,
  ApiError,
  AuthMutationResponse,
  CollectionFilterOptions,
  CollectionPageResponse,
  ImportApplyResponse,
  ImportPreviewResponse,
  MeResponse,
  MessageResponse,
  PreferenceResponse,
  RadarWantlistPreviewResponse,
  RadarWantlistTemplateFormat,
  UpdateReleasePatch,
  UserListResponse,
  WallCollectionResponse,
} from './types';

const API_BASE = '/api';

function getLocaleHeader() {
  if (typeof window === 'undefined') {
    return 'es';
  }

  return resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY) || window.navigator.language || 'es');
}

type RequestOptions = RequestInit & {
  headers?: HeadersInit;
};

type JsonObject = Record<string, unknown>;
type AuthPayload = {
  username: string;
  password: string;
};

type AccountUpdatePayload = {
  discogsUsername: string;
  discogsToken?: string;
};

type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type CollectionQuery = Partial<Record<string, string | number>>;

type AdminUserPayload = {
  username: string;
  password: string;
};

type AdminResetPasswordPayload = {
  password: string;
};

type ImportApplyPayload = {
  previewId: string;
};

type PreferenceValue = string | number | boolean | string[] | JsonObject | null;

type RawAccountUpdateResponse = AccountResponse & {
  cacheReset?: boolean;
  message?: string;
};

type RawCollectionResponse = {
  releases: CollectionRelease[];
  displayCurrency: string | null;
  pagination: CollectionPageResponse['pagination'];
  filters: CollectionFilterOptions;
};

type RawWallResponse = {
  releases: WallRelease[];
  filters: CollectionFilterOptions;
};

function toQueryString(params: QueryParams): string {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))
  ).toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const locale = getLocaleHeader();
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Accept-Language': locale,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: translate(locale, 'client.networkError') }));
    const error = new Error(payload.error || `HTTP ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return response as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getAuthStatus: async (): Promise<AuthStatus> => normalizeAuthStatus(await request('/auth/status')),
  bootstrap: (payload: AuthPayload): Promise<AuthMutationResponse> => request('/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: AuthPayload): Promise<AuthMutationResponse> => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: (): Promise<MessageResponse> => request('/auth/logout', { method: 'POST' }),
  getMe: (): Promise<MeResponse> => request('/auth/me'),
  changePassword: (payload: ChangePasswordPayload): Promise<MessageResponse> => request('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) }),
  getAccount: async (): Promise<AccountResponse> => normalizeAccountResponse(await request('/account')),
  updateAccount: async (payload: AccountUpdatePayload): Promise<AccountUpdateResponse> => {
    const response = await request<RawAccountUpdateResponse>('/account', { method: 'PUT', body: JSON.stringify(payload) });
    return {
      ...normalizeAccountResponse(response),
      cacheReset: response.cacheReset,
      message: typeof response.message === 'string' ? response.message : undefined,
    };
  },
  resetCollection: (): Promise<MessageResponse> => request('/account/reset', { method: 'POST' }),
  getPreference: (key: string): Promise<PreferenceResponse> => request(`/account/preferences/${encodeURIComponent(key)}`),
  setPreference: (key: string, value: PreferenceValue): Promise<MessageResponse> => request(`/account/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value })
  }),
  getStats: async (): Promise<DashboardStats> => normalizeDashboardStats(await request('/stats')),
  getRadar: async (): Promise<RadarResponse> => normalizeRadarResponse(await request('/radar')),
  previewRadarWantlist: (file: File): Promise<RadarWantlistPreviewResponse> => {
    const form = new FormData();
    form.append('file', file);
    return request('/radar/wantlist/preview', { method: 'POST', body: form });
  },
  downloadRadarWantlistTemplate: (format: RadarWantlistTemplateFormat) => {
    const locale = getLocaleHeader();
    const query = toQueryString({ format, locale });
    window.open(`${API_BASE}/radar/wantlist/template?${query}`, '_blank', 'noopener');
  },
  getCollection: async (params: CollectionQuery = {}): Promise<CollectionPageResponse> => {
    const response = await request<RawCollectionResponse>(`/collection?${toQueryString(params)}`);
    const normalized = normalizeCollectionResponse(response);
    return {
      ...normalized,
      filters: response.filters,
    };
  },
  getCollectionCovers: async (): Promise<WallCollectionResponse> => {
    const response = await request<RawWallResponse>('/collection/covers');
    const normalized = normalizeWallResponse(response);
    return {
      ...normalized,
      filters: response.filters,
    };
  },
  getRandomRelease: async (): Promise<ReleaseDetail> => normalizeRandomRelease(await request('/collection/random')),
  getRelease: async (id: string | number): Promise<ReleaseDetail> => normalizeReleaseDetail(await request(`/collection/${id}`)),
  updateRelease: async (id: string | number, payload: UpdateReleasePatch): Promise<ReleaseDetail> => normalizeReleaseDetail(await request(`/collection/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })),
  startSync: (): Promise<MessageResponse> => request('/sync', { method: 'POST' }),
  enrichValues: (): Promise<MessageResponse> => request('/sync/enrich', { method: 'POST' }),
  stopEnrich: (): Promise<MessageResponse> => request('/sync/enrich/stop', { method: 'POST' }),
  getSyncStatus: async (): Promise<SyncStatusState> => normalizeSyncStatus(await request('/sync/status')),
  listUsers: (): Promise<UserListResponse> => request('/admin/users'),
  createUser: (payload: AdminUserPayload): Promise<{ ok: boolean; user: NormalizedUser | null }> => request('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (id: number): Promise<MessageResponse> => request(`/admin/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id: number, payload: AdminResetPasswordPayload): Promise<MessageResponse> => request(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify(payload) }),
  importPreview: (file: File): Promise<ImportPreviewResponse> => {
    const form = new FormData();
    form.append('file', file);
    return request('/import/preview', { method: 'POST', body: form });
  },
  importApply: async (previewId: string): Promise<ImportApplyResponse> => {
    const result = await request<ImportApplyResponse & { syncState: ImportSyncState | null }>('/import/apply', {
      method: 'POST',
      body: JSON.stringify({ previewId } satisfies ImportApplyPayload)
    });
    return {
      ...result,
      syncState: result.syncState ? normalizeImportSyncState(result.syncState) : null
    };
  },
  getImportStatus: async (): Promise<ImportSyncState> => normalizeImportSyncState(await request('/import/status')),
  downloadImportTemplate: () => {
    const locale = getLocaleHeader();
    const query = toQueryString({ locale });
    window.open(`${API_BASE}/import/template?${query}`, '_blank', 'noopener');
  },
  fetchTapeteBlob: async (maxSize = 7200, filters: CollectionFilters | Partial<CollectionFilters> = {}) => {
    const locale = getLocaleHeader();
    const params = toQueryString({ maxSize, locale, ...filters });
    const response = await fetch(`${API_BASE}/media/tapete?${params}`, {
      credentials: 'include',
      headers: {
        'Accept-Language': locale
      }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: translate(locale, 'client.tapeteError') }));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return response.blob();
  },
  exportCollection: (format: 'csv' | 'xlsx', params: Record<string, string | number> = {}) => {
    const locale = getLocaleHeader();
    const query = toQueryString({ format, locale, ...params });
    window.open(`${API_BASE}/export?${query}`, '_blank', 'noopener');
  }
};
