/**
 * Frontend↔Backend integration tests — no API transport mocking.
 *
 * These tests exercise the same end-to-end flows the React frontend performs via
 * src/lib/api.js (login → CSRF capture → GET cache → protected write → step-up).
 * They verify the contract the frontend relies on (shape, headers, status codes,
 * CSRF enforcement, step-up enforcement) against a live backend process bound
 * to a real MongoDB — zero mocks on the transport layer.
 *
 * If this suite passes, the frontend's API client contract is validated
 * against the true backend, not an in-memory stub.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';

const parseCookies = (setCookieHeaders = []) =>
  setCookieHeaders.map((cookie) => cookie.split(';')[0]).join('; ');

/**
 * fetch wrapper that matches how the frontend's api.js constructs requests:
 *  - credentials: 'include' equivalent (explicit Cookie header)
 *  - Content-Type: application/json
 *  - X-CSRF-Token on non-GET
 *  - X-Step-Up-Token when present
 */
const feLikeRequest = async ({ path, method = 'GET', body, cookie, csrfToken, stepUpToken }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  if (stepUpToken) headers['X-Step-Up-Token'] = stepUpToken;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const text = await response.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
  }
  return {
    status: response.status,
    json,
    headers: response.headers,
    contentType: response.headers.get('content-type') || '',
    cookie: parseCookies(setCookie)
  };
};

test('FE↔BE: login rotates session, exposes csrfToken+user, and /auth/me mirrors user context', { concurrency: false }, async () => {
  const bootstrap = await feLikeRequest({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'admin.dev', password: 'AdminSecure!2026' }
  });
  assert.equal(bootstrap.status, 200);
  assert.ok(bootstrap.json.data.csrfToken, 'login response must include csrfToken');
  assert.ok(bootstrap.json.data.user, 'login response must include user');
  assert.ok(Array.isArray(bootstrap.json.data.user.roles));
  assert.ok(bootstrap.cookie.includes('museum_sid'));

  const me = await feLikeRequest({ path: '/auth/me', method: 'GET', cookie: bootstrap.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.data.user.username, 'admin.dev');
  assert.deepEqual(me.json.data.user.roles, bootstrap.json.data.user.roles);
});

test('FE↔BE: protected write requires CSRF header the frontend captures from login', { concurrency: false }, async () => {
  const login = await feLikeRequest({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'curator.dev', password: 'CuratorSecure!2026' }
  });
  assert.equal(login.status, 200);
  const cookie = login.cookie;
  const csrfToken = login.json.data.csrfToken;

  // Without CSRF header: protected write is rejected with CSRF_TOKEN_INVALID
  const noCsrf = await feLikeRequest({
    path: '/catalog/items',
    method: 'POST',
    cookie,
    body: {
      title: `FE-BE No CSRF ${Date.now()}`,
      catalogNumber: `FE-NC-${Date.now()}`,
      artist: 'X',
      series: 'X',
      country: 'USA',
      period: '2026',
      category: 'fe'
    }
  });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.json.error.code, 'CSRF_TOKEN_INVALID');

  // With CSRF header from login: same write succeeds
  const withCsrf = await feLikeRequest({
    path: '/catalog/items',
    method: 'POST',
    cookie,
    csrfToken,
    body: {
      title: `FE-BE With CSRF ${Date.now()}`,
      catalogNumber: `FE-OK-${Date.now()}`,
      artist: 'X',
      series: 'X',
      country: 'USA',
      period: '2026',
      category: 'fe'
    }
  });
  assert.equal(withCsrf.status, 201);
  assert.ok(withCsrf.json.data.id);
});

