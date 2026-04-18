const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../backend/src/services/reconciliation');

test('csv conversion produces stable header and escaped rows', () => {
  const csv = toCsv([
    { name: 'Pat Riley', notes: 'hello, "team"' },
    { name: 'Dana Kim', notes: 'ok' }
  ]);

  const lines = csv.split('\n');
  assert.equal(lines[0], '"name","notes"');
  assert.equal(lines[1], '"Pat Riley","hello, ""team"""');
  assert.equal(lines[2], '"Dana Kim","ok"');
});

test('csv conversion of empty array returns empty string', () => {
  assert.equal(toCsv([]), '');
});
