import { LOCALE_STORAGE_KEY, DEFAULT_LOCALE } from '../../shared/i18n.js';

const API_BASE = '/api';

function getLocaleHeader() {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  return window.localStorage.getItem(LOCALE_STORAGE_KEY) || window.navigator.language || DEFAULT_LOCALE;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Accept-Language': getLocaleHeader(),
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Error de red' }));
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
  getAuthStatus: () => request('/auth/status'),
  bootstrap: (payload) => request('/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) }),
  getAccount: () => request('/account'),
  updateAccount: (payload) => request('/account', { method: 'PUT', body: JSON.stringify(payload) }),
  resetCollection: () => request('/account/reset', { method: 'POST' }),
  getPreference: (key) => request(`/account/preferences/${encodeURIComponent(key)}`),
  setPreference: (key, value) => request(`/account/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value })
  }),
  getStats: () => request('/stats'),
  getCollection: (params = {}) => request(`/collection?${new URLSearchParams(params).toString()}`),
  getCollectionCovers: () => request('/collection/covers'),
  getRandomRelease: () => request('/collection/random'),
  getRelease: (id) => request(`/collection/${id}`),
  updateRelease: (id, payload) => request(`/collection/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }),
  startSync: () => request('/sync', { method: 'POST' }),
  enrichValues: () => request('/sync/enrich', { method: 'POST' }),
  stopEnrich: () => request('/sync/enrich/stop', { method: 'POST' }),
  getSyncStatus: () => request('/sync/status'),
  getValue: () => request('/value'),
  listUsers: () => request('/admin/users'),
  createUser: (payload) => request('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id, payload) => request(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify(payload) }),
  importPreview: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/import/preview', { method: 'POST', body: form });
  },
  importApply: (previewId) => request('/import/apply', { method: 'POST', body: JSON.stringify({ previewId }) }),
  getImportStatus: () => request('/import/status'),
  downloadImportTemplate: () => {
    window.open(`${API_BASE}/import/template`, '_blank', 'noopener');
  },
  fetchTapeteBlob: async (maxSize = 7200, filters = {}) => {
    const params = new URLSearchParams({ maxSize, ...filters });
    const response = await fetch(`${API_BASE}/media/tapete?${params}`, { credentials: 'include' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Error generando tapete' }));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return response.blob();
  },
  exportCollection: (format, params = {}) => {
    const query = new URLSearchParams({ format, ...params }).toString();
    window.open(`${API_BASE}/export?${query}`, '_blank', 'noopener');
  }
};
