const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';
const TEST_MONGO_URI =
  process.env.TEST_MONGO_URI ||
  'mongodb://museum_user:museum_pass@localhost:27017/museum_ops?authSource=admin';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseCookies = (setCookieHeaders = []) =>
  setCookieHeaders.map((cookie) => cookie.split(';')[0]).join('; ');

const request = async ({ path, method = 'GET', body, cookie, csrfToken, stepUpToken }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
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
    try {
      json = JSON.parse(text);
    } catch (error) {
      json = { raw: text };
    }
  }

  return {
    status: response.status,
    json,
    cookie: parseCookies(setCookie)
  };
};

const login = async (username, password) => {
  const response = await request({
    path: '/auth/login',
    method: 'POST',
    body: { username, password }
  });
  assert.equal(response.status, 200, `login failed for ${username}: ${response.json?.error?.message}`);
  return {
    cookie: response.cookie,
    csrfToken: response.json.data.csrfToken,
    user: response.json.data.user
  };
};

const acquireStepUp = async (auth, password, action) => {
  const response = await request({
    path: '/auth/step-up',
    method: 'POST',
    cookie: auth.cookie,
    csrfToken: auth.csrfToken,
    body: { password, action }
  });
  assert.equal(response.status, 200);
  return response.json.data.stepUpToken;
};

const createUserAsAdmin = async (adminAuth, user) => {
  const response = await request({
    path: '/users',
    method: 'POST',
    cookie: adminAuth.cookie,
    csrfToken: adminAuth.csrfToken,
    body: user
  });

  if (response.status === 409) {
    return null;
  }

  assert.equal(response.status, 201, `create user failed: ${response.json?.error?.message}`);
  return response.json.data;
};

const withMongo = async (fn) => {
  const connection = await mongoose.createConnection(TEST_MONGO_URI).asPromise();
  try {
    return await fn(connection);
  } finally {
    await connection.close();
  }
};

test('auth security: complexity, lockout, step-up, deterministic session invalidation', { concurrency: false }, async () => {
  const weak = await request({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'admin.dev', password: 'weak' }
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.json.error.code, 'VALIDATION_ERROR');

  const admin = await login('admin.dev', 'AdminSecure!2026');

  await createUserAsAdmin(admin, {
    username: 'lockout.case',
    password: 'LockoutPass!2026',
    roles: ['Reviewer']
  });

  for (let i = 0; i < 5; i += 1) {
    const failure = await request({
      path: '/auth/login',
      method: 'POST',
      body: { username: 'lockout.case', password: 'WrongPass!2026' }
    });
    assert.equal(failure.status, 401);
  }

  const locked = await request({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'lockout.case', password: 'LockoutPass!2026' }
  });
  assert.equal(locked.status, 401);
  assert.equal(locked.json.error.code, 'ACCOUNT_LOCKED');

  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(draft.status, 201);

  const noStepUp = await request({
    path: `/graph/drafts/${draft.json.data.draftId}/publish`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(noStepUp.status, 403);
  assert.equal(noStepUp.json.error.code, 'STEP_UP_REQUIRED');

  const logout = await request({
    path: '/auth/logout',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(logout.status, 204);

  const meAfterLogout = await request({ path: '/auth/me', method: 'GET', cookie: curator.cookie });
  assert.equal(meAfterLogout.status, 401);
});

test('session fixation mitigation rotates session id on re-authentication', { concurrency: false }, async () => {
  const firstLogin = await request({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'curator.dev', password: 'CuratorSecure!2026' }
  });
  assert.equal(firstLogin.status, 200);
  const firstSessionId = firstLogin.json.data.session.id;
  assert.ok(firstSessionId);

  const secondLogin = await request({
    path: '/auth/login',
    method: 'POST',
    cookie: firstLogin.cookie,
    body: { username: 'curator.dev', password: 'CuratorSecure!2026' }
  });
  assert.equal(secondLogin.status, 200);
  const secondSessionId = secondLogin.json.data.session.id;
  assert.ok(secondSessionId);
  assert.notEqual(secondSessionId, firstSessionId);
});

test('csrf bootstrap and enforcement: login works without csrf, protected writes still require csrf', { concurrency: false }, async () => {
  const loginResponse = await request({
    path: '/auth/login',
    method: 'POST',
    body: { username: 'curator.dev', password: 'CuratorSecure!2026' }
  });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.cookie;

  const missingCsrfWrite = await request({
    path: '/catalog/hot-keywords',
    method: 'POST',
    cookie,
    body: {
      keyword: `csrf-key-${Date.now()}`,
      rank: 1,
      activeFrom: '2026-01-01T00:00:00Z',
      activeTo: '2027-01-01T00:00:00Z'
    }
  });
  assert.equal(missingCsrfWrite.status, 403);
  assert.equal(missingCsrfWrite.json.error.code, 'CSRF_TOKEN_INVALID');
});

test('weak-format login attempts for existing account contribute to lockout', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;
  const username = `weak.lock.${suffix}`;

  await createUserAsAdmin(admin, {
    username,
    password: 'LockoutPass!2026',
    roles: ['Reviewer']
  });

  for (let i = 0; i < 5; i += 1) {
    const weakAttempt = await request({
      path: '/auth/login',
      method: 'POST',
      body: { username, password: 'weak' }
    });
    assert.equal(weakAttempt.status, 400);
    assert.equal(weakAttempt.json.error.code, 'VALIDATION_ERROR');
  }

  const lockedAttempt = await request({
    path: '/auth/login',
    method: 'POST',
    body: { username, password: 'LockoutPass!2026' }
  });
  assert.equal(lockedAttempt.status, 401);
  assert.equal(lockedAttempt.json.error.code, 'ACCOUNT_LOCKED');
});

test('authorization matrix and object-level ownership for jobs', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;

  await createUserAsAdmin(admin, {
    username: `employer.one.${suffix}`,
    password: 'EmployerOne!2026',
    roles: ['Employer']
  });
  await createUserAsAdmin(admin, {
    username: `employer.two.${suffix}`,
    password: 'EmployerTwo!2026',
    roles: ['Employer']
  });

  const employerOne = await login(`employer.one.${suffix}`, 'EmployerOne!2026');
  const employerTwo = await login(`employer.two.${suffix}`, 'EmployerTwo!2026');

  const createJob = await request({
    path: '/jobs',
    method: 'POST',
    cookie: employerOne.cookie,
    csrfToken: employerOne.csrfToken,
    body: {
      department: 'Events',
      title: `Owner Job ${Date.now()}`,
      description: 'Ownership check job',
      shiftInfo: 'Sat-Sun'
    }
  });
  assert.equal(createJob.status, 201);
  const jobId = createJob.json.data.jobId;

  const crossPatch = await request({
    path: `/jobs/${jobId}`,
    method: 'PATCH',
    cookie: employerTwo.cookie,
    csrfToken: employerTwo.csrfToken,
    body: { title: 'Hijack attempt' }
  });
  assert.equal(crossPatch.status, 403);

  const crossSubmit = await request({
    path: `/jobs/${jobId}/submit`,
    method: 'POST',
    cookie: employerTwo.cookie,
    csrfToken: employerTwo.csrfToken
  });
  assert.equal(crossSubmit.status, 403);

  const ownSubmit = await request({
    path: `/jobs/${jobId}/submit`,
    method: 'POST',
    cookie: employerOne.cookie,
    csrfToken: employerOne.csrfToken
  });
  assert.equal(ownSubmit.status, 200);

  const crossAppeal = await request({
    path: `/jobs/${jobId}/appeals`,
    method: 'POST',
    cookie: employerTwo.cookie,
    csrfToken: employerTwo.csrfToken,
    body: { comment: 'cross-owner appeal' }
  });
  assert.equal(crossAppeal.status, 403);

  const crossHistory = await request({
    path: `/jobs/${jobId}/history`,
    method: 'GET',
    cookie: employerTwo.cookie
  });
  assert.equal(crossHistory.status, 403);

  const adminHistory = await request({
    path: `/jobs/${jobId}/history`,
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(adminHistory.status, 200);
});

test('step-up token is action-bound and one-time use', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `StepUp Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  assert.equal(venue.status, 201);

  const route = await request({
    path: '/routes',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      venueId: venue.json.data.id,
      name: `StepUp Route ${suffix}`,
      strictSequence: false,
      defaultPaceMph: 3
    }
  });
  assert.equal(route.status, 201);

  const wrongActionToken = await acquireStepUp(admin, 'AdminSecure!2026', 'GRAPH_PUBLISH');
  const wrongActionAttempt = await request({
    path: `/routes/${route.json.data.routeId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    stepUpToken: wrongActionToken,
    body: { strictSequence: true }
  });
  assert.equal(wrongActionAttempt.status, 403);
  assert.equal(wrongActionAttempt.json.error.code, 'STEP_UP_REQUIRED');

  const routeActionToken = await acquireStepUp(admin, 'AdminSecure!2026', 'ROUTE_RULE_CHANGE');
  const firstUse = await request({
    path: `/routes/${route.json.data.routeId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    stepUpToken: routeActionToken,
    body: { strictSequence: true }
  });
  assert.equal(firstUse.status, 200);

  const replayUse = await request({
    path: `/routes/${route.json.data.routeId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    stepUpToken: routeActionToken,
    body: { strictSequence: false }
  });
  assert.equal(replayUse.status, 403);
  assert.equal(replayUse.json.error.code, 'STEP_UP_REQUIRED');
});

test('graph constraints: invalid target types and max outgoing rules block publish with details', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');

  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(draft.status, 201);
  const draftId = draft.json.data.draftId;

  const source = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'STAMP', label: `Constraint Source ${Date.now()}` }
  });
  const targetA = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'ARTIST', label: `Constraint Target A ${Date.now()}` }
  });
  const targetB = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'ARTIST', label: `Constraint Target B ${Date.now()}` }
  });
  assert.equal(source.status, 201);
  assert.equal(targetA.status, 201);
  assert.equal(targetB.status, 201);

  const edgeOne = await request({
    path: `/graph/drafts/${draftId}/edges`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: source.json.data.node_id,
      toNodeId: targetA.json.data.node_id,
      relationType: 'INFLUENCED_BY',
      weight: 70,
      constraints: { allowedTargetTypes: ['SERIES'], maxOutgoingPerRelation: 1 }
    }
  });
  const edgeTwo = await request({
    path: `/graph/drafts/${draftId}/edges`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: source.json.data.node_id,
      toNodeId: targetB.json.data.node_id,
      relationType: 'INFLUENCED_BY',
      weight: 70,
      constraints: { maxOutgoingPerRelation: 1 }
    }
  });
  assert.equal(edgeOne.status, 201);
  assert.equal(edgeTwo.status, 201);

  const validate = await request({
    path: `/graph/drafts/${draftId}/validate`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(validate.status, 200);
  assert.equal(validate.json.data.status, 'INVALID');

  const issues = validate.json.data.issues;
  assert.ok(issues.some((issue) => issue.code === 'CONSTRAINT_ALLOWED_TARGET_TYPES'));
  assert.ok(issues.some((issue) => issue.code === 'CONSTRAINT_MAX_OUTGOING_PER_RELATION'));
  assert.ok(issues.every((issue) => issue.severity));
  assert.ok(issues.some((issue) => issue.edgeId || issue.nodeId));

  const stepUpToken = await acquireStepUp(curator, 'CuratorSecure!2026', 'GRAPH_PUBLISH');
  const publish = await request({
    path: `/graph/drafts/${draftId}/publish`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    stepUpToken
  });
  assert.equal(publish.status, 422);
  assert.equal(publish.json.error.code, 'GRAPH_VALIDATION_BLOCKED');
  assert.ok(Array.isArray(publish.json.error.details));
  assert.ok(publish.json.error.details.some((issue) => issue.code === 'CONSTRAINT_ALLOWED_TARGET_TYPES'));
});

