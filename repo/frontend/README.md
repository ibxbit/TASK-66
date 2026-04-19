# Philatelic Museum Operations Suite — Frontend

Self-contained React frontend for the Philatelic Museum Operations Suite. This package can be built, previewed, and fully tested without any backend service, database, or Docker.

## Quick Start

All dependency installation must happen inside Docker containers — do not run `npm install` on the host.

Build and serve the frontend via Docker Compose (canonical path):

```bash
docker-compose build frontend
docker-compose up -d frontend
```

For one-off container-based builds or dev server runs, use a temporary node container:

```bash
# Production bundle
docker run --rm -v "$(pwd):/app" -w /app node:20-alpine sh -c "npm ci && npm run build"

# Dev server with HMR at http://localhost:5173
docker run --rm -p 5173:5173 -v "$(pwd):/app" -w /app node:20-alpine sh -c "npm ci && npm run dev -- --host"
```

No backend or database is required for build or test workflows.

## Running Tests

All tests use mocked API responses and run entirely in-process. Run them inside a container — no host Node.js installation required.

```bash
# All frontend suites (unit + component + integration)
docker run --rm -v "$(pwd):/app" -w /app node:20-alpine sh -c "npm ci && npm run test:frontend"

# Individual suites
docker run --rm -v "$(pwd):/app" -w /app node:20-alpine sh -c "npm ci && npm run test:unit"
docker run --rm -v "$(pwd):/app" -w /app node:20-alpine sh -c "npm ci && npm run test:component"
docker run --rm -v "$(pwd):/app" -w /app node:20-alpine sh -c "npm ci && npm run test:integration"

# E2E (Playwright — requires chromium install step inside the container)
docker run --rm -v "$(pwd):/app" -w /app mcr.microsoft.com/playwright:v1.44.0-jammy sh -c "npm ci && npm run test:e2e"
```

## Architecture

```
src/
  main.jsx              App entry, service worker registration
  App.jsx               Auth orchestration, tab routing, session management
  components/           Domain tab components (one per business area)
  lib/                  API client, offline queue, auth defaults, tab config
  hooks/                Shared React hooks (useFormState)
  validators/           Client-side form validation (programs, staffing, routes, graph)
  constants/            Shared constants (pagination limits, form defaults)
  styles.css            Global styles, layout system, status badges, responsive rules
public/
  sw.js                 Service worker: app-shell cache + API read cache + offline fallback
tests/
  unit/                 Pure logic tests (validators, security, RBAC matrix)
  component/            Component render + interaction tests (search, curator, guard, navigation)
  integration/          Multi-step workflow tests (analytics, exports, routes, programs, staffing)
  e2e/                  Playwright browser tests (auth switch, domain happy paths, role lifecycle)
```

## Mock and Data Scope

This frontend does **not** ship with a mock server or default API interception in application code. The runtime `src/lib/api.js` makes real `fetch()` calls to the configured backend URL.

- **Tests** use `vi.fn()` mocks (Vitest) or `page.route()` intercepts (Playwright) — no shared mock server.
- **Offline queueing** is real: failed non-GET requests are queued to localStorage (with sensitive field sanitization) and replayed when online.
- **Service worker** caches app shell assets and selected GET API responses for offline read fallback.

No mock data is silently enabled at runtime. If no backend is available, API calls fail gracefully with error states shown in the UI.

## Prompt Requirement → Component Mapping

| Prompt Requirement | Primary Component | Key File(s) |
|---|---|---|
| Collection search (fuzzy, filters, sort, pagination <=51) | SearchDiscoveryTab | `src/components/SearchDiscoveryTab.jsx`, `src/lib/search-query.js`, `src/constants/pagination.js` |
| Autocomplete + hot keyword curation | SearchDiscoveryTab | `src/components/SearchDiscoveryTab.jsx` (debounced type-ahead + curator CRUD) |
| Knowledge graph (nodes, edges, weights 0-100, validation, publish gate) | CuratorTab | `src/components/CuratorTab.jsx`, `src/components/ValidationIssuesPanel.jsx`, `src/validators/forms.js` |
| Venue/hall/zone/case hierarchy + visual route builder | RouteBuilderTab | `src/components/RouteBuilderTab.jsx` (SVG canvas, segment types, itinerary generation) |
| Guided navigation + printable itineraries | GuidedNavigationTab | `src/components/GuidedNavigationTab.jsx` (route discovery, read-only consumption) |
| Program scheduling (coaches, availability, capacity, waitlist) | ProgramsTab | `src/components/ProgramsTab.jsx` |
| Cancellation/no-show penalties (1 credit / 2 credits) | ProgramsTab | `src/components/ProgramsTab.jsx:203-258` |
| Staffing lifecycle (draft/submit/approve/reject/takedown/appeal) | StaffingTab | `src/components/StaffingTab.jsx` |
| Analytics (metrics, dimensions, dashboards, anomaly rules, reports) | AnalyticsTab | `src/components/AnalyticsTab.jsx` (dimension model, groupBy, report scheduling) |
| Exports with masking preview | ExportsTab | `src/components/ExportsTab.jsx` |
| In-app inbox + printable notifications | InboxTab / ProgramsTab | `src/components/InboxTab.jsx`, `src/components/ProgramsTab.jsx:297-327` |
| Audit event log | AuditTab | `src/components/AuditTab.jsx` |
| RBAC (7 roles, tab gating, step-up for sensitive actions) | App + FeatureGuard | `src/App.jsx`, `src/components/FeatureGuard.jsx`, `src/lib/tabs.js` |
| Offline-ready (service worker, write queue, sync) | API + SW | `src/lib/api.js`, `src/lib/offline.js`, `public/sw.js` |
| Client-side input validation | Validators | `src/validators/forms.js` (program, session, job, route, graph validators) |

## Frontend API Configuration

- `VITE_BACKEND_URL` controls the API target. When empty/unset, requests go to the current origin.
- Vite dev server proxy is only active when `VITE_BACKEND_URL` is set (env-gated in `vite.config.js`).
- In production builds (nginx), the reverse proxy in `nginx.conf` handles `/api/v1` routing.

## Key Design Decisions

- **No external dependencies beyond React/ReactDOM** — all UI is built with native HTML elements and custom CSS.
- **Offline writes are queued, not faked** — the UI explicitly shows "queued offline" messaging (never fake success).
- **Debug panels are dev-only** — JSON debug views are gated behind `import.meta.env.MODE !== 'production'`.
- **Credentials are never hardcoded** — dev login prefill requires explicit env vars; seed passwords are generated at runtime.
- **All tests are self-contained** — no test requires a running backend, database, or external service.
