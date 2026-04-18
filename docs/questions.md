# Business Logic Questions Log

## 1) Tenant scope and multi-museum isolation

Question: The requirement describes a unified suite but does not state whether the deployment is single-tenant (one museum instance) or multi-tenant with isolated data per organization.
My Understanding/Hypothesis: A single logical museum per deployment is assumed; all users share one namespace unless an explicit organization or site dimension is added later.
Solution: Model the system as single-tenant with optional future extension via a top-level site or museum_id on core entities if multi-site is needed.

## 2) “Offline-ready” behavior and conflict resolution

Question: Prompt states offline-ready but does not define which features work offline, how writes are queued, or how conflicts resolve when connectivity returns.
My Understanding/Hypothesis: Read-heavy flows (cached search, static routes) work offline with a service worker; mutations queue locally and replay with last-write-wins or server authority for staff edits.
Solution: Document offline scope in design (read cache + queued mutations); use server timestamps and role-based merge rules for conflicting updates after sync.

## 3) Session credits: initial balance, top-up, and appeals

Question: Late-cancel and no-show deduct credits, but initial credit balances, grants, refunds, and dispute handling for incorrect deductions are not specified.
My Understanding/Hypothesis: Each participant has a configurable credit ledger per program type; incorrect deductions can be reversed by Program Coordinator or Administrator with audit.
Solution: Implement ledger entries (grant, deduct, adjust) with reasons; restrict adjustments to privileged roles and log every change immutably.

## 4) Late-cancel 12-hour boundary and timezone

Question: “Within 12 hours” is not anchored to session local time, venue timezone, or server UTC.
My Understanding/Hypothesis: Cancellations are evaluated against the session’s scheduled start in the venue’s configured timezone, converted consistently for storage.
Solution: Store session start as UTC plus venue timezone; compute late-cancel using that timezone’s wall-clock offset from start.

## 5) Waitlist promotion when capacity frees

Question: Prompt mentions waitlists but not whether promotion is automatic (FIFO), priority-based, or manual coordinator action.
My Understanding/Hypothesis: FIFO automatic promotion up to capacity when a seat opens, with in-app notification to the promoted user.
Solution: Implement ordered waitlist with atomic promotion on cancel/no-show; notify next eligible registrant and expire promotion if not confirmed within a defined window.

## 6) Job posting takedowns, appeals, and reinstatement

Question: Appeals after policy takedowns are mentioned but not the decision actor, SLA, or whether reinstatement creates a new revision or restores the prior state.
My Understanding/Hypothesis: Reviewer or Administrator adjudicates appeals; approved appeals create a new approved revision for audit clarity rather than silent undelete.
Solution: Workflow states: DRAFT → PENDING_APPROVAL → PUBLISHED → TAKEDOWN → APPEAL_PENDING → (REJECTED_APPEAL | REPUBLISHED_NEW_VERSION); immutable history retained.

## 7) Sensitive-action re-authentication validity window

Question: Re-entry of password for sensitive actions is required, but duration of that elevated proof (per action vs. short TTL) is not stated.
My Understanding/Hypothesis: Re-auth is valid for a short sliding window (e.g., 5–10 minutes) or until idle timeout, whichever comes first, to balance security and usability.
Solution: Issue a short-lived “step-up” token or server-side flag keyed to user and timestamp; require fresh password for each sensitive action after window expiry.

## 8) Knowledge graph publish: atomicity and partial fixes

Question: UI blocks publish when duplicates, cycles, or orphans exist, but it is unclear whether publish is all-or-nothing for the whole graph or per subgraph/curator draft.
My Understanding/Hypothesis: Publish is atomic for a bounded “draft snapshot” curated by a curator; validation runs on that snapshot before commit.
Solution: Version graph publishes with pre-publish validation; reject publish with a structured error list until all blocking issues are resolved in the draft.

## 9) Export masking beyond phone and notes

Question: Example masking covers phone last four and redacted notes; other PII (email, staff IDs, internal comments) rules are not enumerated.
My Understanding/Hypothesis: A role-based field classification drives masking defaults; anything marked sensitive uses policy templates (mask, hash, omit).
Solution: Centralize export field policies per role; default deny for unclassified sensitive columns; extend examples in api-spec for each resource type.

## 10) Scheduled reports at 2:00 AM: timezone and failure handling

Question: “2:00 AM” is not tied to a timezone; behavior on run failure, partial writes, or checksum mismatch is not specified.
My Understanding/Hypothesis: Scheduler uses a configurable system or venue timezone; failed runs retry with backoff and record failure in inbox and audit without corrupting prior artifacts.
Solution: Configurable `report_schedule_timezone`; write new files atomically (temp + rename); log checksum and status; surface failures on dashboard and inbox.

## 11) Anomaly rule “bookings drop >30% week-over-week”

Question: Calendar week boundaries, minimum sample size, and behavior when prior week had zero bookings are undefined.
My Understanding/Hypothesis: Compare ISO calendar weeks with a minimum booking threshold to avoid noise; treat zero baseline as “insufficient data” rather than infinite drop.
Solution: Implement WoW with explicit week definition, guardrails for low volume, and dashboard messaging when the rule is skipped or inconclusive.

## 12) Search TTL cache duration and invalidation

Question: TTL collections are required for search caching but no default TTL or invalidation rules on collection or exhibit data changes are given.
My Understanding/Hypothesis: Short TTL (e.g., minutes to low tens of minutes) for hot queries; curator publish and major catalog edits trigger targeted cache invalidation or rely on natural TTL expiry for simplicity.
Solution: Configurable default TTL index; optional event-driven invalidation keys for high-impact mutations documented in design.

## 13) Reviewer versus Auditor responsibilities for jobs and governance

Question: Multiple roles exist; boundaries between Reviewer (approvals) and Auditor (read-only oversight) for staffing and exports are not fully spelled out.
My Understanding/Hypothesis: Reviewer approves or rejects workflow transitions that change public or operational state; Auditor has read/export within policy but cannot approve or publish.
Solution: Permission matrix in design.md; enforce route-level checks and separate audit views without mutating endpoints for Auditor.

## 14) Visitor route rules: mandatory sequence versus skippable stops

Question: “Sequence rules” and “optional branches” are described but not whether visitors must complete stops in order or can skip ahead in the UI.
My Understanding/Hypothesis: Sequence is advisory for planning and printouts; optional branches are chosen explicitly; accessibility detours replace segments without breaking overall estimated time logic.
Solution: Model edges with required_next vs optional_branch; UI reflects museum policy (strict path vs flexible browse) as a per-route configuration flag.

## 15) In-app inbox retention and read state

Question: Notifications are in-app with optional printouts, but retention, read/unread semantics, and bulk cleanup are not specified.
My Understanding/Hypothesis: Messages persist for operational traceability with user read markers; system may archive or purge beyond a configurable retention aligned with audit needs where not part of immutable audit store.
Solution: Per-user inbox with read_at; configurable retention for non-audit messages; audit events remain in the 7-year audit trail regardless of inbox cleanup.