test('graph constraints: forbidCircular relation blocks cyclic relation scope', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');

  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(draft.status, 201);
  const draftId = draft.json.data.draftId;

  const nodeA = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'STAMP', label: `Cycle Node A ${Date.now()}` }
  });
  const nodeB = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'STAMP', label: `Cycle Node B ${Date.now()}` }
  });
  assert.equal(nodeA.status, 201);
  assert.equal(nodeB.status, 201);

  await request({
    path: `/graph/drafts/${draftId}/edges`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: nodeA.json.data.node_id,
      toNodeId: nodeB.json.data.node_id,
      relationType: 'CHAIN',
      weight: 80,
      constraints: { forbidCircular: true }
    }
  });
  await request({
    path: `/graph/drafts/${draftId}/edges`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: nodeB.json.data.node_id,
      toNodeId: nodeA.json.data.node_id,
      relationType: 'CHAIN',
      weight: 80,
      constraints: { forbidCircular: true }
    }
  });

  const validate = await request({
    path: `/graph/drafts/${draftId}/validate`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(validate.status, 200);
  assert.equal(validate.json.data.status, 'INVALID');
  assert.ok(validate.json.data.issues.some((issue) => issue.code === 'CONSTRAINT_FORBID_CIRCULAR'));
});

test('step-up graph publish works on valid draft', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');

  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(draft.status, 201);
  const draftId = draft.json.data.draftId;

  const existingDraft = await request({
    path: `/graph/drafts/${draftId}`,
    method: 'GET',
    cookie: curator.cookie
  });
  assert.equal(existingDraft.status, 200);

  for (const node of existingDraft.json.data.snapshot.nodes) {
    const removed = await request({
      path: `/graph/drafts/${draftId}/nodes/${node.node_id}`,
      method: 'DELETE',
      cookie: curator.cookie,
      csrfToken: curator.csrfToken
    });
    assert.equal(removed.status, 204);
  }

  const nodeStamp = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'STAMP', label: `Valid Stamp ${Date.now()}` }
  });
  const nodeArtist = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'ARTIST', label: `Valid Artist ${Date.now()}` }
  });
  assert.equal(nodeStamp.status, 201);
  assert.equal(nodeArtist.status, 201);

  const edge = await request({
    path: `/graph/drafts/${draftId}/edges`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: nodeStamp.json.data.node_id,
      toNodeId: nodeArtist.json.data.node_id,
      relationType: 'CREATED_BY',
      weight: 90,
      constraints: { allowedTargetTypes: ['ARTIST'], maxOutgoingPerRelation: 2 }
    }
  });
  assert.equal(edge.status, 201);

  const validate = await request({
    path: `/graph/drafts/${draftId}/validate`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(validate.status, 200);
  assert.equal(validate.json.data.status, 'VALID');

  const stepUpToken = await acquireStepUp(curator, 'CuratorSecure!2026', 'GRAPH_PUBLISH');
  const publish = await request({
    path: `/graph/drafts/${draftId}/publish`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    stepUpToken
  });
  assert.equal(publish.status, 200);
  assert.ok(Number.isInteger(publish.json.data.version));
});

