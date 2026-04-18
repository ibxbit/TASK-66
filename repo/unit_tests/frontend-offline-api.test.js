const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const importModule = async (relativePath) => {
  const absolutePath = path.resolve(__dirname, '..', relativePath);
  return import(pathToFileURL(absolutePath).href);
};

const createLocalStorage = () => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
};

test('apiRequest non-GET does not queue on HTTP 400', async () => {
  global.localStorage = createLocalStorage();
  Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  global.fetch = async () => ({
    ok: false,
    status: 400,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: { message: 'Request validation failed' } })
  });

  const { apiRequest } = await importModule('frontend/src/lib/api.js');
  const { getQueueSize } = await importModule('frontend/src/lib/offline.js');

  await assert.rejects(
    () => apiRequest({ path: '/demo', method: 'POST', body: { a: 1 }, allowQueue: true }),
    /Request validation failed/
  );
  assert.equal(getQueueSize(), 0);
});

test('apiRequest non-GET queues on network failure', async () => {
  global.localStorage = createLocalStorage();
  Object.defineProperty(global, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  global.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  const { apiRequest } = await importModule('frontend/src/lib/api.js');
  const { getQueueSize } = await importModule('frontend/src/lib/offline.js');

  const result = await apiRequest({ path: '/demo', method: 'POST', body: { a: 1 }, allowQueue: true });
  assert.equal(result.data.queued, true);
  assert.equal(getQueueSize(), 1);
});

test('offline sync replays queued body without double-stringifying', async () => {
  global.localStorage = createLocalStorage();
  Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  const capturedBodies = [];
  global.fetch = async (_, init) => {
    capturedBodies.push(init.body);
    return { ok: true };
  };

  const { enqueueWrite, syncQueuedWrites } = await importModule('frontend/src/lib/offline.js');

  enqueueWrite({
    url: 'http://localhost:8080/api/v1/demo-a',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { x: 1 }
  });
  enqueueWrite({
    url: 'http://localhost:8080/api/v1/demo-b',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"y":2}'
  });

  const syncResult = await syncQueuedWrites();
  assert.equal(syncResult.synced, 2);
  assert.equal(syncResult.remaining, 0);
  assert.deepEqual(capturedBodies, ['{"x":1}', '{"y":2}']);
});
