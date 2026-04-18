# Philatelic Museum Operations Suite - REST API Specification

## 1. API Conventions

### Base URL and Versioning

- Base path: `/api/v1`
- JSON request/response: `Content-Type: application/json`
- Time format: ISO 8601 UTC (`2026-03-28T14:30:00Z`)
- Timezone fields: IANA name (`America/New_York`)

### Authentication and Session

- Username/password login creates server session.
- Session cookie: `museum_sid` (HttpOnly, Secure, SameSite=Strict).
- CSRF header required on mutating requests: `X-CSRF-Token`.
- Step-up for sensitive actions:
  - Acquire via password re-entry endpoint.
  - Pass `X-Step-Up-Token` for protected operations.
  - Default validity 10 minutes (or until idle session expiry).

### Standard Error Envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "pageSize", "issue": "must be <= 50" }
    ],
    "requestId": "req_8f3b9a"
  }
}
```

Common HTTP statuses:
- `400` bad request / validation
- `401` unauthenticated / bad credentials / lockout
- `403` unauthorized role or missing step-up
- `404` not found
- `409` workflow/state conflict
- `422` business rule violation (for example graph validation blockers)
- `429` rate/attempt limit
- `500` server error

### Pagination, Sorting, Filtering

- Query params:
  - `page` (int >= 1, default 1)
  - `pageSize` (int 1-50, default 20)
  - `sort` (comma list, `field:asc|desc`)
  - `filter[field]` style for scalar filters
- List response shape:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 245,
    "totalPages": 13
  }
}
```

## 2. RBAC Notes by Area

- `Administrator`: full access.
- `Curator`: catalog curation, hot keywords, graph draft/publish (step-up for publish).
- `Exhibit Manager`: venue/routes/itineraries (step-up for rule changes).
- `Program Coordinator`: programs, coaches, registrations, credits/waitlists.
- `Employer`: create/edit/submit jobs and appeals.
- `Reviewer`: approve/reject jobs and appeals (step-up for approvals).
- `Auditor`: read-only operational + audit/report/export within masking policy.

## 3. Authentication, Users, Sessions

### POST `/auth/login`
Purpose: authenticate with username/password.

Request body:
```json
{
  "username": "curator.lee",
  "password": "MuseumsRule!2026"
}
```

Validation:
- `username`: required, 3-64 chars.
- `password`: required, min 12 chars, complexity enforced.

Success `200`:
```json
{
  "data": {
    "user": {
      "id": "usr_123",
      "username": "curator.lee",
      "roles": ["Curator"]
    },
    "session": {
      "id": "ses_456",
      "idleExpiresAt": "2026-03-28T15:00:00Z"
    },
    "csrfToken": "csrf_abc"
  }
}
```

Errors:
- `401` invalid credentials
- `401` account locked until timestamp after 5 failed attempts in 15 minutes

### POST `/auth/logout`
Purpose: end current session.

Success `204` (no body)

### GET `/auth/me`
Purpose: current user/session state.

Success `200`:
```json
{
  "data": {
    "user": { "id": "usr_123", "username": "curator.lee", "roles": ["Curator"] },
    "session": {
      "id": "ses_456",
      "idleExpiresAt": "2026-03-28T15:00:00Z",
      "stepUpValidUntil": "2026-03-28T14:42:00Z"
    }
  }
}
```

### POST `/auth/step-up`
Purpose: re-authenticate current password for sensitive actions.

Request body:
```json
{ "password": "MuseumsRule!2026" }
```

Success `200`:
```json
{
  "data": {
    "stepUpToken": "stp_789",
    "validUntil": "2026-03-28T14:42:00Z"
  }
}
```

### GET `/users`
Purpose: list users (Admin only).

### POST `/users`
Purpose: create user and assign roles (Admin only).

Request body (example):
```json
{
  "username": "reviewer.patel",
  "password": "StrongPass!2026",
  "roles": ["Reviewer"]
}
```

Validation:
- roles must be subset of defined role enum.

### PATCH `/users/{userId}`
Purpose: update roles/status (Admin only).

