# Philatelic Museum Operations Suite

**Project Type: fullstack** (React frontend + Express backend + MongoDB; delivered as a single Docker Compose stack)

Unified offline-ready operations console for a philatelic museum: collection
discovery, knowledge graph curation, exhibit route orchestration, program &
staffing workflows, analytics/reporting with scheduled reconciliation,
permissioned exports with masking, RBAC + step-up auth, immutable 7-year audit
trail.

---

## 1. One-Click Docker Startup (Canonical / Strict Acceptance Path)

> **No host installs required.** No manual `.env` creation, no manual Mongo
> setup, no manual user creation. `docker compose up` produces a running,
> login-ready stack with deterministic demo credentials.

### Start

```bash
docker compose up --build -d
```

No host installs are required for acceptance. Do NOT run `npm install`,
`pip install`, or any package manager on the host — the container build
handles everything.

This brings up three services from the Compose file:

| Service   | Container name    | Exposed port        | Healthcheck          |
| --------- | ----------------- | ------------------- | -------------------- |
| MongoDB 7 | `museum_mongo`    | `27017`             | `mongosh ping`       |
| Backend   | `museum_backend`  | `8888` → 8080       | `GET /api/v1/health` |
| Frontend  | `museum_frontend` | `5173` → 80 (nginx) | `GET /`              |

On first successful DB connect, the backend auto-seeds deterministic demo users
(controlled by `ENABLE_DEV_SEED=true` env, enabled by default in the Compose file).

### Access URLs

| Surface              | URL                                              |
| -------------------- | ------------------------------------------------ |
| Web app (UI)         | `http://localhost:5173`                          |
| API root             | `http://localhost:8888/api/v1`                   |
| Health probe         | `http://localhost:8888/api/v1/health`            |
| OpenAPI / Swagger UI | `http://localhost:8888/api/v1/docs`              |
| Raw OpenAPI YAML     | `http://localhost:8888/api/v1/docs/openapi.yaml` |

### Verify (API checks)

```bash
# Health endpoint reports 'ok' when the DB is connected
curl -s http://localhost:8888/api/v1/health | jq -r '.data.status'
# => ok

# Login as admin with deterministic demo credentials (cookie-jar flow)
curl -s -c /tmp/cj.txt -H 'Content-Type: application/json' \
  -d '{"username":"admin.dev","password":"AdminSecure!2026"}' \
  http://localhost:8888/api/v1/auth/login | jq '.data.user'
```

### Verify (Web UI flow)

Operational verification checklist. Execute each step in order against the
running Docker stack. Every step assumes the browser points at the real backend
via nginx (`browser → :5173 → museum_backend:8080 → MongoDB`).

1. Open `http://localhost:5173`.
   - Expected: `Operations Console` header is visible.
   - Expected: `Auth` panel shows `username`, `password`, and `Sign In`.
   - Expected: tab bar is visible with `Search/Browse`, `Programs`, and other modules.
2. Sign in using `admin.dev` / `AdminSecure!2026`.
   - Expected: banner shows `Signed in as admin.dev`.
   - Expected: auth footer shows `User: admin.dev / roles: Administrator`.
3. Verify read flow in `Search/Browse`.
   - Action: enter `stamp` in `title`, click `Search`.
   - Expected: search button transitions `Search → Searching... → Search`.
   - Expected: results or explicit empty-state are shown from `GET /api/v1/catalog/search`.
4. Verify write flow in `Programs`.
   - Action: open `Programs`; create program with `type=DOCENT_TRAINING`,
     `title=README Verify Program`, `capacity=5`; click `Create Program`.
   - Expected: success message includes created `id` and echoed fields from `POST /api/v1/programs`.
5. Sign out.
   - Expected: footer returns to `User: none / roles: none`.
   - Expected: protected buttons/tabs become disabled again.

### Stop

```bash
docker compose down           # stop + remove containers
docker compose down -v        # also drop the mongo data volume
```

---

## 2. Demo Credentials (all 7 RBAC roles — deterministic & auto-seeded)

These users are created automatically on `docker compose up` and remain stable
across restarts. Passwords are derived from the username prefix and the year
`DEV_USER_PASSWORD_YEAR` (default `2026`), so they are deterministic and
documentable — no "check the seed output" step required.