test('graph draft object-level read: unpublished restricted, published remains readable', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');

  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(draft.status, 201);
  const draftId = draft.json.data.draftId;

  const reviewerUnpublishedRead = await request({
    path: `/graph/drafts/${draftId}`,
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(reviewerUnpublishedRead.status, 403);
  assert.equal(reviewerUnpublishedRead.json.error.code, 'FORBIDDEN');

  const stepUpToken = await acquireStepUp(curator, 'CuratorSecure!2026', 'GRAPH_PUBLISH');
  const publish = await request({
    path: `/graph/drafts/${draftId}/publish`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    stepUpToken
  });
  assert.equal(publish.status, 200);

  const reviewerPublishedRead = await request({
    path: `/graph/drafts/${draftId}`,
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(reviewerPublishedRead.status, 200);
});

test('graph draft mutation is owner/admin scoped', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const curatorOwner = await login('curator.dev', 'CuratorSecure!2026');
  const suffix = `${Date.now()}`;
  const secondCuratorUsername = `curator.peer.${suffix}`;

  await createUserAsAdmin(admin, {
    username: secondCuratorUsername,
    password: 'CuratorPeer!2026',
    roles: ['Curator']
  });
  const curatorPeer = await login(secondCuratorUsername, 'CuratorPeer!2026');

  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curatorOwner.cookie,
    csrfToken: curatorOwner.csrfToken
  });
  assert.equal(draft.status, 201);

  const forbiddenMutation = await request({
    path: `/graph/drafts/${draft.json.data.draftId}/nodes`,
    method: 'POST',
    cookie: curatorPeer.cookie,
    csrfToken: curatorPeer.csrfToken,
    body: { type: 'STAMP', label: 'Unauthorized peer update' }
  });
  assert.equal(forbiddenMutation.status, 403);
  assert.equal(forbiddenMutation.json.error.code, 'FORBIDDEN');
});

test('inbox data isolation: cannot read or print another user message', { concurrency: false }, async () => {
  const employer = await login('employer.dev', 'EmployerSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');

  const job = await request({
    path: '/jobs',
    method: 'POST',
    cookie: employer.cookie,
    csrfToken: employer.csrfToken,
    body: {
      department: 'Events',
      title: `Inbox Isolation ${Date.now()}`,
      description: 'Generate workflow message',
      shiftInfo: 'Fri'
    }
  });
  assert.equal(job.status, 201);

  const submit = await request({
    path: `/jobs/${job.json.data.jobId}/submit`,
    method: 'POST',
    cookie: employer.cookie,
    csrfToken: employer.csrfToken
  });
  assert.equal(submit.status, 200);

  const employerInbox = await request({
    path: '/inbox/messages?filter[type]=WORKFLOW&page=1&pageSize=20',
    method: 'GET',
    cookie: employer.cookie
  });
  assert.equal(employerInbox.status, 200);
  assert.ok(employerInbox.json.data.length > 0);
  const messageId = employerInbox.json.data[0].id;

  const reviewerRead = await request({
    path: `/inbox/messages/${messageId}/read`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken
  });
  assert.equal(reviewerRead.status, 404);

  const reviewerPrint = await request({
    path: `/inbox/messages/${messageId}/print`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken
  });
  assert.equal(reviewerPrint.status, 404);
});

