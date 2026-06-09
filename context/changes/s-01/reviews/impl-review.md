<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pre-market Check-in with Readiness Score

- **Plan**: context/changes/s-01/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-06-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 6 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — UTC date computation for "today" may assign wrong session date

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/checkin.ts:6,64
- **Detail**: `new Date().toISOString().split("T")[0]` computes "today" in UTC. Cloudflare Workers always run in UTC. A trader in US Eastern time checking in at 10 PM Monday gets a Tuesday session. This affects the one-session-per-date constraint and could cause missed/doubled sessions across the app. The same pattern appears on line 64 (getTodayCheckin).
- **Fix A** ⭐ Recommended: Accept the user's timezone from the client
  - Strength: Correct per-user dates. Client sends `Intl.DateTimeFormat().resolvedOptions().timeZone` or a pre-computed local date; service converts accordingly.
  - Tradeoff: Adds a parameter to service functions and API payload; downstream slices must carry it forward.
  - Confidence: MED — requires product decision on how timezone is surfaced (user profile setting vs. per-request header).
  - Blind spot: No clarity yet on whether the PRD intends UTC or local dates.
- **Fix B**: Document UTC dates as a deliberate product choice
  - Strength: Zero code change; aligns all slices on one convention.
  - Tradeoff: Confusing UX for non-UTC traders near midnight.
  - Confidence: HIGH — simplest path, but pushes the problem to users.
  - Blind spot: User research on actual trading hours not done.
- **Decision**: SKIPPED

### F2 — TOCTOU race in getOrCreateTodaySession

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/checkin.ts:8-26
- **Detail**: The hardening commit (f36fc3a) justifiably replaced upsert with select-then-insert to avoid resetting session status. However, the new pattern has a TOCTOU race: two concurrent requests both see `existing === null`, both INSERT, and one hits the UNIQUE constraint — unhandled Postgres error 23505 — 500 response. This is realistic with double-click or slow network retry.
- **Fix**: Catch UNIQUE violation (code 23505) and retry the SELECT.
  - Strength: Preserves the hardening rationale (no status overwrite) while handling concurrency. ~5 lines added.
  - Tradeoff: Minor — one extra query on the race path only.
  - Confidence: HIGH — standard Postgres upsert-without-upsert pattern.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — Middleware does not protect /api/* domain routes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:4
- **Detail**: PROTECTED_ROUTES uses `startsWith` matching with ["/dashboard", "/checkin"]. The API at `/api/checkin` does NOT match `/checkin` because the pathname is `/api/checkin`. The API has its own auth guard (line 51-57), so there is no current bypass. But as the API surface grows (S-02 through S-04), a future route that omits the in-route check would be unprotected.
- **Fix A** ⭐ Recommended: Add "/api" to PROTECTED_ROUTES (exclude /api/auth)
  - Strength: Defense-in-depth for all future domain API routes. Auth routes at /api/auth/* can be excluded with a negation check.
  - Tradeoff: Slightly more complex middleware logic.
  - Confidence: HIGH — a single guard at the perimeter is easier to audit than N in-route checks.
  - Blind spot: Need to verify /api/auth/* routes still work unauthenticated after the change.
- **Fix B**: Document that every domain API route must include its own auth check
  - Strength: No code change; each route is self-contained.
  - Tradeoff: Relies on developer discipline; easy to miss.
  - Confidence: MED — works until someone forgets.
  - Blind spot: None.
- **Decision**: FIXED (Fix A — added /api to PROTECTED_ROUTES with /api/auth exclusion)

### F4 — Missing CHECK constraints on text enum columns

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260603000000_create_sessions_and_checkins.sql:54-56
- **Detail**: `emotion`, `market_bias`, and `risk_mode` are `text NOT NULL` with no CHECK constraint. The API validates against the const arrays, but any code path that bypasses the API (direct Supabase client, future service calls, Studio edits) can insert arbitrary strings.
- **Fix**: Add a new migration with ALTER TABLE ADD CONSTRAINT for each column, mirroring the app-level enum arrays.
- **Decision**: SKIPPED

### F5 — API response returns full internal objects

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/checkin.ts:93-99
- **Detail**: The success response includes the full `session` and `checkin` objects (with internal UUIDs, user_id, timestamps). The client (CheckinForm.tsx:62) only reads `readiness_score` and `score_band`. The hardening commit narrowed SSR serialization in checkin.astro but the API response was not similarly narrowed.
- **Fix**: Return only `{ readiness_score, score_band }` from the API.
- **Decision**: SKIPPED

### F6 — Blanket eslint-disable across entire service file

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/checkin.ts:1
- **Detail**: File-level `eslint-disable` for three `@typescript-eslint/no-unsafe-*` rules. No other file in the project uses file-level disables. The suppression is needed for the `as Session` / `as CheckIn` casts on Supabase `.data` returns, but should be scoped to those specific lines.
- **Fix**: Replace with per-line `// eslint-disable-next-line` on the 6 cast lines (lines 16, 25, 32, 57, 74, 77).
- **Decision**: FIXED

### F7 — "Back" button added in form section 2, not in plan

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/checkin/CheckinForm.tsx:160-167
- **Detail**: The plan describes section 2 with only a "Submit" button. The implementation adds a "Back" button to return to section 1. Without it, users would have no way to correct physical ratings before submitting. This is a sensible UX addition within the plan's intent of progressive disclosure.
- **Fix**: No fix needed. Document as a plan addendum if desired.
- **Decision**: SKIPPED