| Username          | Password                 | Role                | What they can do                                                              |
| ----------------- | ------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| `admin.dev`       | `AdminSecure!2026`       | Administrator       | Full access across all modules                                                |
| `curator.dev`     | `CuratorSecure!2026`     | Curator             | Catalog curation, knowledge-graph drafts, step-up-gated publish               |
| `exhibit.dev`     | `ExhibitSecure!2026`     | Exhibit Manager     | Venue/hall/zone/case hierarchy, route segments, step-up route rules           |
| `coordinator.dev` | `CoordinatorSecure!2026` | Program Coordinator | Programs, coaches, availability, sessions, waitlists, credits                 |
| `employer.dev`    | `EmployerSecure!2026`    | Employer            | Job postings: draft → submit → appeal (scoped to own jobs)                    |
| `reviewer.dev`    | `ReviewerSecure!2026`    | Reviewer            | Approve/reject/takedown jobs; step-up on approve + appeal decide              |
| `auditor.dev`     | `AuditorSecure!2026`     | Auditor             | Read-only audit feed, analytics dashboards, reconciliation artifacts, exports |

> To rotate to a different year suffix, set `DEV_USER_PASSWORD_YEAR=2027` in
> `.env` before `docker compose up`. To use an explicit single password for
> every user, set `DEV_USER_PASSWORD_OVERRIDE=<value>`.

Login endpoint (same for all roles):

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "username": "admin.dev", "password": "AdminSecure!2026" }
```

Response includes `data.user.roles`, `data.csrfToken`, `data.session` (the
frontend captures these). Subsequent non-GET requests must include
`X-CSRF-Token: <csrfToken>` and (for sensitive actions) `X-Step-Up-Token:
<stepUpToken>` obtained via `POST /api/v1/auth/step-up`.

---

## 3. Test Verification (Docker-contained)

All tests run inside the backend container against the real MongoDB — **no
mocks on the backend execution path**.

```bash
docker compose exec backend bash /repo/run_tests.sh
```

Web UI verification method is defined in **Section 1 → Verify (Web UI flow)**.

Expected tail:

```
unit_tests : PASS
API_tests  : PASS
Overall    : PASS
```

### Test layout

| Path                                    | Purpose                                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit_tests/*.test.js`                  | Backend unit tests (rbac, db-ready, services, validators, middleware, etc.)                                                                    |
| `API_tests/api.integration.test.js`     | Existing real-HTTP integration suite (auth/graph/routes/programs/exports/…)                                                                    |
| `API_tests/uncovered-endpoints.test.js` | Added suite: users, catalog items, graph versions/PATCH/DELETE, credits adjust, jobs list + lifecycle, admin config/cache/reconciliation, docs |
| `API_tests/fe-be-integration.test.js`   | FE↔BE contract replay (no mocks): login → CSRF → GET cache → step-up → logout                                                                 |
| `API_tests/runtime-readiness.test.js`   | Health + 503 degraded-mode behavior                                                                                                            |

### Endpoint coverage

Endpoint coverage is verified by the API test suites listed in §7.
Use `run_tests.sh` output as the acceptance signal.

---

## 4. Core Architecture

- **Backend**: Node 20 + Express, layered (`routes/` → `services/` → `models/`),
  Mongoose over MongoDB 7. Session auth via express-session + connect-mongo with
  `sameSite=strict`, CSRF on all non-GET `/api/v1/*` writes, one-time action-
  bound step-up tokens for sensitive actions (graph publish, job approve/appeal
  decide, export create, admin config update, route rule change).
- **Frontend**: React + Vite, served as a static bundle by nginx. Tab-gated RBAC,
  offline write queue, service-worker app-shell caching, printable itinerary
  and notification payloads.
- **Data**: MongoDB with TTL indexes on `search_cache`, `inbox_messages`, and
  `audit_logs` (7-year retention). Reconciliation artifacts (reports + exports)
  are written atomically with `.sha256` sidecars.

---

## 5. Business Rule Compliance (prompt → code)