test('catalog: page size validation, filtering, autocomplete, hot keywords role checks', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const suffix = `${Date.now()}`;
  const uniqueSortTag = `sortEdge-${suffix}`;

  const created = await request({
    path: '/catalog/items',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      title: `Route Stamp ${suffix}`,
      catalogNumber: `CAT-${suffix}`,
      artist: 'Unit Artist',
      series: 'Series A',
      country: 'USA',
      period: '1930s',
      category: 'Showcase',
      tags: ['tagA', 'tagB']
    }
  });
  assert.equal(created.status, 201);

  const maxAllowedPage = await request({
    path: '/catalog/search?q=Route&page=1&pageSize=51',
    method: 'GET'
  });
  assert.equal(maxAllowedPage.status, 200);

  const tooLargePage = await request({
    path: '/catalog/search?q=Route&page=1&pageSize=52',
    method: 'GET'
  });
  assert.equal(tooLargePage.status, 400);
  assert.equal(tooLargePage.json.error.message, 'Request validation failed');
  assert.ok(
    tooLargePage.json.error.details.some(
      (item) => item.field === 'page/pageSize' && String(item.issue).includes('pageSize must be <= 51')
    )
  );

  const filtered = await request({
    path: `/catalog/search?q=CAT-${suffix}&filter[category]=Showcase&sort=title:asc&page=1&pageSize=20`,
    method: 'GET'
  });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.json.data.some((item) => item.catalogNumber === `CAT-${suffix}`));

  const sortA = await request({
    path: '/catalog/items',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      title: `A SortEdge ${suffix}`,
      catalogNumber: `SE-A-${suffix}`,
      artist: 'Unit Artist',
      series: 'Series A',
      country: 'USA',
      period: '1930s',
      category: 'Showcase',
      tags: [uniqueSortTag]
    }
  });
  const sortZ = await request({
    path: '/catalog/items',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      title: `Z SortEdge ${suffix}`,
      catalogNumber: `SE-Z-${suffix}`,
      artist: 'Unit Artist',
      series: 'Series A',
      country: 'USA',
      period: '1930s',
      category: 'Showcase',
      tags: [uniqueSortTag]
    }
  });
  assert.equal(sortA.status, 201);
  assert.equal(sortZ.status, 201);

  const sortPageOne = await request({
    path: `/catalog/search?q=SortEdge ${suffix}&filter[tags]=${encodeURIComponent(uniqueSortTag)}&sort=title:asc&page=1&pageSize=1`,
    method: 'GET'
  });
  const sortPageTwo = await request({
    path: `/catalog/search?q=SortEdge ${suffix}&filter[tags]=${encodeURIComponent(uniqueSortTag)}&sort=title:asc&page=2&pageSize=1`,
    method: 'GET'
  });
  assert.equal(sortPageOne.status, 200);
  assert.equal(sortPageTwo.status, 200);
  assert.equal(sortPageOne.json.pagination.page, 1);
  assert.equal(sortPageTwo.json.pagination.page, 2);
  assert.equal(sortPageOne.json.data[0].catalogNumber, `SE-A-${suffix}`);
  assert.equal(sortPageTwo.json.data[0].catalogNumber, `SE-Z-${suffix}`);

  const autocomplete = await request({
    path: '/catalog/autocomplete?q=Route&limit=5',
    method: 'GET'
  });
  assert.equal(autocomplete.status, 200);
  assert.ok(Array.isArray(autocomplete.json.data));

  const keywordCreate = await request({
    path: '/catalog/hot-keywords',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      keyword: `Hot-${suffix}`,
      rank: 1,
      activeFrom: '2026-01-01T00:00:00Z',
      activeTo: '2027-01-01T00:00:00Z'
    }
  });
  assert.equal(keywordCreate.status, 201);
  const keywordId = keywordCreate.json.data.id;

  const reviewerKeywordCreate = await request({
    path: '/catalog/hot-keywords',
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    body: {
      keyword: `Forbidden-${suffix}`,
      rank: 2,
      activeFrom: '2026-01-01T00:00:00Z',
      activeTo: '2027-01-01T00:00:00Z'
    }
  });
  assert.equal(reviewerKeywordCreate.status, 403);

  const keywordPatch = await request({
    path: `/catalog/hot-keywords/${keywordId}`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { rank: 2 }
  });
  assert.equal(keywordPatch.status, 200);

  const keywordReadByReviewer = await request({
    path: '/catalog/hot-keywords',
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(keywordReadByReviewer.status, 200);
  assert.ok(Array.isArray(keywordReadByReviewer.json.data));
  assert.ok(
    keywordReadByReviewer.json.data.some((item) => item.id === keywordId),
    'reviewer should read hot keywords curated by curator'
  );

  const keywordReadUnauth = await request({
    path: '/catalog/hot-keywords',
    method: 'GET'
  });
  assert.equal(keywordReadUnauth.status, 401);

  const keywordDelete = await request({
    path: `/catalog/hot-keywords/${keywordId}`,
    method: 'DELETE',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(keywordDelete.status, 204);
});

test('GET /routes returns paginated route listing for ROUTE_READ roles', { concurrency: false }, async () => {
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');

  const listing = await request({
    path: '/routes',
    method: 'GET',
    cookie: reviewer.cookie,
    query: { pageSize: '5', page: '1' }
  });
  assert.equal(listing.status, 200);
  const body = listing.json;
  assert.ok(Array.isArray(body.data), 'data should be an array');
  assert.ok(body.pagination, 'should include pagination');
  assert.ok(typeof body.pagination.page === 'number');
  assert.ok(typeof body.pagination.totalPages === 'number');

  if (body.data.length > 0) {
    const route = body.data[0];
    assert.ok(route.routeId, 'route should have routeId');
    assert.ok(route.name, 'route should have name');
  }
});

test('routes and itinerary behavior with required/optional/detour and time math', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  assert.equal(venue.status, 201);

  const hall = await request({
    path: `/venues/${venue.json.data.id}/halls`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Hall A' }
  });
  const zone = await request({
    path: `/halls/${hall.json.data.id}/zones`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Zone 1' }
  });
  const caseA = await request({
    path: `/zones/${zone.json.data.id}/display-cases`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Case A' }
  });
  const caseB = await request({
    path: `/zones/${zone.json.data.id}/display-cases`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Case B' }
  });
  const caseC = await request({
    path: `/zones/${zone.json.data.id}/display-cases`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Case C' }
  });

  const route = await request({
    path: '/routes',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      venueId: venue.json.data.id,
      name: `Route ${suffix}`,
      strictSequence: false,
      defaultPaceMph: 3
    }
  });
  assert.equal(route.status, 201);
  const routeId = route.json.data.routeId;

  await request({
    path: `/routes/${routeId}/segments`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      fromCaseId: caseA.json.data.id,
      toCaseId: caseB.json.data.id,
      segmentType: 'REQUIRED_NEXT',
      dwellMinutes: 4,
      distanceMeters: 60,
      order: 1
    }
  });
  const optional = await request({
    path: `/routes/${routeId}/segments`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      fromCaseId: caseB.json.data.id,
      toCaseId: caseC.json.data.id,
      segmentType: 'OPTIONAL_BRANCH',
      dwellMinutes: 2,
      distanceMeters: 30,
      order: 2
    }
  });
  await request({
    path: `/routes/${routeId}/segments`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      fromCaseId: caseA.json.data.id,
      toCaseId: caseB.json.data.id,
      segmentType: 'ACCESSIBILITY_DETOUR',
      dwellMinutes: 5,
      distanceMeters: 20,
      order: 3
    }
  });

  const itineraryDefault = await request({
    path: `/routes/${routeId}/itineraries`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      accessibilityMode: false,
      branchSelections: [{ fromCaseId: caseB.json.data.id, toCaseId: caseC.json.data.id }]
    }
  });
  assert.equal(itineraryDefault.status, 201);
  assert.ok(itineraryDefault.json.data.printable.steps.some((step) => step.segmentType === 'REQUIRED_NEXT'));
  assert.ok(itineraryDefault.json.data.printable.steps.some((step) => step.segmentType === 'OPTIONAL_BRANCH'));
  const expectedDefaultMinutes = Number((6 + 90 / 80.4672).toFixed(1));
  assert.equal(itineraryDefault.json.data.estimatedWalkMinutes, expectedDefaultMinutes);

  const itineraryAccessible = await request({
    path: `/routes/${routeId}/itineraries`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { accessibilityMode: true, branchSelections: [] }
  });
  assert.equal(itineraryAccessible.status, 201);
  assert.ok(itineraryAccessible.json.data.printable.steps.some((step) => step.segmentType === 'ACCESSIBILITY_DETOUR'));
  assert.ok(itineraryAccessible.json.data.estimatedWalkMinutes > 0);

  assert.ok(optional.status === 201);
});

