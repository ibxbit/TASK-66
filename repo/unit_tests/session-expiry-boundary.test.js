const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth } = require('../backend/src/middleware/auth');

const createRes = () => {
  const res = {
    clearedCookie: null,
    statusCode: 200,
    payload: null,
    clearCookie(name) {
      this.clearedCookie = name;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
  return res;
};

test('requireAuth rejects expired idle session boundary without waiting', async () => {
  const req = {
    session: {
      auth: {
        userId: '507f1f77bcf86cd799439011',
        idleExpiresAt: new Date(Date.now() - 1).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      },
      destroyCalled: false,
      destroy(callback) {
        this.destroyCalled = true;
        if (callback) callback();
      }
    }
  };
  const res = createRes();

  let nextCalled = false;
  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error.code, 'SESSION_EXPIRED');
  assert.equal(req.session.destroyCalled, true);
});
