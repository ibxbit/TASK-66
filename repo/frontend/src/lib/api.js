import { enqueueWrite, syncQueuedWrites } from './offline.js';

const baseUrl = (import.meta?.env?.VITE_BACKEND_URL || '') + '/api/v1';
const getCache = new Map();

let authContext = {
  userScope: 'anonymous',
  csrfToken: '',
  stepUpToken: ''
};

const buildQuery = (query = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
};

const buildScopedGetCacheKey = (fullPath) => `${authContext.userScope}:${fullPath}`;

const isNetworkFailure = (error) => {
  if (!error) {
    return false;
  }
  if (error.name === 'TypeError') {
    return true;
  }
  const message = String(error.message || '').toLowerCase();
  return message.includes('network') || message.includes('failed to fetch');
};

const clearServiceWorkerApiCaches = async () => {
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    await caches.delete('museum-api-read-v1');
    await caches.delete('museum-api-read-v2');
  } catch (error) {
    // ignore cache cleanup failures
  }
};

const fetchWithHeaders = async ({ fullPath, method, body, csrfToken, stepUpToken }) => {
  const url = `${baseUrl}${fullPath}`;
  const headers = {
    'Content-Type': 'application/json'
  };
  const csrf = csrfToken || authContext.csrfToken;
  if (csrf && method !== 'GET') {
    headers['X-CSRF-Token'] = csrf;
  }
  const stepUp = stepUpToken || authContext.stepUpToken;
  if (stepUp) {
    headers['X-Step-Up-Token'] = stepUp;
  }

  return fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
};

export const setApiAuthContext = ({ userId, csrfToken, stepUpToken }) => {
  authContext = {
    userScope: userId ? `user:${userId}` : 'anonymous',
    csrfToken: csrfToken || '',
    stepUpToken: stepUpToken || ''
  };
};

export const clearApiGetCache = () => {
  getCache.clear();
};

export const clearSecuritySensitiveClientState = async () => {
  clearApiGetCache();
  await clearServiceWorkerApiCaches();
};

export const buildScopedCacheKeyForTest = (fullPath, userScope) => `${userScope}:${fullPath}`;

export const apiRequest = async ({
  path,
  method = 'GET',
  query,
  body,
  csrfToken,
  stepUpToken,
  allowQueue = true
}) => {
  const fullPath = `${path}${buildQuery(query)}`;

  if (method === 'GET') {
    const key = buildScopedGetCacheKey(fullPath);
    try {
      const response = await fetchWithHeaders({ fullPath, method, body, csrfToken, stepUpToken });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error?.message || 'Request failed');
      }
      getCache.set(key, json);
      return { ...json, _meta: { fromCache: false } };
    } catch (error) {
      const cached = getCache.get(key);
      if (cached) {
        return { ...cached, _meta: { fromCache: true } };
      }
      throw error;
    }
  }

  let response;
  try {
    response = await fetchWithHeaders({ fullPath, method, body, csrfToken, stepUpToken });
  } catch (error) {
    if (allowQueue && isNetworkFailure(error)) {
      enqueueWrite({
        path: fullPath,
        method,
        body,
        userScope: authContext.userScope
      });
      return {
        data: {
          queued: true,
          message: 'Request queued while offline and will sync automatically'
        }
      };
    }
    throw error;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const json = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(json?.error?.message || `Request failed (${response.status})`);
  }

  return json || { data: { ok: true } };
};

export const syncOfflineQueue = async () =>
  syncQueuedWrites({
    canReplay(item) {
      if (!authContext.userScope || authContext.userScope === 'anonymous') {
        return false;
      }
      return item.userScope === authContext.userScope;
    },
    execute: async ({ path, method, body }) =>
      fetchWithHeaders({
        fullPath: path,
        method,
        body: body ? JSON.parse(body) : undefined,
        csrfToken: authContext.csrfToken,
        stepUpToken: ''
      })
  });

export const apiBase = baseUrl;