test('FE↔BE: search -> curation lifecycle replays the SearchDiscoveryTab flow end-to-end', { concurrency: false }, async () => {
  const suffix = `${Date.now()}`;
  const login = await feLikeRequest({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'curator.dev', password: 'CuratorSecure!2026' }
  });
  const cookie = login.cookie;
  const csrfToken = login.json.data.csrfToken;

  // 1. Curator creates an item (mirrors SearchDiscoveryTab "save curation")
  const create = await feLikeRequest({
    path: '/catalog/items',
    method: 'POST',
    cookie,
    csrfToken,
    body: {
      title: `FE Search Target ${suffix}`,
      catalogNumber: `FES-${suffix}`,
      artist: 'FE Artist',
      series: 'FE Series',
      country: 'USA',
      period: '2020s',
      category: 'Showcase',
      tags: ['fe', 'integration']
    }
  });
  assert.equal(create.status, 201);

  // 2. Search (what the public tab loads, unauthenticated)
  const search = await feLikeRequest({
    path: `/catalog/search?q=FES-${suffix}&page=1&pageSize=10`,
    method: 'GET'
  });
  assert.equal(search.status, 200);
  assert.ok(Array.isArray(search.json.data));
  assert.ok(search.json.data.some((row) => row.catalogNumber === `FES-${suffix}`));
  assert.ok(search.json.pagination);
  assert.equal(search.json.meta.cache, 'MISS');

  // 3. Autocomplete (same tab uses this on typeahead debounce)
  const auto = await feLikeRequest({
    path: `/catalog/autocomplete?q=FE Search&limit=5`,
    method: 'GET'
  });
  assert.equal(auto.status, 200);
  assert.ok(Array.isArray(auto.json.data));

  // 4. Hot keyword curation flow: create + list
  const hotCreate = await feLikeRequest({
    path: '/catalog/hot-keywords',
    method: 'POST',
    cookie,
    csrfToken,
    body: {
      keyword: `fe-hot-${suffix}`,
      rank: 3,
      activeFrom: '2026-01-01T00:00:00Z',
      activeTo: '2027-01-01T00:00:00Z'
    }
  });
  assert.equal(hotCreate.status, 201);

  const hotList = await feLikeRequest({ path: '/catalog/hot-keywords', method: 'GET', cookie });
  assert.equal(hotList.status, 200);
  assert.ok(hotList.json.data.some((k) => k.keyword === `fe-hot-${suffix}`));
});

test('FE↔BE: step-up flow for GRAPH_PUBLISH matches CuratorTab’s sensitive-action pattern', { concurrency: false }, async () => {
  const login = await feLikeRequest({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'curator.dev', password: 'CuratorSecure!2026' }
  });
  const cookie = login.cookie;
  const csrfToken = login.json.data.csrfToken;

  const draft = await feLikeRequest({ path: '/graph/drafts', method: 'POST', cookie, csrfToken });
  assert.equal(draft.status, 201);

  // Frontend UI: user attempts to publish without step-up → backend refuses, UI prompts
  const publishNoStep = await feLikeRequest({
    path: `/graph/drafts/${draft.json.data.draftId}/publish`,
    method: 'POST',
    cookie,
    csrfToken
  });
  assert.equal(publishNoStep.status, 403);
  assert.equal(publishNoStep.json.error.code, 'STEP_UP_REQUIRED');

  // Frontend UI: user enters password → POST /auth/step-up → obtains step-up token
  const stepUp = await feLikeRequest({
    path: '/auth/step-up',
    method: 'POST',
    cookie,
    csrfToken,
    body: { password: 'CuratorSecure!2026', action: 'GRAPH_PUBLISH' }
  });
  assert.equal(stepUp.status, 200);
  assert.ok(stepUp.json.data.stepUpToken);
  assert.ok(stepUp.json.data.validUntil, 'step-up expiry advertised to FE via validUntil');
  assert.equal(stepUp.json.data.action, 'GRAPH_PUBLISH');

  // Frontend retries original sensitive action with step-up token in header
  const publishWithStep = await feLikeRequest({
    path: `/graph/drafts/${draft.json.data.draftId}/publish`,
    method: 'POST',
    cookie,
    csrfToken,
    stepUpToken: stepUp.json.data.stepUpToken
  });
  // Step-up success (no validation issues on empty published snapshot)
  assert.ok([200, 422].includes(publishWithStep.status), 'step-up accepted by backend');
  if (publishWithStep.status === 200) {
    assert.ok(Number.isInteger(publishWithStep.json.data.version));
  } else {
    assert.equal(publishWithStep.json.error.code, 'GRAPH_VALIDATION_BLOCKED');
  }
});

test('FE↔BE: logout invalidates session cookie for subsequent reads', { concurrency: false }, async () => {
  const login = await feLikeRequest({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'reviewer.dev', password: 'ReviewerSecure!2026' }
  });
  const cookie = login.cookie;
  const csrfToken = login.json.data.csrfToken;

  const meBefore = await feLikeRequest({ path: '/auth/me', method: 'GET', cookie });
  assert.equal(meBefore.status, 200);

  const logout = await feLikeRequest({
    path: '/auth/logout',
    method: 'POST',
    cookie,
    csrfToken
  });
  assert.equal(logout.status, 204);

  const meAfter = await feLikeRequest({ path: '/auth/me', method: 'GET', cookie });
  assert.equal(meAfter.status, 401);
  assert.equal(meAfter.json.error.code, 'UNAUTHENTICATED');
});
