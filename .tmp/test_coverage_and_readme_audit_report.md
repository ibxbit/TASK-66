# Test Coverage Audit

## Project Type Detection

- Declared type at README top: **fullstack** (`repo/README.md:3`)
- Detection result used for audit: **fullstack** (no inference override needed)

## Backend Endpoint Inventory

Resolved from route mounts in `repo/backend/src/app.js:71`, `repo/backend/src/app.js:96`, `repo/backend/src/app.js:142`-`repo/backend/src/app.js:153` and method declarations in route files.

1. `GET /api/v1/health`
2. `GET /api/v1/docs/openapi.yaml`
3. `GET /api/v1/docs`
4. `POST /api/v1/auth/login`
5. `POST /api/v1/auth/logout`
6. `GET /api/v1/auth/me`
7. `POST /api/v1/auth/step-up`
8. `GET /api/v1/users`
9. `POST /api/v1/users`
10. `PATCH /api/v1/users/:userId`
11. `GET /api/v1/catalog/search`
12. `GET /api/v1/catalog/autocomplete`
13. `GET /api/v1/catalog/hot-keywords`
14. `POST /api/v1/catalog/hot-keywords`
15. `PATCH /api/v1/catalog/hot-keywords/:keywordId`
16. `DELETE /api/v1/catalog/hot-keywords/:keywordId`
17. `POST /api/v1/catalog/items`
18. `PATCH /api/v1/catalog/items/:itemId`
19. `DELETE /api/v1/catalog/items/:itemId`
20. `GET /api/v1/graph/versions`
21. `POST /api/v1/graph/drafts`
22. `GET /api/v1/graph/drafts/:draftId`
23. `POST /api/v1/graph/drafts/:draftId/nodes`
24. `PATCH /api/v1/graph/drafts/:draftId/nodes/:nodeId`
25. `DELETE /api/v1/graph/drafts/:draftId/nodes/:nodeId`
26. `POST /api/v1/graph/drafts/:draftId/edges`
27. `PATCH /api/v1/graph/drafts/:draftId/edges/:edgeId`
28. `DELETE /api/v1/graph/drafts/:draftId/edges/:edgeId`
29. `POST /api/v1/graph/drafts/:draftId/validate`
30. `POST /api/v1/graph/drafts/:draftId/publish`
31. `POST /api/v1/venues`
32. `POST /api/v1/venues/:venueId/halls`
33. `POST /api/v1/halls/:hallId/zones`
34. `POST /api/v1/zones/:zoneId/display-cases`
35. `GET /api/v1/routes`
36. `GET /api/v1/routes/:routeId`
37. `GET /api/v1/routes/:routeId/itineraries`
38. `POST /api/v1/routes`
39. `POST /api/v1/routes/:routeId/segments`
40. `PATCH /api/v1/routes/:routeId`
41. `POST /api/v1/routes/:routeId/itineraries`
42. `POST /api/v1/programs`
43. `POST /api/v1/coaches`
44. `POST /api/v1/coaches/:coachId/availability`
45. `POST /api/v1/program-sessions`
46. `POST /api/v1/program-sessions/:sessionId/registrations`
47. `POST /api/v1/program-sessions/:sessionId/registrations/:registrationId/cancel`
48. `POST /api/v1/program-sessions/:sessionId/registrations/:registrationId/no-show`
49. `POST /api/v1/program-sessions/:sessionId/waitlist/:entryId/confirm`
50. `GET /api/v1/participants/:participantId/credits`
51. `POST /api/v1/participants/:participantId/credits/adjustments`
52. `GET /api/v1/inbox/messages`
53. `POST /api/v1/inbox/messages/:messageId/read`
54. `POST /api/v1/inbox/messages/:messageId/print`
55. `GET /api/v1/jobs`
56. `POST /api/v1/jobs`
57. `PATCH /api/v1/jobs/:jobId`
58. `POST /api/v1/jobs/:jobId/submit`
59. `POST /api/v1/jobs/:jobId/approve`
60. `POST /api/v1/jobs/:jobId/reject`
61. `POST /api/v1/jobs/:jobId/takedown`
62. `POST /api/v1/jobs/:jobId/appeals`
63. `POST /api/v1/jobs/:jobId/appeals/:appealId/decide`
64. `GET /api/v1/jobs/:jobId/history`
65. `POST /api/v1/analytics/metrics`
66. `POST /api/v1/analytics/dimensions`
67. `POST /api/v1/analytics/anomaly-rules`
68. `POST /api/v1/analytics/dashboards`
69. `GET /api/v1/analytics/dashboards/:dashboardId`
70. `POST /api/v1/analytics/reports`
71. `POST /api/v1/analytics/reports/:reportId/run`
72. `GET /api/v1/analytics/reports/:reportId/runs`
73. `POST /api/v1/exports`
74. `GET /api/v1/exports/:exportJobId`
75. `GET /api/v1/admin/config`
76. `PATCH /api/v1/admin/config`
77. `POST /api/v1/admin/cache/invalidate`
78. `GET /api/v1/admin/reconciliation/artifacts`
79. `GET /api/v1/audit/events`

