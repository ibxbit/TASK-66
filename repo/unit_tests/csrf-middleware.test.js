const test = require('node:test');
const assert = require('node:assert/strict');
const { requireCsrf } = require('../backend/src/middleware/auth');

const createRes = () => ({
  code: 200,
  body: null,
  status(statusCode) {
    this.code = statusCode;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  }
});

test('csrf middleware allows login bootstrap without prior token', () => {
  let nextCalled = false;
  const req = {
    method: 'POST',
    path: '/auth/login',
    originalUrl: '/api/v1/auth/login',
    get: () => undefined,
    session: {}
  };
  const res = createRes();

  requireCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.body, null);
});

test('csrf middleware still enforces token for protected writes', () => {
  let nextCalled = false;
  const req = {
    method: 'POST',
    path: '/catalog/hot-keywords',
    originalUrl: '/api/v1/catalog/hot-keywords',
    get: () => undefined,
    session: { auth: { csrfToken: 'csrf_abc' } }
  };
  const res = createRes();

  requireCsrf(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.code, 403);
  assert.equal(res.body.error.code, 'CSRF_TOKEN_INVALID');
});
