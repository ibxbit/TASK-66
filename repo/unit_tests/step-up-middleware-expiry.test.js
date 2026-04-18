const test = require('node:test');
const assert = require('node:assert/strict');
const { requireStepUp } = require('../backend/src/middleware/step-up');

const createRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  }
});

test('step-up middleware rejects expired step-up token proof', () => {
  const req = {
    get: () => 'stp_expired',
    session: {
      auth: {
        stepUpProof: {
          token: 'stp_expired',
          action: 'EXPORT_CREATE',
          validUntil: new Date(Date.now() - 1000).toISOString()
        }
      }
    }
  };
  const res = createRes();

  let nextCalled = false;
  requireStepUp('EXPORT_CREATE')(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'STEP_UP_REQUIRED');
});