## API Test Mapping Table

All backend endpoints are covered by HTTP tests that call `fetch(${API_BASE}${path})` against a running backend (`repo/API_tests/api.integration.test.js:15`, `repo/API_tests/uncovered-endpoints.test.js:19`, `repo/API_tests/fe-be-integration.test.js:29`).

| Endpoint                                                                         | Covered | Test Type         | Test files                                                                            | Evidence                                                                                   |
| -------------------------------------------------------------------------------- | ------- | ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/v1/health`                                                             | yes     | true no-mock HTTP | `runtime-readiness.test.js`                                                           | `health endpoint stays reachable...` (`repo/API_tests/runtime-readiness.test.js:76`)       |
| `GET /api/v1/docs/openapi.yaml`                                                  | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | `GET /api/v1/docs/openapi.yaml...` (`repo/API_tests/uncovered-endpoints.test.js:91`)       |
| `GET /api/v1/docs`                                                               | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | `GET /api/v1/docs returns Swagger UI...` (`repo/API_tests/uncovered-endpoints.test.js:99`) |
| `POST /api/v1/auth/login`                                                        | yes     | true no-mock HTTP | `api.integration.test.js`, `fe-be-integration.test.js`                                | login request helper use (`repo/API_tests/api.integration.test.js:45`)                     |
| `POST /api/v1/auth/logout`                                                       | yes     | true no-mock HTTP | `api.integration.test.js`, `fe-be-integration.test.js`                                | logout checks (`repo/API_tests/api.integration.test.js:149`)                               |
| `GET /api/v1/auth/me`                                                            | yes     | true no-mock HTTP | `api.integration.test.js`, `fe-be-integration.test.js`                                | me checks (`repo/API_tests/fe-be-integration.test.js:67`)                                  |
| `POST /api/v1/auth/step-up`                                                      | yes     | true no-mock HTTP | `api.integration.test.js`, `fe-be-integration.test.js`                                | acquire step-up helper (`repo/API_tests/api.integration.test.js:59`)                       |
| `GET /api/v1/users`                                                              | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | users GET test (`repo/API_tests/uncovered-endpoints.test.js:114`)                          |
| `POST /api/v1/users`                                                             | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | admin create helper (`repo/API_tests/api.integration.test.js:71`)                          |
| `PATCH /api/v1/users/:userId`                                                    | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | users PATCH flow (`repo/API_tests/uncovered-endpoints.test.js:149`)                        |
| `GET /api/v1/catalog/search`                                                     | yes     | true no-mock HTTP | `api.integration.test.js`, `runtime-readiness.test.js`, `fe-be-integration.test.js`   | search checks (`repo/API_tests/api.integration.test.js:748`)                               |
| `GET /api/v1/catalog/autocomplete`                                               | yes     | true no-mock HTTP | `api.integration.test.js`, `fe-be-integration.test.js`                                | autocomplete assertions (`repo/API_tests/api.integration.test.js:847`)                     |
| `GET /api/v1/catalog/hot-keywords`                                               | yes     | true no-mock HTTP | `api.integration.test.js`, `fe-be-integration.test.js`                                | hot keyword read (`repo/API_tests/api.integration.test.js:892`)                            |
| `POST /api/v1/catalog/hot-keywords`                                              | yes     | true no-mock HTTP | `api.integration.test.js`, `fe-be-integration.test.js`                                | hot keyword create (`repo/API_tests/api.integration.test.js:854`)                          |
| `PATCH /api/v1/catalog/hot-keywords/:keywordId`                                  | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | hot keyword patch (`repo/API_tests/api.integration.test.js:883`)                           |
| `DELETE /api/v1/catalog/hot-keywords/:keywordId`                                 | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | hot keyword delete (`repo/API_tests/api.integration.test.js:910`)                          |
| `POST /api/v1/catalog/items`                                                     | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`, `fe-be-integration.test.js` | catalog create (`repo/API_tests/api.integration.test.js:754`)                              |
| `PATCH /api/v1/catalog/items/:itemId`                                            | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | patch item (`repo/API_tests/uncovered-endpoints.test.js:242`)                              |
| `DELETE /api/v1/catalog/items/:itemId`                                           | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | delete item (`repo/API_tests/uncovered-endpoints.test.js:276`)                             |
| `GET /api/v1/graph/versions`                                                     | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | versions listing (`repo/API_tests/uncovered-endpoints.test.js:383`)                        |
| `POST /api/v1/graph/drafts`                                                      | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`, `fe-be-integration.test.js` | draft create (`repo/API_tests/api.integration.test.js:132`)                                |
| `GET /api/v1/graph/drafts/:draftId`                                              | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | draft read (`repo/API_tests/api.integration.test.js:555`)                                  |
| `POST /api/v1/graph/drafts/:draftId/nodes`                                       | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | nodes create (`repo/API_tests/api.integration.test.js:393`)                                |
| `PATCH /api/v1/graph/drafts/:draftId/nodes/:nodeId`                              | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | node patch (`repo/API_tests/uncovered-endpoints.test.js:416`)                              |
| `DELETE /api/v1/graph/drafts/:draftId/nodes/:nodeId`                             | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | node delete (`repo/API_tests/api.integration.test.js:563`)                                 |
| `POST /api/v1/graph/drafts/:draftId/edges`                                       | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | edge create (`repo/API_tests/api.integration.test.js:418`)                                 |
| `PATCH /api/v1/graph/drafts/:draftId/edges/:edgeId`                              | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | edge patch (`repo/API_tests/uncovered-endpoints.test.js:499`)                              |
| `DELETE /api/v1/graph/drafts/:draftId/edges/:edgeId`                             | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | edge delete (`repo/API_tests/uncovered-endpoints.test.js:548`)                             |
| `POST /api/v1/graph/drafts/:draftId/validate`                                    | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | validate call (`repo/API_tests/api.integration.test.js:447`)                               |
| `POST /api/v1/graph/drafts/:draftId/publish`                                     | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`, `fe-be-integration.test.js` | publish call (`repo/API_tests/api.integration.test.js:463`)                                |
| `POST /api/v1/venues`                                                            | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | venue create (`repo/API_tests/api.integration.test.js:323`)                                |
| `POST /api/v1/venues/:venueId/halls`                                             | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | halls create (`repo/API_tests/api.integration.test.js:955`)                                |
| `POST /api/v1/halls/:hallId/zones`                                               | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | zones create (`repo/API_tests/api.integration.test.js:962`)                                |
| `POST /api/v1/zones/:zoneId/display-cases`                                       | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | cases create (`repo/API_tests/api.integration.test.js:969`)                                |
| `GET /api/v1/routes`                                                             | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | route list test (`repo/API_tests/api.integration.test.js:919`)                             |
| `GET /api/v1/routes/:routeId`                                                    | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | route read (`repo/API_tests/api.integration.test.js:1148`)                                 |
| `GET /api/v1/routes/:routeId/itineraries`                                        | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | itineraries GET (`repo/API_tests/api.integration.test.js:1154`)                            |
| `POST /api/v1/routes`                                                            | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | route create (`repo/API_tests/api.integration.test.js:332`)                                |
| `POST /api/v1/routes/:routeId/segments`                                          | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | segment create (`repo/API_tests/api.integration.test.js:1006`)                             |
| `PATCH /api/v1/routes/:routeId`                                                  | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | route rule change (`repo/API_tests/api.integration.test.js:348`)                           |
| `POST /api/v1/routes/:routeId/itineraries`                                       | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | itinerary generate (`repo/API_tests/api.integration.test.js:1049`)                         |
| `POST /api/v1/programs`                                                          | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | program create (`repo/API_tests/api.integration.test.js:1382`)                             |
| `POST /api/v1/coaches`                                                           | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | coach create (`repo/API_tests/api.integration.test.js:1391`)                               |
| `POST /api/v1/coaches/:coachId/availability`                                     | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | availability create (`repo/API_tests/api.integration.test.js:1403`)                        |
| `POST /api/v1/program-sessions`                                                  | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | session create (`repo/API_tests/api.integration.test.js:1416`)                             |
| `POST /api/v1/program-sessions/:sessionId/registrations`                         | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | registration create (`repo/API_tests/api.integration.test.js:1434`)                        |
| `POST /api/v1/program-sessions/:sessionId/registrations/:registrationId/cancel`  | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | cancel flow (`repo/API_tests/api.integration.test.js:1452`)                                |
| `POST /api/v1/program-sessions/:sessionId/registrations/:registrationId/no-show` | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | no-show flow (`repo/API_tests/api.integration.test.js:1488`)                               |
| `POST /api/v1/program-sessions/:sessionId/waitlist/:entryId/confirm`             | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | confirm flow (`repo/API_tests/api.integration.test.js:1463`)                               |
| `GET /api/v1/participants/:participantId/credits`                                | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | credits read (`repo/API_tests/api.integration.test.js:1471`)                               |
| `POST /api/v1/participants/:participantId/credits/adjustments`                   | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | adjustments test (`repo/API_tests/uncovered-endpoints.test.js:568`)                        |
| `GET /api/v1/inbox/messages`                                                     | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | inbox read (`repo/API_tests/api.integration.test.js:722`)                                  |
| `POST /api/v1/inbox/messages/:messageId/read`                                    | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | read action (`repo/API_tests/api.integration.test.js:731`)                                 |
| `POST /api/v1/inbox/messages/:messageId/print`                                   | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | print action (`repo/API_tests/api.integration.test.js:739`)                                |
| `GET /api/v1/jobs`                                                               | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | jobs list test (`repo/API_tests/uncovered-endpoints.test.js:651`)                          |
| `POST /api/v1/jobs`                                                              | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | jobs create (`repo/API_tests/api.integration.test.js:255`)                                 |
| `PATCH /api/v1/jobs/:jobId`                                                      | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | cross-owner patch denial (`repo/API_tests/api.integration.test.js:270`)                    |
| `POST /api/v1/jobs/:jobId/submit`                                                | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | submit (`repo/API_tests/api.integration.test.js:287`)                                      |
| `POST /api/v1/jobs/:jobId/approve`                                               | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | approve (`repo/API_tests/uncovered-endpoints.test.js:729`)                                 |
| `POST /api/v1/jobs/:jobId/reject`                                                | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | reject (`repo/API_tests/uncovered-endpoints.test.js:700`)                                  |
| `POST /api/v1/jobs/:jobId/takedown`                                              | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | takedown (`repo/API_tests/uncovered-endpoints.test.js:742`)                                |
| `POST /api/v1/jobs/:jobId/appeals`                                               | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | appeal (`repo/API_tests/api.integration.test.js:295`)                                      |
| `POST /api/v1/jobs/:jobId/appeals/:appealId/decide`                              | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | decide (`repo/API_tests/uncovered-endpoints.test.js:789`)                                  |
| `GET /api/v1/jobs/:jobId/history`                                                | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | history (`repo/API_tests/api.integration.test.js:311`)                                     |
| `POST /api/v1/analytics/metrics`                                                 | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | metrics create (`repo/API_tests/api.integration.test.js:1796`)                             |
| `POST /api/v1/analytics/dimensions`                                              | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | dimensions create (`repo/API_tests/api.integration.test.js:2111`)                          |
| `POST /api/v1/analytics/anomaly-rules`                                           | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | anomaly rule create (`repo/API_tests/api.integration.test.js:1809`)                        |
| `POST /api/v1/analytics/dashboards`                                              | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | dashboard create (`repo/API_tests/api.integration.test.js:1823`)                           |
| `GET /api/v1/analytics/dashboards/:dashboardId`                                  | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | dashboard read (`repo/API_tests/api.integration.test.js:1867`)                             |
| `POST /api/v1/analytics/reports`                                                 | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | report create (`repo/API_tests/api.integration.test.js:2147`)                              |
| `POST /api/v1/analytics/reports/:reportId/run`                                   | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | run report (`repo/API_tests/api.integration.test.js:2168`)                                 |
| `GET /api/v1/analytics/reports/:reportId/runs`                                   | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | runs list (`repo/API_tests/api.integration.test.js:2179`)                                  |
| `POST /api/v1/exports`                                                           | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | export create (`repo/API_tests/api.integration.test.js:1948`)                              |
| `GET /api/v1/exports/:exportJobId`                                               | yes     | true no-mock HTTP | `api.integration.test.js`                                                             | export read (`repo/API_tests/api.integration.test.js:1989`)                                |
| `GET /api/v1/admin/config`                                                       | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | config GET (`repo/API_tests/uncovered-endpoints.test.js:836`)                              |
| `PATCH /api/v1/admin/config`                                                     | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | config PATCH (`repo/API_tests/uncovered-endpoints.test.js:853`)                            |
| `POST /api/v1/admin/cache/invalidate`                                            | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | invalidate (`repo/API_tests/uncovered-endpoints.test.js:924`)                              |
| `GET /api/v1/admin/reconciliation/artifacts`                                     | yes     | true no-mock HTTP | `uncovered-endpoints.test.js`                                                         | artifacts read (`repo/API_tests/uncovered-endpoints.test.js:986`)                          |
| `GET /api/v1/audit/events`                                                       | yes     | true no-mock HTTP | `api.integration.test.js`, `uncovered-endpoints.test.js`                              | audit list (`repo/API_tests/api.integration.test.js:1919`)                                 |

