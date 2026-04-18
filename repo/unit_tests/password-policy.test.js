const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePasswordStrength } = require('../backend/src/lib/password');

test('password validator rejects short password', () => {
  const result = validatePasswordStrength('Short1!');
  assert.equal(result.valid, false);
  assert.match(result.message, /at least/i);
});

test('password validator rejects missing complexity', () => {
  const result = validatePasswordStrength('alllowercase1234');
  assert.equal(result.valid, false);
  assert.match(result.message, /uppercase/i);
});

test('password validator accepts strong password', () => {
  const result = validatePasswordStrength('StrongPass!2026');
  assert.equal(result.valid, true);
});