test('route guided read endpoints require authentication and ROUTE_READ permission', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `RouteRead Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  const hall = await request({
    path: `/venues/${venue.json.data.id}/halls`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'RR Hall' }
  });
  const zone = await request({
    path: `/halls/${hall.json.data.id}/zones`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'RR Zone' }
  });
  const caseA = await request({
    path: `/zones/${zone.json.data.id}/display-cases`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'RR Case A' }
  });
  const caseB = await request({
    path: `/zones/${zone.json.data.id}/display-cases`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'RR Case B' }
  });
  const route = await request({
    path: '/routes',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { venueId: venue.json.data.id, name: `RR ${suffix}`, strictSequence: false, defaultPaceMph: 3 }
  });
  await request({
    path: `/routes/${route.json.data.routeId}/segments`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      fromCaseId: caseA.json.data.id,
      toCaseId: caseB.json.data.id,
      segmentType: 'REQUIRED_NEXT',
      dwellMinutes: 4,
      distanceMeters: 40,
      order: 1
    }
  });
  await request({
    path: `/routes/${route.json.data.routeId}/itineraries`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { accessibilityMode: false, branchSelections: [] }
  });

  const reviewerRouteRead = await request({
    path: `/routes/${route.json.data.routeId}`,
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(reviewerRouteRead.status, 200);
  const reviewerItineraries = await request({
    path: `/routes/${route.json.data.routeId}/itineraries`,
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(reviewerItineraries.status, 200);
  assert.ok(Array.isArray(reviewerItineraries.json.data));

  const unauthRouteRead = await request({
    path: `/routes/${route.json.data.routeId}`,
    method: 'GET'
  });
  assert.equal(unauthRouteRead.status, 401, 'unauthenticated route read returns 401');

  const noRouteReadUsername = `no.route.read.${suffix}`;
  await createUserAsAdmin(admin, {
    username: noRouteReadUsername,
    password: 'NoRouteRead!2026',
    roles: ['Reviewer']
  });
  await withMongo(async (connection) => {
    await connection.collection('users').updateOne({ username: noRouteReadUsername }, { $set: { roles: [] } });
  });
  const noRouteReadUser = await login(noRouteReadUsername, 'NoRouteRead!2026');

  const noPermRead = await request({
    path: `/routes/${route.json.data.routeId}`,
    method: 'GET',
    cookie: noRouteReadUser.cookie
  });
  assert.equal(noPermRead.status, 403, 'user without ROUTE_READ permission gets 403');
});

test('routes reject invalid segment metrics and invalid optional branch selection', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `Route Guard Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  assert.equal(venue.status, 201);

  const hall = await request({
    path: `/venues/${venue.json.data.id}/halls`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Hall Guard' }
  });
  const zone = await request({
    path: `/halls/${hall.json.data.id}/zones`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Zone Guard' }
  });
  const caseA = await request({
    path: `/zones/${zone.json.data.id}/display-cases`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Case A' }
  });
  const caseB = await request({
    path: `/zones/${zone.json.data.id}/display-cases`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: 'Case B' }
  });

  const route = await request({
    path: '/routes',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      venueId: venue.json.data.id,
      name: `Route Guard ${suffix}`,
      strictSequence: false,
      defaultPaceMph: 3
    }
  });
  assert.equal(route.status, 201);

  const invalidSegment = await request({
    path: `/routes/${route.json.data.routeId}/segments`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      fromCaseId: caseA.json.data.id,
      toCaseId: caseB.json.data.id,
      segmentType: 'REQUIRED_NEXT',
      dwellMinutes: -1,
      distanceMeters: 20,
      order: 1
    }
  });
  assert.equal(invalidSegment.status, 400);
  assert.equal(invalidSegment.json.error.code, 'VALIDATION_ERROR');

  const required = await request({
    path: `/routes/${route.json.data.routeId}/segments`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      fromCaseId: caseA.json.data.id,
      toCaseId: caseB.json.data.id,
      segmentType: 'REQUIRED_NEXT',
      dwellMinutes: 2,
      distanceMeters: 20,
      order: 1
    }
  });
  assert.equal(required.status, 201);

  const invalidBranchSelection = await request({
    path: `/routes/${route.json.data.routeId}/itineraries`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      accessibilityMode: false,
      branchSelections: [{ fromCaseId: caseA.json.data.id, toCaseId: caseB.json.data.id }]
    }
  });
  assert.equal(invalidBranchSelection.status, 400);
  assert.equal(invalidBranchSelection.json.error.code, 'INVALID_BRANCH_SELECTION');
});