## API Test Classification

1. **True No-Mock HTTP**
   - `repo/API_tests/api.integration.test.js`
   - `repo/API_tests/uncovered-endpoints.test.js`
   - `repo/API_tests/fe-be-integration.test.js`
   - `repo/API_tests/runtime-readiness.test.js`
   - Evidence: direct `fetch` against `API_BASE` and no `jest.mock`/`vi.mock` in these files (`repo/API_tests/api.integration.test.js:21`, `repo/API_tests/uncovered-endpoints.test.js:26`, `repo/API_tests/fe-be-integration.test.js:35`, `repo/API_tests/runtime-readiness.test.js:38`)

2. **HTTP with Mocking**
   - Frontend test suites (not backend API coverage):
     - `repo/frontend/tests/integration/operations-console.integration.test.jsx` (`global.fetch = fetchMock`, `vi.fn`)
     - `repo/frontend/tests/integration/program-staffing.integration.test.jsx` (`vi.fn`, `mockResolvedValueOnce`)
     - `repo/frontend/tests/component/search-discovery.test.jsx` (`vi.fn`, mocked `apiRequest`)
     - Playwright mocked route tests: `repo/frontend/tests/e2e/major-domains.spec.js`, `repo/frontend/tests/e2e/auth-user-switch.spec.js` (`page.route(...)`)

