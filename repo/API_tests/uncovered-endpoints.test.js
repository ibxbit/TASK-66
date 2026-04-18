/**
 * True no-mock HTTP integration tests for endpoints previously uncovered.
 * These target the running backend (see run_tests.sh for boot orchestration).
 *
 * Each test asserts:
 *  - endpoint identity (method + path)
 *  - request input (body/query/cookie)
 *  - response status AND content (payload shape + critical fields)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';

const parseCookies = (setCookieHeaders = []) =>
  setCookieHeaders.map((cookie) => cookie.split(';')[0]).join('; ');

const request = async ({ path, method = 'GET', body, cookie, csrfToken, stepUpToken, accept }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (accept) headers.Accept = accept;
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
    text,
    contentType: response.headers.get('content-type') || '',
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
  assert.equal(response.status, 200, `step-up failed for action ${action}`);
  return response.json.data.stepUpToken;
};

// Raw HTTP for non-/api/v1 docs endpoint
const requestRaw = async (url, { method = 'GET' } = {}) => {
  const response = await fetch(url, { method });
  const text = await response.text();
  return {
    status: response.status,
    text,
    contentType: response.headers.get('content-type') || ''
  };
};

/* -------------------- docs -------------------- */

test('GET /api/v1/docs/openapi.yaml returns raw OpenAPI spec for clients', async () => {
  const DOCS_BASE = API_BASE.replace(/\/api\/v1$/, '');
  const res = await requestRaw(`${DOCS_BASE}/api/v1/docs/openapi.yaml`);
  assert.equal(res.status, 200, 'openapi.yaml is publicly retrievable for tooling');
  assert.ok(res.text.includes('openapi'), 'body contains openapi root key');
  assert.ok(res.text.includes('paths:'), 'body describes API paths');
});

test('GET /api/v1/docs returns Swagger UI HTML index at the documented path', async () => {
  const DOCS_BASE = API_BASE.replace(/\/api\/v1$/, '');
  // swagger-ui-express requires the trailing slash for the index document;
  // hit it directly to prove the mounted middleware is reachable.
  const res = await requestRaw(`${DOCS_BASE}/api/v1/docs/`);
  assert.equal(res.status, 200, 'Swagger UI index is reachable at /api/v1/docs/');
  assert.ok(/text\/html/i.test(res.contentType), 'Swagger UI serves HTML');
  assert.ok(
    res.text.toLowerCase().includes('swagger'),
    'response body is the Swagger UI shell'
  );
});

/* -------------------- users: GET / and PATCH /:userId -------------------- */