## 4. Catalog Search, Autocomplete, Hot Keywords

### GET `/catalog/search`
Purpose: combined fuzzy search across title/catalog number/artist/series/country/period/tags.

Query params:
- `q` string (optional; if empty with filters, filtered browse)
- `filter[category]` string
- `filter[tags]` comma list
- `filter[periodId]`, `filter[seriesId]`
- `sort` one of `relevance:desc`, `title:asc`, `period:asc`
- `page`, `pageSize` (`<= 50`)

Success `200`:
```json
{
  "data": [
    {
      "id": "cat_1001",
      "title": "Blue Airmail 1930",
      "catalogNumber": "AM-1930-17",
      "artist": "I. Kline",
      "series": "Interwar Flights",
      "country": "USA",
      "period": "1930s",
      "tags": ["airmail", "engraving"]
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 },
  "meta": { "cache": "HIT" }
}
```

### GET `/catalog/autocomplete`
Purpose: autocomplete suggestions for search box.

Query params:
- `q` required, min 1 char, max 64
- `limit` int 1-15, default 8

Success `200`:
```json
{
  "data": [
    { "type": "title", "value": "Blue Airmail" },
    { "type": "catalogNumber", "value": "AM-1930" },
    { "type": "artist", "value": "I. Kline" }
  ]
}
```

### GET `/catalog/hot-keywords`
Purpose: active curated hot keywords.

Success `200`:
```json
{
  "data": [
    { "keyword": "Olympic Issues", "rank": 1 },
    { "keyword": "Spring Exhibit", "rank": 2 }
  ]
}
```

### POST `/catalog/hot-keywords`
Purpose: create keyword (Curator/Admin).

Request body:
```json
{
  "keyword": "Centennial Collection",
  "rank": 3,
  "activeFrom": "2026-04-01T00:00:00Z",
  "activeTo": "2026-05-01T00:00:00Z"
}
```

### PATCH `/catalog/hot-keywords/{keywordId}`
Purpose: update rank/window/status (Curator/Admin).

### DELETE `/catalog/hot-keywords/{keywordId}`
Purpose: retire keyword (Curator/Admin).

## 5. Knowledge Graph CRUD, Validation, Publish

### GET `/graph/versions`
Purpose: list published graph versions.

### POST `/graph/drafts`
Purpose: create draft snapshot from current published version (Curator/Admin).

Success `201`:
```json
{ "data": { "draftId": "gdr_200", "baseVersion": 14, "status": "DRAFT" } }
```

### GET `/graph/drafts/{draftId}`
Purpose: fetch draft nodes/edges.

### POST `/graph/drafts/{draftId}/nodes`
Purpose: add node to draft.

Request body:
```json
{
  "type": "STAMP",
  "label": "Inverted Airpost 1918",
  "metadata": { "catalogNumber": "C3a" }
}
```

Validation:
- `type` enum: `STAMP|MASTERPIECE|ARTIST|COUNTRY_PERIOD|SERIES`.

### PATCH `/graph/drafts/{draftId}/nodes/{nodeId}`
Purpose: update node metadata.

### DELETE `/graph/drafts/{draftId}/nodes/{nodeId}`
Purpose: remove node from draft.

### POST `/graph/drafts/{draftId}/edges`
Purpose: add weighted relation edge.

Request body:
```json
{
  "fromNodeId": "n_1",
  "toNodeId": "n_2",
  "relationType": "INFLUENCED_BY",
  "weight": 85,
  "constraints": { "required": true }
}
```

Validation:
- `weight` int 0-100.

### POST `/graph/drafts/{draftId}/validate`
Purpose: run draft validation for duplicates/cycles/orphans/rules.

Success `200`:
```json
{
  "data": {
    "status": "INVALID",
    "issues": [
      { "code": "CYCLE", "severity": "BLOCKING", "nodes": ["n_1", "n_2", "n_3"] }
    ]
  }
}
```

### POST `/graph/drafts/{draftId}/publish`
Purpose: atomically publish validated draft (Curator/Admin, step-up required).

Headers:
- `X-Step-Up-Token`: required

