# Philatelic Museum Operations Suite - System Design

## 1. Overview

This system is a single-tenant, offline-ready museum operations platform that unifies:
- collection discovery (catalog search + autocomplete + hot keywords),
- knowledge-graph curation and publishing,
- venue hierarchy and route/itinerary planning,
- program scheduling, registrations, credits, cancellations, and waitlists,
- staffing job workflows (draft, approval, takedown, appeal),
- analytics/reporting/reconciliation, exports, and in-app inbox notifications.

Architecture:
- Frontend: React SPA + service worker + IndexedDB/local cache for offline read support and queued writes.
- Backend: Express REST API enforcing business rules, RBAC, validation, step-up auth, and audit.
- Data: MongoDB for operational data, immutable audit logs, search cache TTL collections, and report metadata.
- Filesystem (local managed folder): report artifacts and export artifacts with checksums.

No explicit conflicts were found between `docs/prompt.txt` and `docs/questions.md`; design decisions follow the Q&A resolutions where requirements were ambiguous.

## 2. Actors and Roles

- Visitor/Floor Staff (UI personas): search, browse routes, view itineraries, receive inbox messages; no privileged mutation.
- Administrator: full system administration, user/role management, config, step-up protected actions.
- Curator: catalog curation, hot keyword curation, knowledge-graph draft edits and publish.
- Exhibit Manager: venue/hall/zone/display-case management, route rules and itinerary generation.
- Program Coordinator: coach and schedule management, registrations, cancellations, credits, waitlists, adjustments.
- Employer: create and manage staffing job drafts, submit for approval.
- Reviewer: approve/reject job postings and appeal decisions.
- Auditor: read-only governance access, audit/report/export access within policy; no state-changing approvals/publishes.

## 3. Bounded Contexts / Modules

1. Identity and Access
   - Username/password auth, session lifecycle, lockout policy, role assignment, step-up verification.

2. Catalog Discovery
   - Combined search across title/catalog number/artist/series/country/period/tags.
   - Fuzzy matching, filters, sorting, pagination (max 50), autocomplete, hot keywords.

3. Knowledge Graph Curation
   - Draft snapshots of nodes/edges with weighted relationships (0-100).
   - Validation for duplicates, circular references, orphan nodes.
   - Atomic publish of validated draft snapshot.

4. Venue and Route Planning
   - Venue-hall-zone-display case hierarchy.
   - Route segments, required sequence, optional branches, accessibility detours.
   - Printable itineraries with estimated walk times using 3 mph default pace + dwell times.

5. Programs and Credits
   - Program templates, sessions, coach profiles/availability, registration and attendance.
   - Waitlist FIFO promotion with confirmation expiry.
   - Credit ledger (grant/deduct/adjust/reverse) with late-cancel/no-show policies.

6. Staffing Jobs Workflow
   - Job drafts, approval, publication, takedown for policy violations, appeals, republish new version.
   - Immutable workflow history.

7. Analytics and Reporting
   - Metric/dimension model definitions, dashboards, anomaly rules.
   - Scheduled runs at 2:00 AM (configurable timezone), reconciliation folder outputs with checksum.

8. Export Service
   - CSV/JSON exports with role-based field masking policies.

9. Inbox and Notifications
   - In-app notifications for operational events and anomalies.
   - Optional printable notice generation (local print/export path only).

10. Audit and Governance
   - Immutable audit events retained for 7 years.
   - Audit browsing/search/export interfaces for authorized roles.

## 4. Data Model

All timestamps are stored in UTC. Domain entities that depend on local policy store an IANA timezone string (for example, `America/New_York`) and compute policy boundaries against that timezone.

### 4.1 Identity and Session

- `users`
  - Fields: `username` (unique), `password_hash`, `roles[]`, `status`, `failed_login_count`, `lockout_until`, `last_login_at`.
  - Indexes: unique `username`; index on `roles`.