3. **Non-HTTP (unit/integration without HTTP)**
   - Backend unit tests in `repo/unit_tests/*.test.js`
   - Frontend unit tests in `repo/frontend/tests/unit/*.test.js`

## Mock Detection

- `vi.fn`/stubbed transport in frontend component/integration tests:
  - `repo/frontend/tests/integration/operations-console.integration.test.jsx:18`
  - `repo/frontend/tests/integration/export-audit-failure.integration.test.jsx:19`
  - `repo/frontend/tests/integration/program-staffing.integration.test.jsx:11`
  - `repo/frontend/tests/component/search-discovery.test.jsx:17`
- Browser transport mocking via Playwright:
  - `repo/frontend/tests/e2e/major-domains.spec.js:14`
  - `repo/frontend/tests/e2e/auth-user-switch.spec.js:6`
- Backend unit stubbing via `require.cache` module overrides:
  - `repo/unit_tests/weak-modules.test.js:105`
  - `repo/unit_tests/weak-modules.test.js:179`

## Coverage Summary

- Total backend endpoints: **79**
- Endpoints with HTTP tests: **79**
- Endpoints with TRUE no-mock HTTP tests: **79**
- HTTP coverage: **100.00%**
- True API coverage: **100.00%**

## Unit Test Summary

### Backend Unit Tests