| Requirement                                                                          | Code                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Password ≥ 12 chars + complexity                                                     | `backend/src/lib/password.js` + `unit_tests/password-policy.test.js`           |
| 5-attempt lockout / 15 min                                                           | `backend/src/routes/auth.js` + `config.auth.lockoutMinutes`                    |
| 30-min idle session expiry                                                           | `config.session.idleTtlSeconds=1800`, covered by unit + API tests              |
| Step-up re-auth for sensitive ops (6 actions)                                        | `middleware/step-up.js` + `constants/step-up-actions.js`                       |
| Immutable 7-year audit trail                                                         | `models/audit-log.js` (pre-hooks + retention TTL index) + `services/events.js` |
| Fuzzy search + pagination (`pageSize` ≤ 51) + filters + sort                         | `routes/catalog.js`                                                            |
| MongoDB TTL search cache                                                             | `models/search-cache.js` (TTL on `expires_at`)                                 |
| Knowledge graph: weights 0–100, dup/cycle/orphan/constraint validation               | `services/graph-validation.js` + graph route + unit test                       |
| Route hierarchy + itinerary at 3 mph + dwell times + branches + accessibility detour | `routes/venues.js`                                                             |
| 12-hour late-cancel (−1 credit), no-show (−2 credits)                                | `routes/programs.js`                                                           |
| Waitlist promote + 60-min expiry                                                     | `services/program-waitlist.js`                                                 |
| Job workflow: draft → submit → approve / reject / takedown → appeal → decide         | `routes/jobs.js`                                                               |
| Scheduled report runs at 02:00 local + checksum sidecar                              | `services/reports.js` + `services/reconciliation.js`                           |
| Anomaly rules (e.g. WoW drop > 30%) → dashboard + inbox                              | `services/analytics.js`                                                        |
| Exports CSV/JSON + masking (phone last-4, redacted notes)                            | `routes/exports.js` + `services/exports.js`                                    |
| Offline UX (write queue + service worker)                                            | `frontend/src/lib/offline.js` + `frontend/public/sw.js`                        |

---

## 6. Configuration (env vars — all optional in Docker)

| Name                         | Default                     | Purpose                                     |
| ---------------------------- | --------------------------- | ------------------------------------------- |
| `SESSION_SECRET`             | built-in 32-char dev secret | Override for production                     |
| `SESSION_COOKIE_SECURE`      | `false`                     | Set `true` behind TLS                       |
| `ENABLE_DEV_SEED`            | `true`                      | Auto-seed demo users on first DB connect    |
| `DEV_USER_PASSWORD_YEAR`     | `2026`                      | Deterministic password-suffix year          |
| `DEV_USER_PASSWORD_OVERRIDE` | _(unset)_                   | Use a single password for every seeded user |
| `NODE_ENV`                   | `development`               | Set `production` for hardened behavior      |
| `REPORT_SCHEDULE_TIMEZONE`   | `America/New_York`          | Scheduled report tz                         |
| `REPORT_SCHEDULE_TIME`       | `02:00`                     | Scheduled report local time                 |

---

## 7. Endpoint Coverage Evidence

Coverage evidence is maintained in test code, not manually curated in README.

- Canonical route definitions: `backend/src/app.js`, `backend/src/routes/*.js`
- Canonical API coverage evidence: `API_tests/api.integration.test.js`,
  `API_tests/uncovered-endpoints.test.js`, `API_tests/fe-be-integration.test.js`,
  `API_tests/runtime-readiness.test.js`
- Acceptance verification command:

```bash
docker compose exec backend bash /repo/run_tests.sh
```

---

## 8. Production Hardening Notes

For a non-demo deployment:

1. Set `NODE_ENV=production`, `ENABLE_DEV_SEED=false`, `SESSION_COOKIE_SECURE=true`.
2. Provide a strong `SESSION_SECRET` (≥32 chars, not the shipped dev default).
3. Provision MongoDB behind TLS with unique credentials.
4. Create real users via `POST /api/v1/users` as Administrator.
5. Configure `FRONTEND_ORIGIN` to the real frontend URL(s).

---

## 9. Troubleshooting

- **Login returns `INVALID_CREDENTIALS`**: seed hasn't run yet — either wait a few
  seconds after `docker compose up -d` (auto-seed happens on first DB connect)
  or run `docker compose exec backend npm run seed:dev`.
- **`pageSize must be <= 51`**: the validation cap is **51**. Send
  `pageSize` in the inclusive range `1..51`; any value `>= 52` returns
  `VALIDATION_ERROR`.
- **`STEP_UP_REQUIRED`**: sensitive actions require `POST /api/v1/auth/step-up`
  and then the returned token in `X-Step-Up-Token`.
- **`CSRF_TOKEN_INVALID`**: include `X-CSRF-Token` on non-GET writes (value from
  the login response).