Success `200`:
```json
{
  "data": {
    "version": 15,
    "publishedAt": "2026-03-28T15:10:00Z"
  }
}
```

Errors:
- `422` when blocking validation issues remain
- `403` missing/expired step-up

## 6. Venue Hierarchy, Routes, Itineraries

### POST `/venues`
Purpose: create venue (Exhibit Manager/Admin).

Request body:
```json
{
  "name": "Main Philately Center",
  "timezone": "America/New_York",
  "defaultPaceMph": 3
}
```

### POST `/venues/{venueId}/halls`
### POST `/halls/{hallId}/zones`
### POST `/zones/{zoneId}/display-cases`
Purpose: build hierarchy (Exhibit Manager/Admin).

### POST `/routes`
Purpose: create route.

Request body:
```json
{
  "venueId": "ven_1",
  "name": "Airmail Highlights",
  "strictSequence": false,
  "defaultPaceMph": 3
}
```

### POST `/routes/{routeId}/segments`
Purpose: add route segment/rule.

Request body:
```json
{
  "fromCaseId": "case_10",
  "toCaseId": "case_11",
  "segmentType": "REQUIRED_NEXT",
  "dwellMinutes": 4,
  "distanceMeters": 35,
  "order": 1
}
```

Validation:
- `segmentType`: `REQUIRED_NEXT|OPTIONAL_BRANCH|ACCESSIBILITY_DETOUR`.

### PATCH `/routes/{routeId}`
Purpose: update route rules (`strictSequence`, pace) (Exhibit Manager/Admin, step-up required).

### POST `/routes/{routeId}/itineraries`
Purpose: generate printable itinerary with estimated walk time.

Request body (optional branch choices):
```json
{
  "branchSelections": [
    { "fromCaseId": "case_11", "toCaseId": "case_20" }
  ],
  "accessibilityMode": true
}
```

Success `201`:
```json
{
  "data": {
    "itineraryId": "iti_991",
    "estimatedWalkMinutes": 42,
    "printablePath": "reconciliation/itineraries/iti_991.pdf"
  }
}
```

## 7. Programs, Coaches, Registrations, Cancellations, Credits, Waitlists

### POST `/programs`
Purpose: create program template (Program Coordinator/Admin).

### POST `/coaches`
Purpose: create coach profile.

### POST `/coaches/{coachId}/availability`
Purpose: add availability window.

### POST `/program-sessions`
Purpose: schedule session.

Request body:
```json
{
  "programId": "prg_1",
  "coachId": "coach_2",
  "venueId": "ven_1",
  "startAtUtc": "2026-04-04T14:00:00Z",
  "endAtUtc": "2026-04-04T15:00:00Z",
  "timezone": "America/New_York",
  "capacity": 12
}
```

### POST `/program-sessions/{sessionId}/registrations`
Purpose: register participant or waitlist if full.

Request body:
```json
{ "participantId": "usr_900" }
```

Success `201`:
```json
{
  "data": {
    "registrationId": "reg_80",
    "status": "WAITLISTED",
    "waitlistPosition": 3
  }
}
```

### POST `/program-sessions/{sessionId}/registrations/{registrationId}/cancel`
Purpose: cancel registration and apply policy.

Success `200`:
```json
{
  "data": {
    "status": "LATE_CANCEL",
    "creditsDeducted": 1,
    "policyTimezone": "America/New_York",
    "hoursBeforeStart": 7.5,
    "waitlistPromotion": {
      "participantId": "usr_901",
      "status": "PROMOTION_PENDING",
      "expiresAt": "2026-04-04T12:30:00Z"
    }
  }
}
```

### POST `/program-sessions/{sessionId}/registrations/{registrationId}/no-show`
Purpose: mark no-show and deduct 2 credits (Coordinator/Admin).

### POST `/program-sessions/{sessionId}/waitlist/{entryId}/confirm`
Purpose: confirm promoted waitlist seat before expiry.

### GET `/participants/{participantId}/credits`
Purpose: view credit balance + history.