test('catalog fuzzy matching and cache lifecycle with role-scope isolation', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const suffix = `${Date.now()}`;

  const created = await request({
    path: '/catalog/items',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      title: `Fuzzy Rarite ${suffix}`,
      catalogNumber: `FUZ-${suffix}`,
      artist: 'Fuzzy Tester',
      series: 'Typos',
      country: 'USA',
      period: '1940s',
      category: 'Search',
      tags: ['fuzzy', 'match']
    }
  });
  assert.equal(created.status, 201);

  const typoQuery = `Fuzzy Rarit ${suffix}`;

  const firstAuthed = await request({
    path: `/catalog/search?q=${encodeURIComponent(typoQuery)}&page=1&pageSize=10`,
    method: 'GET',
    cookie: curator.cookie
  });
  assert.equal(firstAuthed.status, 200);
  assert.equal(firstAuthed.json.meta.cache, 'MISS');
  assert.ok(firstAuthed.json.data.some((item) => item.catalogNumber === `FUZ-${suffix}`));

  const secondAuthed = await request({
    path: `/catalog/search?q=${encodeURIComponent(typoQuery)}&page=1&pageSize=10`,
    method: 'GET',
    cookie: curator.cookie
  });
  assert.equal(secondAuthed.status, 200);
  assert.equal(secondAuthed.json.meta.cache, 'HIT');

  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const firstOtherRole = await request({
    path: `/catalog/search?q=${encodeURIComponent(typoQuery)}&page=1&pageSize=10`,
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(firstOtherRole.status, 200);
  assert.equal(firstOtherRole.json.meta.cache, 'MISS');

  const secondOtherRole = await request({
    path: `/catalog/search?q=${encodeURIComponent(typoQuery)}&page=1&pageSize=10`,
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(secondOtherRole.status, 200);
  assert.equal(secondOtherRole.json.meta.cache, 'HIT');

  await withMongo(async (connection) => {
    await connection.collection('search_cache').updateMany(
      {
        'payload.data.catalogNumber': `FUZ-${suffix}`
      },
      {
        $set: {
          expires_at: new Date(Date.now() - 1000)
        }
      }
    );
  });

  const postExpiry = await request({
    path: `/catalog/search?q=${encodeURIComponent(typoQuery)}&page=1&pageSize=10`,
    method: 'GET',
    cookie: curator.cookie
  });
  assert.equal(postExpiry.status, 200);
  assert.equal(postExpiry.json.meta.cache, 'MISS');
});

test('programs: capacity waitlist, credits, promotion confirm and expiry conflict path', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `Programs Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  const program = await request({
    path: '/programs',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { type: `DOCENT_${suffix}`, title: 'Docent Basics', capacity: 1 }
  });
  assert.equal(program.status, 201);

  const coach = await request({
    path: '/coaches',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { name: `Coach ${suffix}`, qualifications: ['Philately'], contact: 'coach@example.local' }
  });
  assert.equal(coach.status, 201);

  const lateStart = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const lateEnd = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();

  const availability = await request({
    path: `/coaches/${coach.json.data.id}/availability`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      startAtUtc: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      endAtUtc: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      timezone: 'America/New_York'
    }
  });
  assert.equal(availability.status, 201);

  const session = await request({
    path: '/program-sessions',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      programId: program.json.data.id,
      coachId: coach.json.data.id,
      venueId: venue.json.data.id,
      startAtUtc: lateStart,
      endAtUtc: lateEnd,
      timezone: 'America/New_York',
      capacity: 1
    }
  });
  assert.equal(session.status, 201);
  const sessionId = session.json.data.id;

  const regA = await request({
    path: `/program-sessions/${sessionId}/registrations`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { participantId: `p_a_${suffix}` }
  });
  const regB = await request({
    path: `/program-sessions/${sessionId}/registrations`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { participantId: `p_b_${suffix}` }
  });
  assert.equal(regA.status, 201);
  assert.equal(regB.status, 201);
  assert.equal(regB.json.data.status, 'WAITLISTED');

  const lateCancel = await request({
    path: `/program-sessions/${sessionId}/registrations/${regA.json.data.registrationId}/cancel`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken
  });
  assert.equal(lateCancel.status, 200);
  assert.equal(lateCancel.json.data.status, 'LATE_CANCEL');
  assert.equal(lateCancel.json.data.creditsDeducted, 1);
  assert.ok(lateCancel.json.data.waitlistPromotion);

  const confirm = await request({
    path: `/program-sessions/${sessionId}/waitlist/${lateCancel.json.data.waitlistPromotion.entryId}/confirm`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken
  });
  assert.equal(confirm.status, 200);

  const creditsLate = await request({
    path: `/participants/p_a_${suffix}/credits`,
    method: 'GET',
    cookie: coordinator.cookie
  });
  assert.equal(creditsLate.status, 200);
  assert.equal(creditsLate.json.data.balance, -1);

  const regC = await request({
    path: `/program-sessions/${sessionId}/registrations`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { participantId: `p_c_${suffix}` }
  });
  assert.equal(regC.status, 201);

  const noShow = await request({
    path: `/program-sessions/${sessionId}/registrations/${confirm.json.data.registrationId}/no-show`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken
  });
  assert.equal(noShow.status, 200);
  assert.equal(noShow.json.data.status, 'NO_SHOW');
  assert.equal(noShow.json.data.creditsDeducted, 2);

  const noShowAgain = await request({
    path: `/program-sessions/${sessionId}/registrations/${confirm.json.data.registrationId}/no-show`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken
  });
  assert.equal(noShowAgain.status, 200);
  assert.equal(noShowAgain.json.data.status, 'NO_SHOW');
  assert.equal(noShowAgain.json.data.creditsDeducted, 0);
  assert.equal(noShowAgain.json.data.idempotent, true);

  const creditsNoShow = await request({
    path: `/participants/p_b_${suffix}/credits`,
    method: 'GET',
    cookie: coordinator.cookie
  });
  assert.equal(creditsNoShow.status, 200);
  assert.equal(creditsNoShow.json.data.balance, -2);

  const expiredEntryId = noShow.json.data.waitlistPromotion.entryId;
  await withMongo(async (connection) => {
    await connection.collection('waitlist_entries').updateOne(
      { _id: new mongoose.Types.ObjectId(expiredEntryId) },
      {
        $set: {
          promotion_expires_at: new Date(Date.now() - 1000)
        }
      }
    );
  });

  const expiredConfirm = await request({
    path: `/program-sessions/${sessionId}/waitlist/${expiredEntryId}/confirm`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken
  });
  assert.equal(expiredConfirm.status, 409);
});

test('program sessions enforce coach availability windows', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `Avail Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  assert.equal(venue.status, 201);

  const program = await request({
    path: '/programs',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { type: `AVAIL_${suffix}`, title: 'Availability Program', capacity: 5 }
  });
  assert.equal(program.status, 201);

  const coach = await request({
    path: '/coaches',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { name: `Avail Coach ${suffix}`, qualifications: [], contact: 'coach@example.local' }
  });
  assert.equal(coach.status, 201);

  const windowStart = new Date(Date.now() + 10 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const availability = await request({
    path: `/coaches/${coach.json.data.id}/availability`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      startAtUtc: windowStart.toISOString(),
      endAtUtc: windowEnd.toISOString(),
      timezone: 'America/New_York'
    }
  });
  assert.equal(availability.status, 201);

  const inWindow = await request({
    path: '/program-sessions',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      programId: program.json.data.id,
      coachId: coach.json.data.id,
      venueId: venue.json.data.id,
      startAtUtc: new Date(windowStart.getTime() + 20 * 60 * 1000).toISOString(),
      endAtUtc: new Date(windowStart.getTime() + 80 * 60 * 1000).toISOString(),
      timezone: 'America/New_York',
      capacity: 2
    }
  });
  assert.equal(inWindow.status, 201);

  const outOfWindow = await request({
    path: '/program-sessions',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      programId: program.json.data.id,
      coachId: coach.json.data.id,
      venueId: venue.json.data.id,
      startAtUtc: new Date(windowEnd.getTime() + 30 * 60 * 1000).toISOString(),
      endAtUtc: new Date(windowEnd.getTime() + 90 * 60 * 1000).toISOString(),
      timezone: 'America/New_York',
      capacity: 2
    }
  });
  assert.equal(outOfWindow.status, 422);
  assert.equal(outOfWindow.json.error.code, 'COACH_UNAVAILABLE');
});

test('program cancellation at 12-hour policy boundary is treated as late cancel', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `Boundary Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  assert.equal(venue.status, 201);

  const program = await request({
    path: '/programs',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { type: `BOUNDARY_${suffix}`, title: 'Boundary Program', capacity: 2 }
  });
  assert.equal(program.status, 201);

  const coach = await request({
    path: '/coaches',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { name: `Boundary Coach ${suffix}`, qualifications: [], contact: 'coach@example.local' }
  });
  assert.equal(coach.status, 201);

  const startAtUtc = new Date(Date.now() + ((12 * 60 - 1) * 60 * 1000)).toISOString();
  const endAtUtc = new Date(Date.now() + ((13 * 60 - 1) * 60 * 1000)).toISOString();

  const availability = await request({
    path: `/coaches/${coach.json.data.id}/availability`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      startAtUtc: new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString(),
      endAtUtc: new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(),
      timezone: 'America/New_York'
    }
  });
  assert.equal(availability.status, 201);

  const session = await request({
    path: '/program-sessions',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      programId: program.json.data.id,
      coachId: coach.json.data.id,
      venueId: venue.json.data.id,
      startAtUtc,
      endAtUtc,
      timezone: 'America/New_York',
      capacity: 2
    }
  });
  assert.equal(session.status, 201);

  const registration = await request({
    path: `/program-sessions/${session.json.data.id}/registrations`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { participantId: `boundary_participant_${suffix}` }
  });
  assert.equal(registration.status, 201);

  const cancel = await request({
    path: `/program-sessions/${session.json.data.id}/registrations/${registration.json.data.registrationId}/cancel`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken
  });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.json.data.status, 'LATE_CANCEL');
  assert.ok(cancel.json.data.hoursBeforeStart <= 12);
});

test('program cancellation at 12-hour boundary is treated as late cancel', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `Boundary Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  const program = await request({
    path: '/programs',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { type: `BOUNDARY_${suffix}`, title: 'Boundary Program', capacity: 1 }
  });
  const coach = await request({
    path: '/coaches',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { name: `Boundary Coach ${suffix}`, qualifications: [], contact: 'coach@example.local' }
  });

  const startAtUtc = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const endAtUtc = new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString();
  await request({
    path: `/coaches/${coach.json.data.id}/availability`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      startAtUtc: new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString(),
      endAtUtc: new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(),
      timezone: 'America/New_York'
    }
  });

  const session = await request({
    path: '/program-sessions',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      programId: program.json.data.id,
      coachId: coach.json.data.id,
      venueId: venue.json.data.id,
      startAtUtc,
      endAtUtc,
      timezone: 'America/New_York',
      capacity: 1
    }
  });
  assert.equal(session.status, 201);

  const registration = await request({
    path: `/program-sessions/${session.json.data.id}/registrations`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { participantId: `p_boundary_${suffix}` }
  });
  assert.equal(registration.status, 201);

  const cancel = await request({
    path: `/program-sessions/${session.json.data.id}/registrations/${registration.json.data.registrationId}/cancel`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken
  });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.json.data.status, 'LATE_CANCEL');
});

