const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateWowDropRule } = require('../backend/src/services/analytics');

test('anomaly rule returns inconclusive for low baseline volume', () => {
  const result = evaluateWowDropRule({
    current: 3,
    previous: 8,
    thresholdPercent: 30,
    minBaselineCount: 20
  });

  assert.equal(result.status, 'INCONCLUSIVE');
  assert.match(result.message, /Insufficient baseline volume/i);
});

test('anomaly rule triggers when wow drop exceeds threshold', () => {
  const result = evaluateWowDropRule({
    current: 60,
    previous: 100,
    thresholdPercent: 30,
    minBaselineCount: 20
  });

  assert.equal(result.status, 'TRIGGERED');
  assert.match(result.message, /dropped/i);
});

test('anomaly rule returns ok for normal range changes', () => {
  const result = evaluateWowDropRule({
    current: 95,
    previous: 100,
    thresholdPercent: 30,
    minBaselineCount: 20
  });

  assert.equal(result.status, 'OK');
});
