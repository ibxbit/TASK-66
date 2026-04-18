const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGraphSnapshot } = require('../backend/src/services/graph-validation');

test('graph validation passes for connected acyclic snapshot', () => {
  const report = validateGraphSnapshot({
    nodes: [
      { node_id: 'n1', type: 'STAMP', label: 'Blue Airmail' },
      { node_id: 'n2', type: 'ARTIST', label: 'I. Kline' }
    ],
    edges: [
      {
        edge_id: 'e1',
        from_node_id: 'n1',
        to_node_id: 'n2'
      }
    ]
  });

  assert.equal(report.status, 'VALID');
  assert.equal(report.issues.length, 0);
});

test('graph validation catches duplicates cycles and orphans', () => {
  const report = validateGraphSnapshot({
    nodes: [
      { node_id: 'a', type: 'STAMP', label: 'Duplicate' },
      { node_id: 'b', type: 'STAMP', label: 'Duplicate' },
      { node_id: 'c', type: 'ARTIST', label: 'Orphan' }
    ],
    edges: [
      { edge_id: 'e1', from_node_id: 'a', to_node_id: 'b' },
      { edge_id: 'e2', from_node_id: 'b', to_node_id: 'a' }
    ]
  });

  assert.equal(report.status, 'INVALID');
  const codes = report.issues.map((issue) => issue.code);
  assert.ok(codes.includes('DUPLICATE_NODE'));
  assert.ok(codes.includes('CYCLE'));
  assert.ok(codes.includes('ORPHAN_NODE'));
});