Success `200`:
```json
{
  "data": {
    "participantId": "usr_900",
    "programType": "DOCENT_TRAINING",
    "balance": 7,
    "entries": [
      {
        "entryType": "DEDUCT",
        "amount": 1,
        "reasonCode": "LATE_CANCEL",
        "createdAt": "2026-04-04T07:05:00Z"
      }
    ]
  }
}
```

### POST `/participants/{participantId}/credits/adjustments`
Purpose: audited adjustment/reversal (Program Coordinator/Admin only).

Request body:
```json
{
  "entryType": "ADJUST",
  "amount": 1,
  "reasonCode": "DISPUTE_RESOLVED",
  "notes": "Late-cancel incorrectly applied"
}
```

## 8. Jobs, Drafts, Approval, Takedown, Appeal

### POST `/jobs`
Purpose: create job draft (Employer/Admin).

Request body:
```json
{
  "department": "Events",
  "title": "Weekend Exhibit Assistant",
  "description": "Support visitors and case transitions",
  "shiftInfo": "Sat-Sun 10:00-16:00"
}
```

Success `201`:
```json
{ "data": { "jobId": "job_22", "state": "DRAFT" } }
```

### PATCH `/jobs/{jobId}`
Purpose: edit draft/revision content (Employer/Admin).

### POST `/jobs/{jobId}/submit`
Purpose: transition `DRAFT -> PENDING_APPROVAL`.

### POST `/jobs/{jobId}/approve`
Purpose: transition `PENDING_APPROVAL -> PUBLISHED` (Reviewer/Admin, step-up required).

Request body:
```json
{ "comment": "Approved for spring program staffing" }
```

### POST `/jobs/{jobId}/reject`
Purpose: reject pending approval (Reviewer/Admin).

### POST `/jobs/{jobId}/takedown`
Purpose: policy takedown from published state (Reviewer/Admin).

Request body:
```json
{ "policyCode": "POL-17", "reason": "Missing required compliance statement" }
```

### POST `/jobs/{jobId}/appeals`
Purpose: create appeal (`TAKEDOWN -> APPEAL_PENDING`) (Employer/Admin).

### POST `/jobs/{jobId}/appeals/{appealId}/decide`
Purpose: decide appeal (Reviewer/Admin).

Request body:
```json
{
  "decision": "APPROVE",
  "comment": "Statement corrected in new revision"
}
```

Decision behavior:
- `APPROVE` -> `REPUBLISHED_NEW_VERSION`
- `REJECT` -> `REJECTED_APPEAL`

### GET `/jobs/{jobId}/history`
Purpose: immutable workflow/version timeline.

## 9. Analytics, Dashboards, Reports, Schedules, Reconciliation

### POST `/analytics/metrics`
Purpose: create metric definition (Admin/Auditor read-only; creation Admin).

### POST `/analytics/dimensions`
Purpose: create dimension definition (Admin).

### POST `/analytics/dashboards`
Purpose: create dashboard definition (Admin, Curator, Program Coordinator as permitted).

### GET `/analytics/dashboards/{dashboardId}`
Purpose: fetch dashboard with tiles and anomaly states.

Success `200`:
```json
{
  "data": {
    "dashboardId": "dash_10",
    "tiles": [
      { "metric": "weekly_bookings", "value": 182 }
    ],
    "anomalies": [
      {
        "rule": "bookings_drop_wow_30",
        "status": "TRIGGERED",
        "message": "Bookings dropped 34% week-over-week"
      }
    ]
  }
}
```

### POST `/analytics/reports`
Purpose: create report definition.

Request body:
```json
{
  "name": "Daily Program Reconciliation",
  "dataset": "program_registrations",
  "format": "CSV",
  "schedule": {
    "time": "02:00",
    "timezone": "America/New_York"
  }
}
```

### POST `/analytics/reports/{reportId}/run`
Purpose: run report immediately.

### GET `/analytics/reports/{reportId}/runs`
Purpose: list run history/status/checksum.

