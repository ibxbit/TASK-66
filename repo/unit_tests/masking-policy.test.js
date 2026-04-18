const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFieldPolicy } = require('../backend/src/services/exports');

const sampleRows = [
  {
    participantId: 'usr_900',
    name: 'Pat Riley',
    phone: '555-101-1234',
    email: 'pat@example.local',
    notes: 'Needs support'
  }
];

test('auditor masking policy hides sensitive fields', () => {
  const result = applyFieldPolicy({
    resource: 'participants',
    rows: sampleRows,
    requestedFields: ['name', 'phone', 'email', 'notes'],
    userRoles: ['Auditor']
  });

  assert.equal(result.transformedRows[0].name, 'Pat Riley');
  assert.equal(result.transformedRows[0].phone, '***-***-1234');
  assert.equal(result.transformedRows[0].email, '[OMITTED]');
  assert.equal(result.transformedRows[0].notes, '[REDACTED]');
});

test('admin masking policy hashes email and keeps phone last4', () => {
  const result = applyFieldPolicy({
    resource: 'participants',
    rows: sampleRows,
    requestedFields: ['name', 'phone', 'email', 'notes'],
    userRoles: ['Administrator']
  });

  assert.equal(result.transformedRows[0].phone, '***-***-1234');
  assert.match(result.transformedRows[0].email, /^[a-f0-9]{16}$/);
  assert.equal(result.transformedRows[0].notes, '[REDACTED]');
});
