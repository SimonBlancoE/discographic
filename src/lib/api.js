import { LOCALE_STORAGE_KEY, resolveLocale, translate } from '../../shared/i18n.js';
import { normalizeAccountResponse, normalizeAuthStatus } from '../../shared/contracts/account.js';
import { normalizeDashboardStats } from '../../shared/contracts/dashboardStats.js';
import {
  normalizeCollectionResponse,
  normalizeRandomRelease,
  normalizeReleaseDetail,
  normalizeWallResponse
} from '../../shared/contracts/release.js';
import { normalizeImportSyncState, normalizeSyncStatus } from '../../shared/contracts/syncStatus.js';

const API_BASE = '/api';

function getLocaleHeader() {
  if (typeof window === 'undefined') {
    return 'es';
  }

  return resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY) || window.navigator.language || 'es');
}

async function request(path, options = {}) {
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
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return response;
  }

  return response.json();
}

export const api = {
  getAuthStatus: async () => normalizeAuthStatus(await request('/auth/status')),
  bootstrap: (payload) => request('/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) }),
  getAccount: async () => normalizeAccountResponse(await request('/account')),
  updateAccount: (payload) => request('/account', { method: 'PUT', body: JSON.stringify(payload) }),
  resetCollection: () => request('/account/reset', { method: 'POST' }),
  getPreference: (key) => request(`/account/preferences/${encodeURIComponent(key)}`),
  setPreference: (key, value) => request(`/account/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value })
  }),
  getStats: async () => normalizeDashboardStats(await request('/stats')),
  getCollection: async (params = {}) => normalizeCollectionResponse(await request(`/collection?${new URLSearchParams(params).toString()}`)),
  getCollectionCovers: async () => normalizeWallResponse(await request('/collection/covers')),
  getRandomRelease: async () => normalizeRandomRelease(await request('/collection/random')),
  getRelease: async (id) => normalizeReleaseDetail(await request(`/collection/${id}`)),
  updateRelease: async (id, payload) => normalizeReleaseDetail(await request(`/collection/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })),
  startSync: () => request('/sync', { method: 'POST' }),
  enrichValues: () => request('/sync/enrich', { method: 'POST' }),
  stopEnrich: () => request('/sync/enrich/stop', { method: 'POST' }),
  getSyncStatus: async () => normalizeSyncStatus(await request('/sync/status')),
  listUsers: () => request('/admin/users'),
  createUser: (payload) => request('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id, payload) => request(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify(payload) }),
  importPreview: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/import/preview', { method: 'POST', body: form });
  },
  importApply: async (previewId) => {
    const result = await request('/import/apply', { method: 'POST', body: JSON.stringify({ previewId }) });
    return {
      ...result,
      syncState: result.syncState ? normalizeImportSyncState(result.syncState) : null
    };
  },
  getImportStatus: async () => normalizeImportSyncState(await request('/import/status')),
  downloadImportTemplate: () => {
    const locale = getLocaleHeader();
    const query = new URLSearchParams({ locale }).toString();
    window.open(`${API_BASE}/import/template?${query}`, '_blank', 'noopener');
  },
  fetchTapeteBlob: async (maxSize = 7200, filters = {}) => {
    const locale = getLocaleHeader();
    const params = new URLSearchParams({ maxSize, locale, ...filters });
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
  exportCollection: (format, params = {}) => {
    const locale = getLocaleHeader();
    const query = new URLSearchParams({ format, locale, ...params }).toString();
    window.open(`${API_BASE}/export?${query}`, '_blank', 'noopener');
  }
};