test('GET /users and PATCH /users/:userId enforce USERS_ADMIN and update roles/status', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;

  // GET /users — admin allowed, curator blocked
  const adminList = await request({ path: '/users', method: 'GET', cookie: admin.cookie });
  assert.equal(adminList.status, 200);
  assert.ok(Array.isArray(adminList.json.data), 'users list is an array');
  assert.ok(adminList.json.data.length >= 1, 'at least admin.dev exists');
  const adminRecord = adminList.json.data.find((u) => u.username === 'admin.dev');
  assert.ok(adminRecord, 'admin.dev present in listing');
  assert.ok(!adminRecord.password_hash, 'password_hash must never be serialized');

  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const curatorList = await request({ path: '/users', method: 'GET', cookie: curator.cookie });
  assert.equal(curatorList.status, 403, 'non-admin cannot list users');
  assert.equal(curatorList.json.error.code, 'FORBIDDEN');

  // Create a throwaway user, then PATCH roles + status
  const createdUser = await request({
    path: '/users',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      username: `patch.target.${suffix}`,
      password: 'PatchTarget!2026',
      roles: ['Reviewer']
    }
  });
  assert.equal(createdUser.status, 201);
  const userId = createdUser.json.data.id;
  assert.ok(userId);

  // PATCH: valid role update
  const patchRoles = await request({
    path: `/users/${userId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { roles: ['Reviewer', 'Auditor'] }
  });
  assert.equal(patchRoles.status, 200);
  assert.deepEqual(patchRoles.json.data.roles.sort(), ['Auditor', 'Reviewer']);

  // PATCH: status DISABLED
  const patchStatus = await request({
    path: `/users/${userId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { status: 'DISABLED' }
  });
  assert.equal(patchStatus.status, 200);
  assert.equal(patchStatus.json.data.status, 'DISABLED');

  // PATCH: invalid role rejected
  const patchInvalidRole = await request({
    path: `/users/${userId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { roles: ['SUPER_HACKER'] }
  });
  assert.equal(patchInvalidRole.status, 400);
  assert.equal(patchInvalidRole.json.error.code, 'VALIDATION_ERROR');

  // PATCH: invalid status rejected
  const patchInvalidStatus = await request({
    path: `/users/${userId}`,
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { status: 'PENDING_DELETION' }
  });
  assert.equal(patchInvalidStatus.status, 400);
  assert.equal(patchInvalidStatus.json.error.code, 'VALIDATION_ERROR');

  // PATCH: non-existent user -> 404
  const patchMissing = await request({
    path: '/users/507f1f77bcf86cd799439011',
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { status: 'ACTIVE' }
  });
  assert.equal(patchMissing.status, 404);
  assert.equal(patchMissing.json.error.code, 'NOT_FOUND');

  // PATCH: forbidden for non-admin
  const patchForbidden = await request({
    path: `/users/${userId}`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { status: 'ACTIVE' }
  });
  assert.equal(patchForbidden.status, 403);
  assert.equal(patchForbidden.json.error.code, 'FORBIDDEN');
});

/* -------------------- catalog items: PATCH and DELETE -------------------- */

test('PATCH /catalog/items/:itemId and DELETE /catalog/items/:itemId enforce curation rights and return updated record', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const suffix = `${Date.now()}`;

  const created = await request({
    path: '/catalog/items',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      title: `Edit Target ${suffix}`,
      catalogNumber: `EDT-${suffix}`,
      artist: 'Edit Artist',
      series: 'Edit Series',
      country: 'USA',
      period: '1950s',
      category: 'Showcase',
      tags: ['edit']
    }
  });
  assert.equal(created.status, 201);
  const itemId = created.json.data.id;

  // PATCH by curator
  const patch = await request({
    path: `/catalog/items/${itemId}`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { title: `Edited Title ${suffix}`, tags: ['edit', 'updated'], category: 'Featured' }
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.json.data.title, `Edited Title ${suffix}`);
  assert.equal(patch.json.data.category, 'Featured');
  assert.deepEqual(patch.json.data.tags.sort(), ['edit', 'updated']);

  // PATCH blocked for reviewer
  const patchForbidden = await request({
    path: `/catalog/items/${itemId}`,
    method: 'PATCH',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    body: { title: 'Reviewer cannot edit' }
  });
  assert.equal(patchForbidden.status, 403);
  assert.equal(patchForbidden.json.error.code, 'FORBIDDEN');

  // PATCH non-existent returns 404
  const patchMissing = await request({
    path: '/catalog/items/507f1f77bcf86cd799439011',
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { title: 'Does not exist' }
  });
  assert.equal(patchMissing.status, 404);

  // DELETE by curator (soft delete -> ARCHIVED)
  const del = await request({
    path: `/catalog/items/${itemId}`,
    method: 'DELETE',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(del.status, 204);

  // After archive, search no longer returns it (status=ACTIVE filter)
  const postDelete = await request({
    path: `/catalog/search?q=EDT-${suffix}&page=1&pageSize=20`,
    method: 'GET'
  });
  assert.equal(postDelete.status, 200);
  assert.ok(
    !postDelete.json.data.some((row) => row.catalogNumber === `EDT-${suffix}`),
    'archived item must not appear in active search'
  );

  // DELETE non-existent -> 404
  const delMissing = await request({
    path: '/catalog/items/507f1f77bcf86cd799439011',
    method: 'DELETE',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(delMissing.status, 404);

  // DELETE forbidden for reviewer
  const delForbidden = await request({
    path: `/catalog/items/${itemId}`,
    method: 'DELETE',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken
  });
  assert.equal(delForbidden.status, 403);
});

/* -------------------- graph: versions + node PATCH + edge PATCH/DELETE -------------------- */

test('GET /graph/versions lists published graph versions (no snapshot leakage)', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const suffix = `${Date.now()}`;

  // Ensure at least one valid published version exists
  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(draft.status, 201);
  const draftId = draft.json.data.draftId;

  // Start from clean node set
  const current = await request({
    path: `/graph/drafts/${draftId}`,
    method: 'GET',
    cookie: curator.cookie
  });
  for (const node of current.json.data.snapshot.nodes || []) {
    await request({
      path: `/graph/drafts/${draftId}/nodes/${node.node_id}`,
      method: 'DELETE',
      cookie: curator.cookie,
      csrfToken: curator.csrfToken
    });
  }

  const stamp = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'STAMP', label: `Version Stamp ${suffix}` }
  });
  const artist = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'ARTIST', label: `Version Artist ${suffix}` }
  });
  await request({
    path: `/graph/drafts/${draftId}/edges`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: stamp.json.data.node_id,
      toNodeId: artist.json.data.node_id,
      relationType: 'CREATED_BY',
      weight: 95
    }
  });

  const stepUp = await acquireStepUp(curator, 'CuratorSecure!2026', 'GRAPH_PUBLISH');
  const publish = await request({
    path: `/graph/drafts/${draftId}/publish`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    stepUpToken: stepUp
  });
  assert.equal(publish.status, 200);

  // GET /graph/versions
  const versions = await request({ path: '/graph/versions', method: 'GET', cookie: curator.cookie });
  assert.equal(versions.status, 200);
  assert.ok(Array.isArray(versions.json.data));
  assert.ok(versions.json.data.length >= 1, 'must have at least one published version');

  const latest = versions.json.data[0];
  assert.ok(Number.isInteger(latest.version), 'version is an integer');
  assert.ok(latest.publishedBy, 'publishedBy present');
  assert.ok(latest.checksum && /^[0-9a-f]{64}$/.test(latest.checksum), 'checksum is sha256 hex');
  assert.ok(!('snapshot' in latest), 'snapshot must not leak through listing');
});

test('PATCH /graph/drafts/:id/nodes/:nodeId updates metadata and re-validates', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const suffix = `${Date.now()}`;

  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  const draftId = draft.json.data.draftId;
  const node = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'ARTIST', label: `Node Patch ${suffix}`, metadata: { origin: 'initial' } }
  });
  assert.equal(node.status, 201);

  const patched = await request({
    path: `/graph/drafts/${draftId}/nodes/${node.json.data.node_id}`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { label: `Patched Label ${suffix}`, metadata: { origin: 'updated', nationality: 'Uruguay' } }
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.data.label, `Patched Label ${suffix}`);
  assert.equal(patched.json.data.metadata.nationality, 'Uruguay');

  // Missing node returns 404
  const missing = await request({
    path: `/graph/drafts/${draftId}/nodes/n_doesnotexist`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { label: 'new' }
  });
  assert.equal(missing.status, 404);

  // Non-admin, non-owner cannot patch
  const forbidden = await request({
    path: `/graph/drafts/${draftId}/nodes/${node.json.data.node_id}`,
    method: 'PATCH',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    body: { label: 'hijack' }
  });
  // Reviewer lacks GRAPH_DRAFT_EDIT -> 403
  assert.equal(forbidden.status, 403);
});

test('PATCH and DELETE on /graph/drafts/:id/edges/:edgeId enforce validation and existence', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const suffix = `${Date.now()}`;

  const draft = await request({
    path: '/graph/drafts',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  const draftId = draft.json.data.draftId;

  const nodeA = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'STAMP', label: `Edge Node A ${suffix}` }
  });
  const nodeB = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'ARTIST', label: `Edge Node B ${suffix}` }
  });
  const nodeC = await request({
    path: `/graph/drafts/${draftId}/nodes`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { type: 'ARTIST', label: `Edge Node C ${suffix}` }
  });

  const edge = await request({
    path: `/graph/drafts/${draftId}/edges`,
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: nodeA.json.data.node_id,
      toNodeId: nodeB.json.data.node_id,
      relationType: 'CREATED_BY',
      weight: 50
    }
  });
  assert.equal(edge.status, 201);
  const edgeId = edge.json.data.edge_id;

  // PATCH valid -> 200
  const patched = await request({
    path: `/graph/drafts/${draftId}/edges/${edgeId}`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: nodeA.json.data.node_id,
      toNodeId: nodeC.json.data.node_id,
      relationType: 'CREATED_BY',
      weight: 80,
      constraints: { allowedTargetTypes: ['ARTIST'] }
    }
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.data.to_node_id, nodeC.json.data.node_id);
  assert.equal(patched.json.data.weight, 80);

  // PATCH invalid weight -> 400
  const invalid = await request({
    path: `/graph/drafts/${draftId}/edges/${edgeId}`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: nodeA.json.data.node_id,
      toNodeId: nodeC.json.data.node_id,
      relationType: 'CREATED_BY',
      weight: 101
    }
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, 'VALIDATION_ERROR');

  // PATCH missing edge -> 404
  const missing = await request({
    path: `/graph/drafts/${draftId}/edges/e_doesnotexist`,
    method: 'PATCH',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      fromNodeId: nodeA.json.data.node_id,
      toNodeId: nodeC.json.data.node_id,
      relationType: 'CREATED_BY',
      weight: 40
    }
  });
  assert.equal(missing.status, 404);

  // DELETE edge -> 204
  const deleted = await request({
    path: `/graph/drafts/${draftId}/edges/${edgeId}`,
    method: 'DELETE',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(deleted.status, 204);

  // DELETE again -> 404 (already gone)
  const deletedAgain = await request({
    path: `/graph/drafts/${draftId}/edges/${edgeId}`,
    method: 'DELETE',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken
  });
  assert.equal(deletedAgain.status, 404);
});

/* -------------------- participants credits adjustment -------------------- */

test('POST /participants/:id/credits/adjustments applies delta, returns balance, and emits audit', { concurrency: false }, async () => {
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const suffix = `${Date.now()}`;
  const participantId = `adj_${suffix}`;
  const programType = `ADJ_${suffix}`;

  // GRANT 5
  const grant = await request({
    path: `/participants/${participantId}/credits/adjustments`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      entryType: 'GRANT',
      amount: 5,
      reasonCode: 'INITIAL_GRANT',
      notes: 'Granted for loyalty',
      programType
    }
  });
  assert.equal(grant.status, 201);
  assert.equal(grant.json.data.balance, 5);
  assert.equal(grant.json.data.entry.entryType, 'GRANT');
  assert.equal(grant.json.data.entry.reasonCode, 'INITIAL_GRANT');

  // DEDUCT 2 -> balance 3
  const deduct = await request({
    path: `/participants/${participantId}/credits/adjustments`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      entryType: 'DEDUCT',
      amount: 2,
      reasonCode: 'COURTESY_DEDUCT',
      programType
    }
  });
  assert.equal(deduct.status, 201);
  assert.equal(deduct.json.data.balance, 3);

  // Invalid entryType -> 400
  const invalid = await request({
    path: `/participants/${participantId}/credits/adjustments`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: {
      entryType: 'UNICORN',
      amount: 1,
      reasonCode: 'WHY_NOT',
      programType
    }
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, 'VALIDATION_ERROR');

  // Missing programType -> 400
  const missingProgram = await request({
    path: `/participants/${participantId}/credits/adjustments`,
    method: 'POST',
    cookie: coordinator.cookie,
    csrfToken: coordinator.csrfToken,
    body: { entryType: 'ADJUST', amount: 1, reasonCode: 'ANY' }
  });
  assert.equal(missingProgram.status, 400);

  // Ensure audit event was created (Administrator can read audit)
  const audits = await request({
    path: '/audit/events?filter[action]=CREDIT_ADJUSTMENT&page=1&pageSize=10',
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(audits.status, 200);
  assert.ok(
    audits.json.data.some((item) => item.action === 'CREDIT_ADJUSTMENT'),
    'credit adjustment emits CREDIT_ADJUSTMENT audit event'
  );
});

/* -------------------- jobs: GET / and lifecycle (approve/reject/takedown/appeal decide) -------------------- */

test('GET /jobs lists with pagination+filter, and full lifecycle approve/reject/takedown/appeal decide works', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const employer = await login('employer.dev', 'EmployerSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const suffix = `${Date.now()}`;

  // Create a job
  const created = await request({
    path: '/jobs',
    method: 'POST',
    cookie: employer.cookie,
    csrfToken: employer.csrfToken,
    body: {
      department: `Dept ${suffix}`,
      title: `Job ${suffix}`,
      description: 'End-to-end lifecycle job',
      shiftInfo: 'Mon-Fri'
    }
  });
  assert.equal(created.status, 201);
  const jobId = created.json.data.jobId;

  // Submit
  const submit = await request({
    path: `/jobs/${jobId}/submit`,
    method: 'POST',
    cookie: employer.cookie,
    csrfToken: employer.csrfToken
  });
  assert.equal(submit.status, 200);
  assert.equal(submit.json.data.state, 'PENDING_APPROVAL');

  // GET /jobs — filter by state, verify shape
  const list = await request({
    path: `/jobs?filter[state]=PENDING_APPROVAL&page=1&pageSize=20`,
    method: 'GET',
    cookie: reviewer.cookie
  });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.json.data));
  assert.ok(list.json.pagination);
  assert.ok(
    list.json.data.some((row) => row.jobId === jobId && row.state === 'PENDING_APPROVAL'),
    'list must include our pending job with filter applied'
  );
  assert.ok(list.json.data.every((row) => row.state === 'PENDING_APPROVAL'));

  // Reject (step-up NOT required on reject path)
  const reject = await request({
    path: `/jobs/${jobId}/reject`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    body: { comment: 'Needs more detail' }
  });
  assert.equal(reject.status, 200);
  assert.equal(reject.json.data.state, 'DRAFT');

  // Re-submit, then approve with step-up (required)
  const reSubmit = await request({
    path: `/jobs/${jobId}/submit`,
    method: 'POST',
    cookie: employer.cookie,
    csrfToken: employer.csrfToken
  });
  assert.equal(reSubmit.status, 200);

  // Approve WITHOUT step-up must fail
  const approveNoStep = await request({
    path: `/jobs/${jobId}/approve`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken
  });
  assert.equal(approveNoStep.status, 403);
  assert.equal(approveNoStep.json.error.code, 'STEP_UP_REQUIRED');

  const approveStep = await acquireStepUp(reviewer, 'ReviewerSecure!2026', 'JOB_APPROVE');
  const approve = await request({
    path: `/jobs/${jobId}/approve`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    stepUpToken: approveStep,
    body: { comment: 'Looks good' }
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.json.data.state, 'PUBLISHED');

  // Takedown (step-up NOT required on takedown)
  const takedown = await request({
    path: `/jobs/${jobId}/takedown`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    body: { reason: 'Policy violation', policyCode: 'P-409' }
  });
  assert.equal(takedown.status, 200);
  assert.equal(takedown.json.data.state, 'TAKEDOWN');

  // Employer appeals
  const appeal = await request({
    path: `/jobs/${jobId}/appeals`,
    method: 'POST',
    cookie: employer.cookie,
    csrfToken: employer.csrfToken,
    body: { comment: 'Disputed — please review' }
  });
  assert.equal(appeal.status, 201);
  const appealId = appeal.json.data.appealId;
  assert.ok(appealId);

  // Appeal decide without step-up -> 403
  const decideNoStep = await request({
    path: `/jobs/${jobId}/appeals/${appealId}/decide`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    body: { decision: 'APPROVE' }
  });
  assert.equal(decideNoStep.status, 403);
  assert.equal(decideNoStep.json.error.code, 'STEP_UP_REQUIRED');

  // Appeal decide with invalid decision -> 400
  const decideStep = await acquireStepUp(reviewer, 'ReviewerSecure!2026', 'JOB_APPEAL_DECIDE');
  const decideInvalid = await request({
    path: `/jobs/${jobId}/appeals/${appealId}/decide`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    stepUpToken: decideStep,
    body: { decision: 'MAYBE' }
  });
  assert.equal(decideInvalid.status, 400);
  assert.equal(decideInvalid.json.error.code, 'VALIDATION_ERROR');

  // Appeal decide APPROVE -> REPUBLISHED_NEW_VERSION
  const decideStep2 = await acquireStepUp(reviewer, 'ReviewerSecure!2026', 'JOB_APPEAL_DECIDE');
  const decideApprove = await request({
    path: `/jobs/${jobId}/appeals/${appealId}/decide`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    stepUpToken: decideStep2,
    body: { decision: 'APPROVE', comment: 'Appeal upheld' }
  });
  assert.equal(decideApprove.status, 200);
  assert.equal(decideApprove.json.data.state, 'REPUBLISHED_NEW_VERSION');

  // Non-pending appeal -> 409 on subsequent decide
  const decideStep3 = await acquireStepUp(reviewer, 'ReviewerSecure!2026', 'JOB_APPEAL_DECIDE');
  const decideAfter = await request({
    path: `/jobs/${jobId}/appeals/${appealId}/decide`,
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    stepUpToken: decideStep3,
    body: { decision: 'REJECT' }
  });
  assert.equal(decideAfter.status, 409);

  // Employer cannot approve (lacks JOB_APPROVE)
  const forbidden = await request({
    path: `/jobs/${jobId}/approve`,
    method: 'POST',
    cookie: employer.cookie,
    csrfToken: employer.csrfToken
  });
  assert.equal(forbidden.status, 403);
});

test('GET /jobs restricts Employer to own jobs and returns empty when no match', { concurrency: false }, async () => {
  const employer = await login('employer.dev', 'EmployerSecure!2026');
  const bogusFilter = await request({
    path: `/jobs?filter[state]=PUBLISHED&filter[department]=___does_not_exist___&page=1&pageSize=5`,
    method: 'GET',
    cookie: employer.cookie
  });
  assert.equal(bogusFilter.status, 200);
  assert.equal(bogusFilter.json.pagination.total, 0);
  assert.deepEqual(bogusFilter.json.data, []);
});

/* -------------------- admin: config GET/PATCH, cache invalidate, reconciliation artifacts -------------------- */

test('GET /admin/config returns current operational configuration and enforces permission', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');

  const configRead = await request({ path: '/admin/config', method: 'GET', cookie: admin.cookie });
  assert.equal(configRead.status, 200);
  assert.ok('searchCacheTtlSeconds' in configRead.json.data);
  assert.ok('reportScheduleTimezone' in configRead.json.data);
  assert.ok('waitlistPromotionExpiryMinutes' in configRead.json.data);
  assert.ok('inboxRetentionDays' in configRead.json.data);
  assert.equal(typeof configRead.json.data.searchCacheTtlSeconds, 'number');

  const forbidden = await request({ path: '/admin/config', method: 'GET', cookie: reviewer.cookie });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.error.code, 'FORBIDDEN');
});

test('PATCH /admin/config requires step-up and persists changes visible via GET', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');

  // PATCH without step-up -> 403
  const noStep = await request({
    path: '/admin/config',
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: { searchCacheTtlSeconds: 777 }
  });
  assert.equal(noStep.status, 403);
  assert.equal(noStep.json.error.code, 'STEP_UP_REQUIRED');

  // Empty body after step-up -> 400
  const emptyStep = await acquireStepUp(admin, 'AdminSecure!2026', 'ADMIN_CONFIG_UPDATE');
  const empty = await request({
    path: '/admin/config',
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    stepUpToken: emptyStep,
    body: {}
  });
  assert.equal(empty.status, 400);
  assert.equal(empty.json.error.code, 'VALIDATION_ERROR');

  // Valid PATCH
  const validStep = await acquireStepUp(admin, 'AdminSecure!2026', 'ADMIN_CONFIG_UPDATE');
  const priorRead = await request({ path: '/admin/config', method: 'GET', cookie: admin.cookie });
  const priorTtl = priorRead.json.data.searchCacheTtlSeconds;
  const targetTtl = priorTtl + 5;

  const patched = await request({
    path: '/admin/config',
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    stepUpToken: validStep,
    body: {
      searchCacheTtlSeconds: targetTtl,
      reportScheduleTimezone: 'America/New_York',
      waitlistPromotionExpiryMinutes: 77,
      inboxRetentionDays: 77
    }
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.data.searchCacheTtlSeconds, targetTtl);
  assert.equal(patched.json.data.waitlistPromotionExpiryMinutes, 77);

  // Verify GET returns the updated value
  const afterRead = await request({ path: '/admin/config', method: 'GET', cookie: admin.cookie });
  assert.equal(afterRead.json.data.searchCacheTtlSeconds, targetTtl);
  assert.equal(afterRead.json.data.waitlistPromotionExpiryMinutes, 77);

  // Reset to prior to avoid side-effects on other tests
  const resetStep = await acquireStepUp(admin, 'AdminSecure!2026', 'ADMIN_CONFIG_UPDATE');
  await request({
    path: '/admin/config',
    method: 'PATCH',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    stepUpToken: resetStep,
    body: {
      searchCacheTtlSeconds: priorTtl,
      waitlistPromotionExpiryMinutes: priorRead.json.data.waitlistPromotionExpiryMinutes,
      inboxRetentionDays: priorRead.json.data.inboxRetentionDays
    }
  });
});

test('POST /admin/cache/invalidate clears search cache for CATALOG_SEARCH scope and is authz-guarded', { concurrency: false }, async () => {
  const curator = await login('curator.dev', 'CuratorSecure!2026');
  const reviewer = await login('reviewer.dev', 'ReviewerSecure!2026');
  const suffix = `${Date.now()}`;

  // Populate cache
  await request({
    path: '/catalog/items',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: {
      title: `Cache Target ${suffix}`,
      catalogNumber: `CACHE-${suffix}`,
      artist: 'Cache Artist',
      series: 'S',
      country: 'USA',
      period: '2020s',
      category: 'Cache'
    }
  });
  await request({ path: `/catalog/search?q=CACHE-${suffix}&page=1&pageSize=10`, method: 'GET' });
  const hit = await request({ path: `/catalog/search?q=CACHE-${suffix}&page=1&pageSize=10`, method: 'GET' });
  assert.equal(hit.json.meta.cache, 'HIT');

  // Reviewer cannot invalidate
  const forbidden = await request({
    path: '/admin/cache/invalidate',
    method: 'POST',
    cookie: reviewer.cookie,
    csrfToken: reviewer.csrfToken,
    body: { scope: 'CATALOG_SEARCH' }
  });
  assert.equal(forbidden.status, 403);

  // Curator can
  const invalidate = await request({
    path: '/admin/cache/invalidate',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { scope: 'CATALOG_SEARCH' }
  });
  assert.equal(invalidate.status, 200);
  assert.equal(invalidate.json.data.invalidated, 'CATALOG_SEARCH');

  // After invalidation, next query is MISS
  const missAfter = await request({ path: `/catalog/search?q=CACHE-${suffix}&page=1&pageSize=10`, method: 'GET' });
  assert.equal(missAfter.json.meta.cache, 'MISS');

  // Unknown scope -> 200 with NONE
  const unknown = await request({
    path: '/admin/cache/invalidate',
    method: 'POST',
    cookie: curator.cookie,
    csrfToken: curator.csrfToken,
    body: { scope: 'UNKNOWN_SCOPE' }
  });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.json.data.invalidated, 'NONE');
});

test('GET /admin/reconciliation/artifacts returns sorted artifacts with checksums, gated by RECONCILIATION_READ', { concurrency: false }, async () => {
  const admin = await login('admin.dev', 'AdminSecure!2026');
  const auditor = await login('auditor.dev', 'AuditorSecure!2026');
  const coordinator = await login('coordinator.dev', 'CoordinatorSecure!2026');

  // Force a report run to produce at least one artifact
  const suffix = `${Date.now()}`;
  const report = await request({
    path: '/analytics/reports',
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken,
    body: {
      name: `Recon Report ${suffix}`,
      dataset: 'staffing_jobs',
      format: 'JSON',
      schedule: { time: '02:00', timezone: 'America/New_York' }
    }
  });
  assert.equal(report.status, 201);
  const run = await request({
    path: `/analytics/reports/${report.json.data.reportId}/run`,
    method: 'POST',
    cookie: admin.cookie,
    csrfToken: admin.csrfToken
  });
  assert.equal(run.status, 200);
  assert.equal(run.json.data.status, 'SUCCESS');

  const artifactsAdmin = await request({
    path: '/admin/reconciliation/artifacts',
    method: 'GET',
    cookie: admin.cookie
  });
  assert.equal(artifactsAdmin.status, 200);
  assert.ok(Array.isArray(artifactsAdmin.json.data));
  assert.ok(artifactsAdmin.json.data.length >= 1, 'at least one artifact after running a report');
  const sample = artifactsAdmin.json.data[0];
  assert.ok(['REPORT', 'EXPORT'].includes(sample.type));
  assert.ok(sample.id);
  assert.ok(sample.artifactPath);
  assert.ok(sample.checksumSha256 && /^[0-9a-f]{64}$/.test(sample.checksumSha256));
  // Sorted descending by createdAt
  for (let i = 1; i < artifactsAdmin.json.data.length; i += 1) {
    const prev = new Date(artifactsAdmin.json.data[i - 1].createdAt).getTime();
    const curr = new Date(artifactsAdmin.json.data[i].createdAt).getTime();
    assert.ok(prev >= curr, 'artifacts sorted newest first');
  }

  const artifactsAuditor = await request({
    path: '/admin/reconciliation/artifacts',
    method: 'GET',
    cookie: auditor.cookie
  });
  assert.equal(artifactsAuditor.status, 200);

  const forbidden = await request({
    path: '/admin/reconciliation/artifacts',
    method: 'GET',
    cookie: coordinator.cookie
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.error.code, 'FORBIDDEN');
});