Success `200`:
```json
{
  "data": [
    {
      "runId": "rr_500",
      "status": "SUCCESS",
      "artifactPath": "reconciliation/reports/rr_500.csv",
      "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb924...",
      "startedAt": "2026-03-28T06:00:00Z",
      "finishedAt": "2026-03-28T06:00:04Z"
    }
  ]
}
```

Failure semantics:
- failed scheduled runs retry with backoff
- failure creates inbox notification and audit event
- prior successful artifact remains unchanged (atomic write)

## 10. Exports

### POST `/exports`
Purpose: create export job with masking and permission checks (step-up required for sensitive datasets).

Request body:
```json
{
  "resource": "participants",
  "format": "CSV",
  "filters": { "programType": "DOCENT_TRAINING" },
  "fields": ["name", "phone", "email", "notes"]
}
```

Success `202`:
```json
{
  "data": {
    "exportJobId": "exp_77",
    "status": "QUEUED"
  }
}
```

### GET `/exports/{exportJobId}`
Purpose: get export status and artifact metadata.

Success `200`:
```json
{
  "data": {
    "exportJobId": "exp_77",
    "status": "COMPLETED",
    "artifactPath": "reconciliation/exports/exp_77.csv",
    "checksumSha256": "5f70bf18a086007016e948b04aed3b82...",
    "maskingPreview": {
      "phone": "***-***-1234",
      "notes": "[REDACTED]"
    }
  }
}
```

Masking rules:
- role and field-classification driven
- default deny for unclassified sensitive columns
- examples: phone last 4 visible, notes redacted, optional email hash/omit based on role

## 11. Inbox and Notifications

### GET `/inbox/messages`
Purpose: list current user messages.

Filters:
- `filter[unread]=true|false`
- `filter[type]=ANOMALY|WAITLIST|WORKFLOW|SYSTEM`

Success `200`:
```json
{
  "data": [
    {
      "id": "msg_1",
      "type": "WAITLIST",
      "title": "Promotion pending",
      "body": "Confirm your spot before 08:30 local time.",
      "createdAt": "2026-04-04T12:00:00Z",
      "readAt": null
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### POST `/inbox/messages/{messageId}/read`
Purpose: mark message as read.

### POST `/inbox/messages/{messageId}/print`
Purpose: generate printable local notice.

## 12. Audit and Governance

### GET `/audit/events`
Purpose: search audit log (Auditor/Admin).

Query params:
- `filter[actorId]`
- `filter[action]`
- `filter[from]`, `filter[to]`
- pagination/sort

Success `200`:
```json
{
  "data": [
    {
      "id": "aud_9",
      "actorId": "usr_123",
      "action": "GRAPH_PUBLISH",
      "entityType": "graph_version",
      "entityId": "15",
      "createdAt": "2026-03-28T15:10:02Z",
      "metadata": { "stepUp": true }
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### GET `/audit/events/{eventId}`
Purpose: fetch detailed immutable event.

## 13. Admin and Curation Utilities

### GET `/admin/config`
Purpose: retrieve operational config (Admin only):
- `searchCacheTtlSeconds`
- `reportScheduleTimezone`
- `waitlistPromotionExpiryMinutes`
- `inboxRetentionDays`

### PATCH `/admin/config`
Purpose: update config (Admin, step-up required).

### POST `/admin/cache/invalidate`
Purpose: targeted cache invalidation after major curation updates (Admin/Curator).

Request body:
```json
{
  "scope": "CATALOG_SEARCH",
  "keys": ["queryHash:abc123", "hot_keywords_active"]
}
```

### GET `/admin/reconciliation/artifacts`
Purpose: list report/export/itinerary artifacts with checksum and status (Admin/Auditor).

## 14. Validation and Business Rules Summary

- Search `pageSize` must be `<= 50`.
- Graph edge weight must be `0-100`.
- Graph publish fails with `422` if any blocking issue exists.
- Late-cancel computed against session start in session timezone; no-show deducts two credits.
- Waitlist promotion is FIFO and atomic; promotion expires if not confirmed in configured window.
- Job workflow enforces allowed state transitions only.
- Sensitive endpoints require valid `X-Step-Up-Token` and generate audit events.