- `sessions`
  - Fields: `session_id`, `user_id`, `created_at`, `last_activity_at`, `expires_at`, `idle_expires_at` (30 min), `csrf_token_hash`, `step_up_valid_until`.
  - Indexes/TTL: TTL on `expires_at`.

- `auth_events`
  - Login success/failure, lockout triggered, logout, step-up success/failure.

### 4.2 Catalog and Search

- `catalog_items`
  - Fields: `title`, `catalog_number`, `artist_ids[]`, `series_id`, `country_id`, `period_id`, `category`, `tags[]`, `description`, `status`.
  - Indexes: text/compound indexes for search fields; indexes on `category`, `tags`, `series_id`, `period_id`.

- `hot_keywords`
  - Fields: `keyword`, `rank`, `active_from`, `active_to`, `curated_by`, `status`.
  - Indexes: unique active keyword per period; index on `rank`.

- `search_cache`
  - Fields: canonicalized query hash, role scope, result payload, hit count, `expires_at`.
  - Indexes/TTL: unique `(query_hash, role_scope)`; TTL on `expires_at` (default configurable, e.g. 10 minutes).

### 4.3 Knowledge Graph

- `graph_nodes`
  - Types: `STAMP`, `MASTERPIECE`, `ARTIST`, `COUNTRY_PERIOD`, `SERIES`.
  - Fields: `node_id`, `type`, `label`, `normalized_label`, `metadata`, `status`.
  - Indexes: unique `(type, normalized_label)` in published scope.

- `graph_edges`
  - Fields: `from_node_id`, `to_node_id`, `relation_type`, `weight` (0-100), `constraints`, `status`.
  - Indexes: unique `(from_node_id, to_node_id, relation_type, status)`.

- `graph_drafts`
  - Fields: `draft_id`, `created_by`, `base_version`, `snapshot`, `validation_report`, `status`.

- `graph_versions`
  - Fields: `version`, `published_by`, `published_at`, `checksum`, `summary`.

### 4.4 Venue and Routes

- `venues`, `halls`, `zones`, `display_cases`
  - Hierarchy via parent references.
  - Venue stores `timezone` and default pacing config.
  - Indexes on parent keys for traversal.

- `routes`
  - Fields: `route_id`, `venue_id`, `name`, `strict_sequence` (policy flag), `default_pace_mph` (default 3), `status`.

- `route_segments`
  - Fields: `route_id`, `from_case_id`, `to_case_id`, `segment_type` (`REQUIRED_NEXT`, `OPTIONAL_BRANCH`, `ACCESSIBILITY_DETOUR`), `dwell_minutes`, `distance_meters`, `order`.
  - Indexes: `(route_id, order)`, `(route_id, from_case_id)`.

- `itineraries`
  - Materialized printable plan with computed `estimated_walk_minutes`, branch choices, generated timestamp.

### 4.5 Programs, Attendance, Credits, Waitlist

- `coaches`
  - Fields: profile, qualifications, contact, active flag.

- `coach_availability`
  - Fields: coach, recurrence/window, venue/program constraints.
  - Indexes on `coach_id` + time range.

- `programs`
  - Fields: type, title, capacity rules, cancellation policy (inherits default late/no-show penalties).

- `program_sessions`
  - Fields: `program_id`, `coach_id`, `venue_id`, `start_at_utc`, `end_at_utc`, `timezone`, `capacity`, `status`.
  - Indexes on time and capacity lookup.

- `registrations`
  - Fields: `session_id`, `participant_id`, `status` (`REGISTERED`, `WAITLISTED`, `CANCELLED`, `NO_SHOW`, `ATTENDED`, `PROMOTION_PENDING`), timestamps.
  - Indexes: unique `(session_id, participant_id)`.

- `waitlist_entries`
  - Fields: `session_id`, `participant_id`, `position`, `promoted_at`, `promotion_expires_at`, `status`.
  - Indexes: `(session_id, position)`, `(session_id, status)`.