- Test files observed: `repo/unit_tests/password-policy.test.js`, `repo/unit_tests/masking-policy.test.js`, `repo/unit_tests/graph-validation.test.js`, `repo/unit_tests/csrf-middleware.test.js`, `repo/unit_tests/session-expiry-boundary.test.js`, `repo/unit_tests/step-up-middleware-expiry.test.js`, `repo/unit_tests/weak-modules.test.js`, `repo/unit_tests/reporting.test.js`, `repo/unit_tests/reconciliation.test.js`, `repo/unit_tests/logger-safety.test.js`, `repo/unit_tests/config-production-secret.test.js`, `repo/unit_tests/analytics.test.js`, plus FE-focused unit tests placed under `unit_tests/` (`frontend-search-query.test.js`, `frontend-offline-api.test.js`)
- Modules covered (backend):
  - Controllers/routes indirectly via API tests (not unit-level route tests)
  - Services: analytics, credits, events, exports (field policy), inbox, reconciliation, reports, graph-validation, waitlist logic
  - Middleware/auth/guards: auth, csrf, step-up, rbac, db-ready
  - Repositories/models: mostly indirect; no dedicated repository-layer unit suite
- Important backend modules not unit-tested directly:
  - `repo/backend/src/routes/*.js` route handlers as isolated units
  - Most model schema hooks/index behavior (`repo/backend/src/models/*`) outside integration path
  - `repo/backend/src/services/exports.js` artifact writing path end-to-end as pure unit (masking helper is covered)

