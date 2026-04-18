import test from 'node:test';
import assert from 'node:assert/strict';

import { getTabRequirement, hasTabAccess, firstAllowedTab } from '../../src/lib/tabs.js';

test('tab access guard allows authorized role and blocks unauthorized role', () => {
  assert.equal(hasTabAccess(['Curator'], 'curator'), true);
  assert.equal(hasTabAccess(['Employer'], 'curator'), false);
});

test('search and navigation tabs require authenticated roles, not public access', () => {
  assert.equal(hasTabAccess([], 'search'), false);
  assert.equal(hasTabAccess([], 'navigation'), false);
  assert.equal(hasTabAccess(['Curator'], 'search'), true);
  assert.equal(hasTabAccess(['Reviewer'], 'navigation'), true);
});

test('tab requirement fallback returns generic restricted message', () => {
  const known = getTabRequirement('routes');
  assert.equal(typeof known.title, 'string');
  assert.equal(typeof known.description, 'string');

  const fallback = getTabRequirement('unknown-tab');
  assert.equal(fallback.title, 'Restricted Feature');
});

test('Employer is denied access to curator, routes, programs, analytics, exports, audit tabs', () => {
  assert.equal(hasTabAccess(['Employer'], 'curator'), false);
  assert.equal(hasTabAccess(['Employer'], 'routes'), false);
  assert.equal(hasTabAccess(['Employer'], 'programs'), false);
  assert.equal(hasTabAccess(['Employer'], 'analytics'), false);
  assert.equal(hasTabAccess(['Employer'], 'exports'), false);
  assert.equal(hasTabAccess(['Employer'], 'audit'), false);
});

test('Employer is allowed access to search, navigation, staffing, inbox', () => {
  assert.equal(hasTabAccess(['Employer'], 'search'), true);
  assert.equal(hasTabAccess(['Employer'], 'navigation'), true);
  assert.equal(hasTabAccess(['Employer'], 'staffing'), true);
  assert.equal(hasTabAccess(['Employer'], 'inbox'), true);
});

test('Auditor is allowed access to audit, exports, analytics, staffing', () => {
  assert.equal(hasTabAccess(['Auditor'], 'audit'), true);
  assert.equal(hasTabAccess(['Auditor'], 'exports'), true);
  assert.equal(hasTabAccess(['Auditor'], 'analytics'), true);
  assert.equal(hasTabAccess(['Auditor'], 'staffing'), true);
});

test('Auditor is denied access to curator, routes, programs', () => {
  assert.equal(hasTabAccess(['Auditor'], 'curator'), false);
  assert.equal(hasTabAccess(['Auditor'], 'routes'), false);
  assert.equal(hasTabAccess(['Auditor'], 'programs'), false);
});

test('Program Coordinator has access to programs and analytics but not staffing or exports', () => {
  assert.equal(hasTabAccess(['Program Coordinator'], 'programs'), true);
  assert.equal(hasTabAccess(['Program Coordinator'], 'analytics'), true);
  assert.equal(hasTabAccess(['Program Coordinator'], 'staffing'), false);
  assert.equal(hasTabAccess(['Program Coordinator'], 'exports'), false);
});

test('Exhibit Manager has access to routes but not curator or programs', () => {
  assert.equal(hasTabAccess(['Exhibit Manager'], 'routes'), true);
  assert.equal(hasTabAccess(['Exhibit Manager'], 'curator'), false);
  assert.equal(hasTabAccess(['Exhibit Manager'], 'programs'), false);
});

test('Administrator has access to all tabs', () => {
  const allTabs = ['search', 'navigation', 'curator', 'routes', 'programs', 'staffing', 'analytics', 'exports', 'inbox', 'audit'];
  for (const tab of allTabs) {
    assert.equal(hasTabAccess(['Administrator'], tab), true, `Admin should access ${tab}`);
  }
});

test('firstAllowedTab returns search for authenticated roles', () => {
  assert.equal(firstAllowedTab(['Curator']), 'search');
  assert.equal(firstAllowedTab(['Administrator']), 'search');
});

test('firstAllowedTab returns search as default for empty roles', () => {
  assert.equal(firstAllowedTab([]), 'search');
});
