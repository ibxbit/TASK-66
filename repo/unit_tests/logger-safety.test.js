const test = require('node:test');
const assert = require('node:assert/strict');
const { logInfo, logError } = require('../backend/src/lib/logger');

test('structured info logs redact password token and cookie fields', () => {
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => {
    messages.push(message);
  };

  try {
    logInfo('auth_attempt', {
      requestId: 'req_123',
      password: 'SuperSecret!2026',
      stepUpToken: 'stp_abc123',
      sessionCookie: 'museum_sid=secret',
      nested: {
        token: 'abc',
        cookieValue: 'value'
      }
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(messages.length, 1);
  const payload = JSON.parse(messages[0]);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.password, '[REDACTED]');
  assert.equal(payload.stepUpToken, '[REDACTED]');
  assert.equal(payload.sessionCookie, '[REDACTED]');
  assert.equal(payload.nested.token, '[REDACTED]');
  assert.equal(payload.nested.cookieValue, '[REDACTED]');
  assert.ok(!serialized.includes('SuperSecret!2026'));
  assert.ok(!serialized.includes('stp_abc123'));
  assert.ok(!serialized.includes('museum_sid=secret'));
});

test('structured error logs redact sensitive fields from context and error payload', () => {
  const messages = [];
  const originalError = console.error;
  console.error = (message) => {
    messages.push(message);
  };

  try {
    const error = new Error('invalid password provided');
    error.token = 'bad-token';
    logError('request_failure', {
      requestId: 'req_456',
      authToken: 'jwt_secret',
      cookie: 'museum_sid=private',
      error
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(messages.length, 1);
  const payload = JSON.parse(messages[0]);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.authToken, '[REDACTED]');
  assert.equal(payload.cookie, '[REDACTED]');
  assert.equal(payload.error.name, 'Error');
  assert.equal(typeof payload.error.message, 'string');
  assert.ok(!serialized.includes('jwt_secret'));
  assert.ok(!serialized.includes('museum_sid=private'));
});