### Frontend Unit Tests (STRICT REQUIREMENT)

- Frontend test files (present):
  - Unit: `repo/frontend/tests/unit/query-and-validation.test.js`, `repo/frontend/tests/unit/guard-utils.test.js`, `repo/frontend/tests/unit/frontend-security.test.js`
  - Component: `repo/frontend/tests/component/restricted-guard.test.jsx`, `repo/frontend/tests/component/search-discovery.test.jsx`, `repo/frontend/tests/component/guided-navigation.test.jsx`, `repo/frontend/tests/component/curator-publish-blocking.test.jsx`, `repo/frontend/tests/component/offline-queued-write.test.jsx`
  - Integration: `repo/frontend/tests/integration/route-builder.integration.test.jsx`, `repo/frontend/tests/integration/program-staffing.integration.test.jsx`, `repo/frontend/tests/integration/export-audit-failure.integration.test.jsx`, `repo/frontend/tests/integration/operations-console.integration.test.jsx`
- Frameworks/tools detected:
  - Vitest config + jsdom: `repo/frontend/vitest.config.js:1`
  - React Testing Library: `repo/frontend/tests/component/restricted-guard.test.jsx:1`
  - Node test runner for FE libs: `repo/frontend/tests/unit/query-and-validation.test.js:1`
- Components/modules covered:
  - Components: `FeatureGuard`, `SearchDiscoveryTab`, `GuidedNavigationTab`, `ProgramsTab`, `StaffingTab`, app-level `App`
  - FE libs/validators: `src/lib/api.js`, `src/lib/offline.js`, `src/lib/tabs.js`, `src/lib/search-query.js`, `src/validators/forms.js`
- Important frontend components/modules not explicitly unit/component tested:
  - `repo/frontend/src/components/AuthPanel.jsx`
  - `repo/frontend/src/components/GraphSnapshot.jsx`
  - `repo/frontend/src/components/ValidationIssuesPanel.jsx`
  - `repo/frontend/src/components/ForbiddenState.jsx`
- **Frontend unit tests: PRESENT**

### Cross-Layer Observation

- Backend and frontend both have substantial test assets.
- Balance is not equal in realism: backend API tests are real HTTP no-mock; many frontend integration/E2E tests rely on mocked transport.
- Real FE↔BE coverage exists (`repo/API_tests/fe-be-integration.test.js`, `repo/frontend/tests/e2e-real/real-fe-be.spec.js`) but is not fully represented in `run_tests.sh` execution path.

## API Observability Check

- Strong endpoint observability in API suites:
  - Method/path explicit in every request object (`path`, `method`) in API tests.
  - Inputs asserted (body/query/cookies/csrf/step-up) in many tests, e.g., `repo/API_tests/uncovered-endpoints.test.js:575`-`repo/API_tests/uncovered-endpoints.test.js:605`.
  - Response content assertions include status + payload fields, e.g., `repo/API_tests/api.integration.test.js:447`-`repo/API_tests/api.integration.test.js:474`, `repo/API_tests/fe-be-integration.test.js:61`-`repo/API_tests/fe-be-integration.test.js:71`.
- Weak spots (not global failure): some setup calls assert status only and not deep response contract (e.g., some route-segment setup calls in `repo/API_tests/api.integration.test.js:1006`-`repo/API_tests/api.integration.test.js:1047`).

## Test Quality & Sufficiency

