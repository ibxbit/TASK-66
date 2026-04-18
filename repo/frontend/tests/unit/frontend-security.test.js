import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

const setupBrowserLikeGlobals = () => {
  globalThis.localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true
  });
  globalThis.caches = {
    deleted: [],
    async delete(name) {
      this.deleted.push(name);
      return true;
    }
  };
};

const importFresh = async (modulePath) => import(`${modulePath}?v=${Date.now()}_${Math.random()}`);

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

test('auth defaults are blank without explicit dev prefill flag', async () => {
  setupBrowserLikeGlobals();
  const authDefaults = await importFresh('../../src/lib/auth-defaults.js');
  assert.deepEqual(authDefaults.getInitialLoginForm(), { username: '', password: '' });
});

test('offline queue strips sensitive body keys and never stores headers', async () => {
  setupBrowserLikeGlobals();
  const offline = await importFresh('../../src/lib/offline.js');

  offline.enqueueWrite({
    path: '/jobs',
    method: 'POST',
    headers: {
      'X-CSRF-Token': 'csrf-secret',
      'X-Step-Up-Token': 'stepup-secret',
      Cookie: 'session=hidden'
    },
    body: {
      title: 'Allowed',
      password: 'hidden',
      nested: {
        token: 'hidden',
        ok: true
      }
    },
    userScope: 'user:abc'
  });

  const queue = JSON.parse(globalThis.localStorage.getItem('museum_ops_write_queue_v1'));
  assert.equal(queue.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(queue[0], 'headers'), false);
  assert.deepEqual(queue[0].body, {
    title: 'Allowed',
    nested: {
      ok: true
    }
  });
});

test('GET cache is user-scoped and cleared by security purge', async () => {
  setupBrowserLikeGlobals();
  const api = await importFresh('../../src/lib/api.js');

  api.setApiAuthContext({ userId: 'user-a', csrfToken: '', stepUpToken: '' });
  globalThis.fetch = async () => jsonResponse({ data: { items: ['a-only'] } });
  await api.apiRequest({ path: '/catalog/search', method: 'GET', query: { q: 'stamp' } });

  api.setApiAuthContext({ userId: 'user-b', csrfToken: '', stepUpToken: '' });
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(() => api.apiRequest({ path: '/catalog/search', method: 'GET', query: { q: 'stamp' } }));

  api.setApiAuthContext({ userId: 'user-a', csrfToken: '', stepUpToken: '' });
  const cached = await api.apiRequest({ path: '/catalog/search', method: 'GET', query: { q: 'stamp' } });
  assert.equal(cached._meta.fromCache, true);
  assert.deepEqual(cached.data.items, ['a-only']);

  await api.clearSecuritySensitiveClientState();
  assert.equal(globalThis.caches.deleted.includes('museum-api-read-v1'), true);

  await assert.rejects(() => api.apiRequest({ path: '/catalog/search', method: 'GET', query: { q: 'stamp' } }));
});

test('offline queueing from apiRequest persists minimal non-sensitive payload', async () => {
  setupBrowserLikeGlobals();
  const api = await importFresh('../../src/lib/api.js');

  api.setApiAuthContext({ userId: 'user-a', csrfToken: 'csrf-secret', stepUpToken: 'stepup-secret' });
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  const queued = await api.apiRequest({
    path: '/jobs',
    method: 'POST',
    body: {
      title: 'Weekend helper',
      password: 'hidden',
      csrfToken: 'hidden'
    }
  });

  assert.equal(queued.data.queued, true);
  const queue = JSON.parse(globalThis.localStorage.getItem('museum_ops_write_queue_v1'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].userScope, 'user:user-a');
  assert.equal(Object.prototype.hasOwnProperty.call(queue[0], 'headers'), false);
  assert.deepEqual(queue[0].body, { title: 'Weekend helper' });
});

test('tab role access allows authorized role and blocks forbidden role', async () => {
  const tabs = await importFresh('../../src/lib/tabs.js');
  assert.equal(tabs.hasTabAccess(['Program Coordinator'], 'programs'), true);
  assert.equal(tabs.hasTabAccess(['Employer'], 'audit'), false);
});

test('service worker sw.js file exists and defines cacheable API patterns', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const swPath = path.join(import.meta.dirname, '../../public/sw.js');
  const content = fs.readFileSync(swPath, 'utf8');

  assert.ok(content.includes('museum-app-shell-v1'), 'defines app shell cache name');
  assert.ok(content.includes('museum-api-read-v1'), 'defines API read cache name');
  assert.ok(content.includes('/api/v1/catalog/search'), 'caches catalog search');
  assert.ok(content.includes('/api/v1/catalog/autocomplete'), 'caches autocomplete');
  assert.ok(content.includes('/api/v1/catalog/hot-keywords'), 'caches hot keywords');
  assert.ok(content.includes("request.method !== 'GET'"), 'only caches GET requests');
  assert.ok(content.includes('OFFLINE'), 'provides offline fallback response');
  assert.ok(content.includes('caches.match(request)'), 'falls back to cache on network failure');
  assert.ok(content.includes('self.skipWaiting()'), 'activates immediately on install');
  assert.ok(content.includes('self.clients.claim()'), 'claims clients on activate');
});

test('API GET cache serves stale-on-error and returns fresh on success', async () => {
  setupBrowserLikeGlobals();
  const api = await importFresh('../../src/lib/api.js');

  api.setApiAuthContext({ userId: 'user-cache', csrfToken: '', stepUpToken: '' });

  globalThis.fetch = async () => jsonResponse({ data: { items: ['fresh-item'] } });
  const fresh = await api.apiRequest({ path: '/catalog/search', method: 'GET', query: { q: 'bird' } });
  assert.equal(fresh._meta.fromCache, false);
  assert.deepEqual(fresh.data.items, ['fresh-item']);

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const stale = await api.apiRequest({ path: '/catalog/search', method: 'GET', query: { q: 'bird' } });
  assert.equal(stale._meta.fromCache, true);
  assert.deepEqual(stale.data.items, ['fresh-item']);

  globalThis.fetch = async () => jsonResponse({ data: { items: ['updated-item'] } });
  const updated = await api.apiRequest({ path: '/catalog/search', method: 'GET', query: { q: 'bird' } });
  assert.equal(updated._meta.fromCache, false);
  assert.deepEqual(updated.data.items, ['updated-item']);
});
