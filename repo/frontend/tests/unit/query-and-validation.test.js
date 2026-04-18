import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogSearchQuery, combineCatalogKeywordText } from '../../src/lib/search-query.js';
import {
  clampPageSize,
  parsePositiveInt,
  tryParseJsonObject,
  validateEdgeForm,
  validateJobDraft,
  validateNodeForm,
  validateProgramDraft,
  validateRouteSegmentInput,
  validateSessionDraft
} from '../../src/validators/forms.js';

test('combined query joins title/catalog/artist/series/period fields', () => {
  const q = combineCatalogKeywordText({
    title: 'Blue Airmail',
    catalogNumber: 'CAT-120',
    artist: 'I. Kline',
    series: 'Sky Series',
    period: '1930'
  });
  assert.equal(q, 'Blue Airmail CAT-120 I. Kline Sky Series 1930');
});

test('search query enforces pageSize <= 51 and page >= 1', () => {
  const query = buildCatalogSearchQuery({
    title: 'a',
    catalogNumber: '',
    artist: '',
    series: '',
    period: '',
    page: '-10',
    pageSize: '100'
  });

  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 51);
});

test('validator helpers reject invalid graph and route forms', () => {
  assert.equal(validateNodeForm({ type: '', label: 'x' }), 'Node type is required');
  assert.equal(validateEdgeForm({ fromNodeId: 'a', toNodeId: 'a', relationType: 'REL', weight: 20 }), 'Source and target nodes must be different');
  assert.equal(validateRouteSegmentInput({ fromCaseId: 'a', toCaseId: 'b', dwellMinutes: '-1', distanceMeters: '5' }), 'Dwell minutes must be a non-negative number');
});

test('JSON object parsing returns errors for invalid values', () => {
  const invalid = tryParseJsonObject('[]', 'Edge constraints');
  assert.equal(invalid.error, 'Edge constraints must be a JSON object');

  const valid = tryParseJsonObject('{"required":true}', 'Edge constraints');
  assert.equal(valid.error, null);
  assert.deepEqual(valid.value, { required: true });
});

test('numeric helper boundaries for pagination are stable', () => {
  assert.equal(clampPageSize('0', 50), 1);
  assert.equal(clampPageSize('55', 50), 50);
  assert.equal(parsePositiveInt('3.8', 1), 3);
  assert.equal(parsePositiveInt('oops', 7), 7);
});

test('validateProgramDraft rejects empty type, title, and invalid capacity', () => {
  assert.equal(validateProgramDraft({ type: '', title: 'X', capacity: '2' }), 'Program type is required');
  assert.equal(validateProgramDraft({ type: 'DOCENT', title: '', capacity: '2' }), 'Program title is required');
  assert.equal(validateProgramDraft({ type: 'DOCENT', title: 'X', capacity: '0' }), 'Capacity must be a positive integer');
  assert.equal(validateProgramDraft({ type: 'DOCENT', title: 'X', capacity: 'abc' }), 'Capacity must be a positive integer');
  assert.equal(validateProgramDraft({ type: 'DOCENT', title: 'X', capacity: '5' }), null);
});

test('validateSessionDraft rejects missing fields and bad time ordering', () => {
  assert.equal(validateSessionDraft({ venueId: '', startAtUtc: 'a', endAtUtc: 'b', capacity: '2' }), 'Venue is required');
  assert.equal(validateSessionDraft({ venueId: 'v', startAtUtc: '', endAtUtc: 'b', capacity: '2' }), 'Session start time is required');
  assert.equal(validateSessionDraft({ venueId: 'v', startAtUtc: '2026-07-01T15:00:00Z', endAtUtc: '2026-07-01T14:00:00Z', capacity: '2' }), 'Session end must be after session start');
  assert.equal(validateSessionDraft({ venueId: 'v', startAtUtc: '2026-07-01T14:00:00Z', endAtUtc: '2026-07-01T15:00:00Z', capacity: '-1' }), 'Capacity must be a positive integer');
  assert.equal(validateSessionDraft({ venueId: 'v', startAtUtc: '2026-07-01T14:00:00Z', endAtUtc: '2026-07-01T15:00:00Z', capacity: '2' }), null);
});

test('validateJobDraft rejects empty department, title, and description', () => {
  assert.equal(validateJobDraft({ department: '', title: 'X', description: 'Y' }), 'Department is required');
  assert.equal(validateJobDraft({ department: 'Events', title: '', description: 'Y' }), 'Job title is required');
  assert.equal(validateJobDraft({ department: 'Events', title: 'X', description: '' }), 'Job description is required');
  assert.equal(validateJobDraft({ department: 'Events', title: 'X', description: 'Y' }), null);
});