- Success paths: broadly covered across auth, catalog, graph, routes, programs, jobs, analytics, exports, admin, audit.
- Failure/edge cases: strong for auth lockout, step-up misuse/replay, CSRF, invalid payloads, missing resources, forbidden access, workflow conflict states, policy boundaries.
- Integration boundaries: true HTTP exercised against running backend and real DB URI expectations; degraded DB readiness is explicitly tested (`repo/API_tests/runtime-readiness.test.js:94`).
- Over-mocking risk: low in backend API tests; moderate-high in frontend integration/e2e mock suites.
- `run_tests.sh` check: **FLAG (local dependency path present)**
  - Script performs `npm install` and local backend startup (`repo/run_tests.sh:35`, `repo/run_tests.sh:59`) and expects reachable Mongo URI (`repo/run_tests.sh:14`, `repo/run_tests.sh:51`).
  - Docker execution is possible (`docker-compose exec backend ...`) but script is not Docker-enforced by itself.

## End-to-End Expectations (Fullstack)

- Expected: real FE↔BE tests.
- Present evidence:
  - Contract-level FE↔BE API suite: `repo/API_tests/fe-be-integration.test.js`
  - Real browser FE↔BE suite (no `page.route`): `repo/frontend/tests/e2e-real/real-fe-be.spec.js`
- Gap: default orchestrator `repo/run_tests.sh` does not execute frontend Playwright real E2E.

## Tests Check

- Static inspection only performed; no runtime execution performed in this audit.
- Test organization clarity is high; endpoint-to-test traceability is explicit in API suites.

## Test Coverage Score (0–100)

**91/100**

## Score Rationale

- +40: endpoint HTTP coverage appears complete across declared backend endpoints.
- +25: true no-mock API style is consistently applied in backend API suites.
- +15: failure/edge/security paths are extensive and concrete.
- +6: frontend unit/component/integration test presence is strong.
- -4: frontend realism mixed; many frontend integration/e2e tests mock transport.
- -5: `run_tests.sh` has local dependency behavior and does not fully orchestrate real FE browser E2E path.

## Key Gaps

1. `run_tests.sh` includes local install/startup assumptions; not strict Docker-only orchestration (`repo/run_tests.sh:35`, `repo/run_tests.sh:59`).
2. Real browser FE↔BE tests exist but are not in default test runner path (`repo/frontend/tests/e2e-real/real-fe-be.spec.js:1`).
3. Some frontend critical UI modules lack direct unit/component tests (Auth/graph visualization/support components).

## Confidence & Assumptions

- Confidence: **high** for static route inventory and test-file classification.
- Assumption A1: Express default non-strict routing treats `/api/v1/docs` and `/api/v1/docs/` equivalently.
- Assumption A2: Endpoint coverage here is based on visible test code issuing matching requests; runtime pass/fail was not executed.

**Test Coverage Verdict: PASS WITH GAPS**

---

# README Audit

README audited at `repo/README.md`.

## Hard Gate Check

- README location gate (`repo/README.md`): **PASS**
- Formatting/structure readability: **PASS**
- Startup instructions (fullstack requires Docker Compose startup command): **PASS** (`repo/README.md:22`)
- Access method (URL + ports): **PASS** (`repo/README.md:42`)
- Verification method (API + explicit web UI flow): **PASS** (`repo/README.md:50`, `repo/README.md:63`)
- Environment rules (no host runtime installs/manual DB setup): **PASS** at doc level (`repo/README.md:15`-`repo/README.md:27`)
- Demo credentials with auth + all roles: **PASS** (`repo/README.md:104`)

## High Priority Issues

- None.

## Medium Priority Issues

- None.

## Low Priority Issues

1. Minor wording inconsistency remains in title case/style across sections; no compliance impact.

## Engineering Quality

- Tech stack clarity: strong (`repo/README.md:174`-`repo/README.md:186`).
- Architecture explanation: strong with backend/frontend/data separation.
- Testing instructions: strong; includes containerized test command and separate web verification flow.
- Security/roles explanation: strong (RBAC roles + step-up + CSRF noted).
- Workflow clarity/presentation: strong and structured.

## Hard Gate Failures

- **None detected**.

## README Verdict (PASS / PARTIAL PASS / FAIL)

**PASS**

Rationale: hard gates pass; explicit startup, access, API verification, web UI verification, environment constraints, and role credentials are present and consistent.

**README Verdict: PASS**