test('audit endpoint authz, filters, pagination, and safe payload; anomaly inbox dedupe; export negatives', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const auditor = await login('auditor.dev', 'AuditorSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');
  const suffix = `${Date.now()}`;

  const noAuthAudit = await request({ path: '/audit/events' });
  assert.equal(noAuthAudit.status, 401);

  const reviewerAudit = await request({ path: '/audit/events', cookie: reviewer.cookie });
  assert.equal(reviewerAudit.status, 403);

  await request({
    path: '/analytics/metrics',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      key: `weekly_bookings_${suffix}`,
      name: 'Weekly Bookings',
      dataset: 'registrations',
      aggregation: 'count'
    }
  });

  const rule = await request({
    path: '/analytics/anomaly-rules',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      ruleKey: `bookings_drop_wow_${suffix}`,
      metricKey: `weekly_bookings_${suffix}`,
      thresholdPercent: -100,
      minBaselineCount: 1
    }
  });
  assert.equal(rule.status, 201);

  const dashboard = await request({
    path: '/analytics/dashboards',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      name: `Anomaly Dash ${suffix}`,
      tiles: [{ metric: `weekly_bookings_${suffix}` }],
      anomalyRules: [rule.json.data.ruleKey]
    }
  });
  assert.equal(dashboard.status, 201);
  const dashboardId = dashboard.json.data.dashboardId;

  await withMongo(async (connection) => {
    const now = new Date();
    const previousWeek = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const currentWeek = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    await connection.collection('registrations').insertMany([
      {
        session_id: new mongoose.Types.ObjectId(),
        participant_id: `anomaly_prev_1_${suffix}`,
        status: 'REGISTERED',
        created_at: previousWeek,
        updated_at: previousWeek
      },
      {
        session_id: new mongoose.Types.ObjectId(),
        participant_id: `anomaly_prev_2_${suffix}`,
        status: 'REGISTERED',
        created_at: previousWeek,
        updated_at: previousWeek
      },
      {
        session_id: new mongoose.Types.ObjectId(),
        participant_id: `anomaly_curr_1_${suffix}`,
        status: 'REGISTERED',
        created_at: currentWeek,
        updated_at: currentWeek
      }
    ]);
  });

  const firstDashRead = await request({
    path: `/analytics/dashboards/${dashboardId}`,
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(firstDashRead.status, 200);
  const triggered = firstDashRead.json.data.anomalies.find((item) => item.rule === rule.json.data.ruleKey);
  assert.ok(triggered);
  assert.equal(triggered.status, 'TRIGGERED');

  await sleep(300);
  const firstInbox = await request({
    path: '/inbox/messages?filter[type]=ANOMALY&page=1&pageSize=50',
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(firstInbox.status, 200);
  const firstCount = firstInbox.json.data.length;
  assert.ok(firstCount >= 1);

  const secondDashRead = await request({
    path: `/analytics/dashboards/${dashboardId}`,
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(secondDashRead.status, 200);

  await sleep(300);
  const secondInbox = await request({
    path: '/inbox/messages?filter[type]=ANOMALY&page=1&pageSize=50',
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(secondInbox.status, 200);
  assert.equal(secondInbox.json.data.length, firstCount);

  const invalidAuditFrom = await request({
    path: '/audit/events?filter[from]=not-a-date',
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(invalidAuditFrom.status, 400);
  assert.equal(invalidAuditFrom.json.error.code, 'VALIDATION_ERROR');

  const invalidAuditTo = await request({
    path: '/audit/events?filter[to]=not-a-date',
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(invalidAuditTo.status, 400);
  assert.equal(invalidAuditTo.json.error.code, 'VALIDATION_ERROR');

  const auditEvents = await request({
    path: '/audit/events?page=1&pageSize=20&filter[action]=JOB_APPROVE',
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(auditEvents.status, 200);
  assert.ok(Array.isArray(auditEvents.json.data));
  assert.ok(auditEvents.json.pagination);
  assert.ok(!JSON.stringify(auditEvents.json).toLowerCase().includes('stepuptoken'));

  const targetAuditId = auditEvents.json.data[0]?.id || '000000000000000000000000';
  const updateAuditAttempt = await request({
    path: `/audit/events/${targetAuditId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { action: 'MUTATION_ATTEMPT' }
  });
  assert.equal(updateAuditAttempt.status, 404);

  const deleteAuditAttempt = await request({
    path: `/audit/events/${targetAuditId}`,
    method: 'DELETE',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken
  });
  assert.equal(deleteAuditAttempt.status, 404);

  const step = await acquireStepUp(auditor, 'AuditorSecure!2026', 'EXPORT_CREATE');
  const exportOk = await request({
    path: '/exports',
    method: 'POST',
    cookie: auditor.cookie,
    csrfToken: auditor.csrfToken,
    stepUpToken: step,
    body: {
      resource: 'participants',
      format: 'CSV',
      filters: {},
      fields: ['name', 'phone', 'email', 'notes']
    }
  });
  assert.equal(exportOk.status, 202);

  const reviewerStep = await acquireStepUp(reviewer, 'ReviewerSecure!2026', 'EXPORT_CREATE');
  const exportForbidden = await request({
    path: '/exports',
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    stepUpToken: reviewerStep,
    body: {
      resource: 'participants',
      format: 'CSV',
      filters: {},
      fields: ['name', 'phone']
    }
  });
  assert.equal(exportForbidden.status, 403);

  const queuedExportId = exportOk.json.data.exportJobId;

  const exportPeerUsername = `auditor.peer.${Date.now()}`;
  await createUserAsAdmin(admin, {
    username: exportPeerUsername,
    password: 'AuditorPeer!2026',
    roles: ['Auditor']
  });
  const auditorPeer = await login(exportPeerUsername, 'AuditorPeer!2026');

  const peerRead = await request({ path: `/exports/${queuedExportId}`, method: 'GET', cookie: auditorPeer.cookie });
  assert.equal(peerRead.status, 403);
  assert.equal(peerRead.json.error.code, 'FORBIDDEN');

  const adminRead = await request({ path: `/exports/${queuedExportId}`, method: 'GET', cookie: admin.cookie });
  assert.equal(adminRead.status, 200);

  let exportResult = null;
  for (let i = 0; i < 10; i += 1) {
    const probe = await request({ path: `/exports/${queuedExportId}`, method: 'GET', cookie: auditor.cookie });
    if (probe.status === 200 && probe.json.data.status === 'COMPLETED') {
      exportResult = probe;
      break;
    }
    await sleep(300);
  }
  assert.ok(exportResult);
  const preview = exportResult.json.data.maskingPreview;
  assert.ok(Array.isArray(preview), 'maskingPreview should be an array');
  const phoneEntry = preview.find((e) => e.field === 'phone');
  const notesEntry = preview.find((e) => e.field === 'notes');
  assert.ok(phoneEntry, 'should include phone masking entry');
  assert.equal(phoneEntry.rule, 'last4');
  assert.ok(notesEntry, 'should include notes masking entry');
  assert.equal(notesEntry.rule, 'redacted');

  const coordAudit = await request({ path: '/audit/events', method: 'GET', cookie: coordinator.cookie });
  assert.equal(coordAudit.status, 403);
});

test('program registration handles concurrent duplicate submissions safely', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');
  const suffix = `${Date.now()}`;

  const venue = await request({
    path: '/venues',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { name: `Concurrency Venue ${suffix}`, timezone: 'America/New_York', defaultPaceMph: 3 }
  });
  assert.equal(venue.status, 201);

  const program = await request({
    path: '/programs',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { type: `CONCUR_${suffix}`, title: 'Concurrency Program', capacity: 2 }
  });
  assert.equal(program.status, 201);

  const coach = await request({
    path: '/coaches',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { name: `Concurrency Coach ${suffix}`, qualifications: [], contact: 'coach@example.local' }
  });
  assert.equal(coach.status, 201);

  const startAtUtc = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const endAtUtc = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();

  const availability = await request({
    path: `/coaches/${coach.json.data.id}/availability`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      startAtUtc: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      endAtUtc: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      timezone: 'America/New_York'
    }
  });
  assert.equal(availability.status, 201);

  const session = await request({
    path: '/program-sessions',
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      programId: program.json.data.id,
      coachId: coach.json.data.id,
      venueId: venue.json.data.id,
      startAtUtc,
      endAtUtc,
      timezone: 'America/New_York',
      capacity: 2
    }
  });
  assert.equal(session.status, 201);

  const participantId = `dup_participant_${suffix}`;
  const [first, second] = await Promise.all([
    request({
      path: `/program-sessions/${session.json.data.id}/registrations`,
      method: 'POST',
      cookie: coordinator.cookie,
      csrfToken: coordinator.csrfToken,
      body: { participantId }
    }),
    request({
      path: `/program-sessions/${session.json.data.id}/registrations`,
      method: 'POST',
      cookie: coordinator.cookie,
      csrfToken: coordinator.csrfToken,
      body: { participantId }
    })
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409]);
});

test('analytics metric/dimension definition persistence and report configurability', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;

  // Create a dimension definition that maps a key to a canonical DB field
  const dimResult = await request({
    path: '/analytics/dimensions',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      key: `reg_status_${suffix}`,
      name: 'Registration Status',
      dataset: 'registrations',
      field: 'status',
      dataType: 'STRING'
    }
  });
  assert.equal(dimResult.status, 201);
  assert.ok(dimResult.json.data.key);

  // Create a metric that references the dimension via group_by
  const metricResult = await request({
    path: '/analytics/metrics',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      key: `status_count_${suffix}`,
      name: 'Status Count',
      dataset: 'registrations',
      aggregation: 'count',
      dimensions: [{ key: `reg_status_${suffix}`, type: 'STRING' }],
      groupBy: `reg_status_${suffix}`
    }
  });
  assert.equal(metricResult.status, 201);
  assert.ok(metricResult.json.data.dimensions.length > 0, 'dimensions should be persisted');
  assert.equal(metricResult.json.data.groupBy, `reg_status_${suffix}`);

  // Create a report definition with dimensions/groupBy/filter_template
  const reportResult = await request({
    path: '/analytics/reports',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      name: `Grouped Report ${suffix}`,
      dataset: 'program_registrations',
      format: 'JSON',
      dimensions: [{ key: `reg_status_${suffix}`, type: 'STRING' }],
      groupBy: `reg_status_${suffix}`,
      filterTemplate: { status: 'REGISTERED' },
      schedule: { time: '02:00', timezone: 'America/New_York' }
    }
  });
  assert.equal(reportResult.status, 201);
  assert.ok(reportResult.json.data.reportId);
  assert.deepEqual(reportResult.json.data.dimensions, [{ key: `reg_status_${suffix}`, type: 'STRING' }]);
  assert.equal(reportResult.json.data.groupBy, `reg_status_${suffix}`);

  // Run the report and verify it succeeds with grouped output
  const runResult = await request({
    path: `/analytics/reports/${reportResult.json.data.reportId}/run`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken
  });
  assert.equal(runResult.status, 200);
  assert.ok(runResult.json.data.runId);
  assert.equal(runResult.json.data.status, 'SUCCESS');

  // Verify runs list returns the completed run
  const runsResult = await request({
    path: `/analytics/reports/${reportResult.json.data.reportId}/runs`,
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(runsResult.status, 200);
  assert.ok(runsResult.json.data.length >= 1);
  assert.equal(runsResult.json.data[0].status, 'SUCCESS');

  // Create a dashboard using the configurable metric
  const dashResult = await request({
    path: '/analytics/dashboards',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      name: `Config Dashboard ${suffix}`,
      tiles: [{ metric: `status_count_${suffix}` }],
      anomalyRules: []
    }
  });
  assert.equal(dashResult.status, 201);

  // Fetch dashboard and verify metric was computed (value should be numeric)
  const dashGet = await request({
    path: `/analytics/dashboards/${dashResult.json.data.dashboardId}`,
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(dashGet.status, 200);
  assert.ok(dashGet.json.data.tiles.length === 1);
  assert.equal(dashGet.json.data.tiles[0].metric, `status_count_${suffix}`);
  assert.equal(typeof dashGet.json.data.tiles[0].value, 'number');

  // Verify invalid filter operators are stripped (no crash)
  const metricBadFilter = await request({
    path: '/analytics/metrics',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      key: `filtered_${suffix}`,
      name: 'Filtered Metric',
      dataset: 'registrations',
      aggregation: 'count',
      filterTemplate: { status: { $eq: 'REGISTERED' }, '$where': 'sleep(1000)' }
    }
  });
  assert.equal(metricBadFilter.status, 201);

  // Create dashboard with the filtered metric; $where should be stripped
  const dashFiltered = await request({
    path: '/analytics/dashboards',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      name: `Filtered Dashboard ${suffix}`,
      tiles: [{ metric: `filtered_${suffix}` }],
      anomalyRules: []
    }
  });
  assert.equal(dashFiltered.status, 201);
  const dashFilteredGet = await request({
    path: `/analytics/dashboards/${dashFiltered.json.data.dashboardId}`,
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(dashFilteredGet.status, 200);
  assert.equal(typeof dashFilteredGet.json.data.tiles[0].value, 'number');
});