- `credit_ledgers`
  - Fields: `participant_id`, `program_type`, current balance snapshot.

- `credit_ledger_entries`
  - Fields: `ledger_id`, `entry_type` (`GRANT`, `DEDUCT`, `ADJUST`, `REVERSE`), `amount`, `reason_code`, `related_registration_id`, `created_by`.
  - Indexes: `(ledger_id, created_at)`.

### 4.6 Staffing Jobs

- `jobs`
  - Fields: role title, department, shift metadata, policy flags, `current_state`.

- `job_versions`
  - Immutable revisions with content snapshot and actor metadata.

- `job_workflow_events`
  - State transitions: `DRAFT -> PENDING_APPROVAL -> PUBLISHED -> TAKEDOWN -> APPEAL_PENDING -> (REJECTED_APPEAL | REPUBLISHED_NEW_VERSION)`.
  - Indexes on `job_id`, `created_at`, `state`.

### 4.7 Analytics, Reports, Reconciliation

- `metric_definitions`, `dimension_definitions`, `dashboard_definitions`
  - Self-service analytics metadata.

- `anomaly_rules`
  - Includes threshold logic (for example bookings drop >30% WoW), minimum volume guardrails, skip behavior.

- `report_definitions`
  - Query/model, schedule config (`02:00`, timezone), output format.

- `report_runs`
  - Fields: `run_id`, status, start/end time, artifact path, checksum, retry count, error details.
  - Indexes on status/time; optional retention policy for derived artifacts.

### 4.8 Exports, Inbox, Audit

- `export_jobs`
  - Fields: requester, dataset, filters, mask_policy_version, format, artifact path, checksum, status.

- `inbox_messages`
  - Fields: recipient, type, payload, `created_at`, `read_at`, `retention_until`, `linked_audit_id`.
  - TTL: optional TTL on `retention_until` for non-audit messages only.

- `audit_logs`
  - Immutable append-only records for sensitive and governance-relevant actions.
  - Retention: minimum 7 years.
  - Indexes: actor/time/action/entity.

## 5. Core Workflows

### 5.1 Search and Discovery

1. User submits query with filters/sort/page size.
2. API canonicalizes request and checks `search_cache` by query hash + role scope.
3. On miss, backend executes indexed search with fuzzy matching and returns paginated results (size <= 50).
4. Response is cached with TTL; frontend stores for offline reuse.
5. Autocomplete and hot keywords are served from curated datasets managed by Curator/Admin.

Invalidation approach:
- Default natural TTL expiry.
- Targeted invalidation events on high-impact catalog/graph publish changes.

### 5.2 Knowledge Graph Draft, Validate, Publish

1. Curator edits a draft snapshot (nodes/edges/weights/constraints).
2. Validation pipeline checks duplicates, cycles, orphan nodes, and rule constraints.
3. UI surfaces structured errors; publish remains blocked until no blocking issues.
4. Publish executes atomically for the entire draft snapshot, creating new `graph_version`.
5. Publish writes immutable audit event and triggers downstream cache invalidation.

### 5.3 Routes and Itineraries

1. Exhibit Manager configures hierarchy and route segments.
2. Route policy sets `strict_sequence` and branch behavior.
3. Itinerary engine computes distance + dwell totals using default 3 mph pace (overridable per route).
4. Accessibility detours replace route segments while preserving final duration estimate semantics.
5. Printable itinerary artifact is generated for local printing.

### 5.4 Programs, Credits, and Waitlists

1. Program Coordinator creates sessions with timezone-aware schedule and capacity.
2. Registrations fill capacity; extra users enter ordered FIFO waitlist.
3. On cancellation/no-show, system atomically frees seat and promotes next waitlisted participant to `PROMOTION_PENDING`.
4. Promotion requires confirmation before `promotion_expires_at`; otherwise next participant is promoted.
5. Cancellation policy:
   - Cancel within 12 hours of local session start => `LATE_CANCEL` and deduct 1 credit.
   - `NO_SHOW` => deduct 2 credits.
6. Credit changes are written as immutable ledger entries; privileged roles can issue audited adjustments/reversals.

### 5.5 Staffing, Approval, Takedown, Appeal

1. Employer saves draft job and submits for approval.
2. Reviewer/Admin approves to publish or rejects with reason.
3. Policy issue triggers takedown with preserved history.
4. Employer may file appeal (`APPEAL_PENDING`).
5. Reviewer/Admin resolves appeal:
   - reject appeal -> `REJECTED_APPEAL`, or
   - approve appeal -> `REPUBLISHED_NEW_VERSION` with immutable new revision.

### 5.6 Analytics, Reports, Reconciliation

1. Authorized users define metric/dimension models and dashboards.
2. Scheduler runs report definitions at 2:00 AM in configured timezone.
3. Run writes output atomically (temp file then rename) in reconciliation folder.
4. Checksum is generated and stored; failures retry with backoff and are surfaced in dashboard + inbox.
5. Anomaly rules evaluate WoW change using ISO weeks and minimum volume guardrails.

### 5.7 Exports

1. User requests export with scope/filters.
2. RBAC and row/field policy checks execute before processing.
3. Sensitive fields are masked by role-based field policy (default deny for unclassified sensitive fields).
4. Artifact is generated as CSV/JSON with checksum and audit trail.

### 5.8 Inbox and Notifications

1. Domain events publish notification intents (registration change, waitlist promotion, approvals, anomalies, report failures).
2. Inbox message stored per recipient with read state.
3. Non-audit messages may expire per retention policy; audit evidence remains in immutable audit logs.

## 6. Security Design

### 6.1 Authentication and Session Controls

- Username/password only; minimum length 12 with complexity rules.
- Failed login lockout: 5 attempts -> 15-minute lockout.
- Idle timeout: 30 minutes.
- Password verification endpoint for step-up protected actions.
- Step-up validity window: short-lived (default 10 minutes, configurable 5-10) and invalidated on idle/session end.

### 6.2 Authorization (RBAC)

- Route-level and service-layer checks.
- Sensitive actions requiring step-up + immutable audit:
  - publish knowledge graph,
  - change route rules,
  - approve job transitions,
  - execute/export data artifacts.
- Auditor role: read and policy-limited export only; no mutating endpoints.

### 6.3 Audit and Retention

- Append-only audit logs for auth, data governance, workflow transitions, exports, and step-up actions.
- Retention policy: 7 years minimum.
- Tamper resistance: immutable schema, hash/chaining optional for integrity checks, restricted write path.

## 7. Offline and Caching Behavior

- Service worker caches app shell and read-heavy API responses (catalog results, route/itinerary views, published graph snapshots, user inbox summaries where allowed).
- IndexedDB stores queued mutations when offline.
- Sync engine retries queued writes with exponential backoff when connectivity returns.
- Conflict policy:
  - server authoritative timestamp ordering,
  - role-aware merge where safe,
  - unresolved conflicts produce inbox tasks for privileged users.
- Search cache in Mongo via TTL collection keeps busy-hour responses fast server-side; client-side cache improves offline UX.

## 8. Non-Functional Requirements

- Performance:
  - Search response p95 <= 500 ms for cached/hot queries, <= 1.5 s for cold complex queries.
  - Pagination hard cap 50 items per page.
- Availability/Resilience:
  - Offline read and queued-write support for operational continuity.
  - Scheduled reporting with retries and failure visibility.
- Scalability:
  - Single-tenant by default; key entities can add future `museum_id` for multi-site extension.
- Data integrity:
  - Atomic publish/versioning for graph and jobs; atomic waitlist promotion.
- Compliance/Security:
  - Strict RBAC, step-up for sensitive actions, immutable 7-year audits, export masking.
- Operability:
  - Structured logs, metrics, health endpoints, reconciliation artifact checksums, configurable retention/timezone values.
