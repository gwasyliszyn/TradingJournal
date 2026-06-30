---
date: "2026-06-30T12:00:00+02:00"
researcher: Claude
git_commit: bd55386
branch: main
repository: TradingJournal
topic: "Risks #3 and #5 — Data persistence and unauthorized access (IDOR)"
tags: [research, codebase, risk-3, risk-5, form-submission, supabase, rls, error-handling, data-persistence, idor, authorization]
status: complete
last_updated: "2026-06-30"
last_updated_by: Claude
last_updated_note: "Added Risk #5 (IDOR) research"
---

# Research: Risk #3 — Session data loss on form submission

**Date**: 2026-06-30T12:00:00+02:00
**Researcher**: Claude
**Git Commit**: bd55386
**Branch**: main
**Repository**: TradingJournal

## Research Question

Where and how could session data be lost on form submission? Investigate all
four form submission paths (check-in, plan, trade, review), the Supabase
client's error handling, RLS insert policies, and client-side error
propagation. Identify concrete failure scenarios that an integration test
must cover to protect against Risk #3.

## Summary

The codebase uses a consistent and mostly-sound pattern for form submissions:
client-side `fetch()` → API route → service-layer Supabase call with
`.select().single()` → error check → HTTP response. A 2xx response reliably
proves the write landed in the database. **However, three concrete
vulnerabilities exist:**

1. **`completeSession()` missing `.select().single()`** — the session status
   update can match 0 rows and return no error, leaving the session "active"
   while the review is saved. This is the highest-risk finding.
2. **Non-atomic review + session-completion** — two sequential Supabase
   operations with no transaction wrapper; partial success creates
   inconsistent state.
3. **Trade deletion swallows all errors on the client** — `catch {}` in
   `handleDelete` means the user never learns a delete failed.

## Detailed Findings

### 1. API Route Handlers — Write Verification Pattern

All four form submissions follow the same server-side pattern:

| Form | API route | Service function | Supabase op | `.select().single()` | Error check |
|------|-----------|------------------|-------------|----------------------|-------------|
| Check-in | [api/checkin.ts:44](src/pages/api/checkin.ts#L44) | `upsertCheckin()` | UPSERT `check_ins` | YES | YES — throws |
| Plan | [api/plan.ts:35](src/pages/api/plan.ts#L35) | `upsertPlan()` | UPSERT `session_plans` | YES | YES — throws |
| Trade | [api/trades.ts:46](src/pages/api/trades.ts#L46) | `createTrade()` | INSERT `trades` | YES | YES — throws |
| Review | [api/review.ts:44](src/pages/api/review.ts#L44) | `upsertReview()` | UPSERT `session_reviews` | YES | YES — throws |

**Verdict:** For the primary write of each form, the `.select().single()`
chain means a 200/201 response genuinely proves the row landed. This is the
correct pattern — no silent write failures here.

### 2. CRITICAL: `completeSession()` — Missing Write Verification

**File:** [review.ts:60-64](src/lib/services/review.ts#L60-L64)

```typescript
export async function completeSession(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase.from("sessions").update({ status: "complete" }).eq("id", sessionId);
  if (error) throw error;
}
```

**Problem:** No `.select().single()`. In PostgreSQL, an `UPDATE ... WHERE id = X`
that matches 0 rows is NOT an error — it returns success with 0 affected rows.
Supabase won't populate `error` for a zero-match update. This means:

- If `sessionId` is wrong (defensive edge case) → silent no-op, no error
- If RLS blocks the update (auth context lost between middleware and here) →
  Supabase *does* return an error for RLS violations, so this path is covered
- The realistic failure: zero-row match returns no error, function returns
  successfully, caller ([api/review.ts:99](src/pages/api/review.ts#L99))
  treats it as success

**Impact:** Session stays `"active"` forever. Dashboard shows incomplete
status. Trader doesn't know their session wasn't finalized.

### 3. Non-Atomic Review Submission

**File:** [api/review.ts:98-99](src/pages/api/review.ts#L98-L99)

```typescript
const review = await upsertReview(supabase, session.id, user.id, formData, processScoreResult.score);
await completeSession(supabase, session.id);
```

Two independent Supabase operations, no transaction:

| Scenario | `upsertReview` | `completeSession` | HTTP response | State |
|----------|----------------|-------------------|---------------|-------|
| Happy path | succeeds | succeeds | 200 | Consistent |
| Review fails | throws | skipped | 500 | Consistent (nothing written) |
| Review OK, completion fails | succeeds | throws | 500 | **INCONSISTENT** — review saved, session still "active" |
| Review OK, completion no-op | succeeds | returns (0 rows) | 200 | **INCONSISTENT** — client thinks success, session still "active" |

In the "review OK, completion fails" scenario the client sees 500 and may
retry. The retry's `upsertReview` (using `onConflict: "session_id"`) will
overwrite with identical data — no data loss, but `completeSession` may fail
again if the root cause persists.

### 4. Trade Deletion Silent Failure

**File:** [TradesPage.tsx:30-38](src/components/trades/TradesPage.tsx#L30-L38)

```typescript
async function handleDelete(tradeId: string) {
  try {
    const res = await fetch(`/api/trades/${tradeId}`, { method: "DELETE" });
    if (res.ok) {
      setTrades((prev) => prev.filter((t) => t.id !== tradeId));
    }
  } catch {
    // Silently fail — trade stays in list
  }
}
```

**Problem:** On network error → `catch` swallows silently; on non-ok response
(e.g. 500) → trade stays in list but no error message shown. User has no
feedback that deletion failed.

**Impact for Risk #3:** This is a data-consistency issue rather than
data-loss, but a test should verify that a failed delete doesn't remove the
trade from the UI.

### 5. RLS Policies — Uniform and Correct

All five tables (`sessions`, `check_ins`, `session_plans`, `trades`,
`session_reviews`) have identical RLS policy structure:

- **SELECT:** `USING (auth.uid() = user_id)`
- **INSERT:** `WITH CHECK (auth.uid() = user_id)`
- **UPDATE:** `USING (auth.uid() = user_id)` + `WITH CHECK (auth.uid() = user_id)`
- **DELETE:** `USING (auth.uid() = user_id)`

**Migration files:**
- [20260603000000_create_sessions_and_checkins.sql](supabase/migrations/20260603000000_create_sessions_and_checkins.sql)
- [20260609000000_create_plans_and_trades.sql](supabase/migrations/20260609000000_create_plans_and_trades.sql)
- [20260612000000_create_session_reviews.sql](supabase/migrations/20260612000000_create_session_reviews.sql)

**Finding:** RLS insert failures are NOT silent — Supabase returns error code
`42501` with message "new row violates row-level security policy". All
service functions check `if (error) throw error`, so RLS rejections propagate
to the API route's catch block and return 500.

**Gap:** The 500 response doesn't distinguish RLS violations from other
errors. The client shows a generic "Something went wrong" message — the
trader can't tell if their auth expired vs. the database is down.

### 6. `user_id` Handling — Explicit, Correct

All service functions receive `userId` as a parameter from `context.locals.user.id`
(set by middleware). The `user_id` column is always set explicitly in INSERT/UPSERT
payloads:

| Service | Line | Sets `user_id` |
|---------|------|----------------|
| [checkin.ts:21](src/lib/services/checkin.ts#L21) | `getOrCreateTodaySession` | YES |
| [checkin.ts:62-63](src/lib/services/checkin.ts#L62-L63) | `upsertCheckin` | YES |
| [plan.ts:16](src/lib/services/plan.ts#L16) | `upsertPlan` | YES |
| [trades.ts:27](src/lib/services/trades.ts#L27) | `createTrade` | YES |
| [review.ts:17](src/lib/services/review.ts#L17) | `upsertReview` | YES |

No table uses a database default or trigger for `user_id`. The application
always sets it from the authenticated session, which means:
- `auth.uid()` and the `user_id` in the payload will match (same auth context)
- RLS INSERT policies will pass in normal operation
- Mismatch is theoretically possible if middleware auth and Supabase client
  auth diverge (stale cookie between middleware check and DB call) — but
  `@supabase/ssr` handles token refresh, making this unlikely

### 7. Client-Side Error Handling — Consistent but Bare

All four form components follow the same client-side pattern:

| Component | Checks `res.ok` | Shows error | Loading state | Optimistic update | Navigation on success |
|-----------|-----------------|-------------|---------------|-------------------|-----------------------|
| [CheckinForm.tsx](src/components/checkin/CheckinForm.tsx) | YES | YES (inline) | YES | NO | User-initiated link |
| [PlanForm.tsx](src/components/plan/PlanForm.tsx) | YES | YES (inline) | YES | NO | User-initiated link |
| [TradeForm.tsx](src/components/trades/TradeForm.tsx) | YES | YES (inline) | YES | NO | Callback to parent |
| [ReviewForm.tsx](src/components/review/ReviewForm.tsx) | YES | YES (inline) | YES | NO | User-initiated link |

**Good:** No optimistic updates — UI only updates after server confirms.
Navigation is user-initiated (click a link), not automatic redirect, so the
user won't leave the page before seeing the error.

**Gap:** No toast/notification system. No retry mechanism. No success
confirmation beyond showing the result view. Error messages are generic
("Something went wrong").

### 8. Session Creation — Race Condition Handled

**File:** [checkin.ts:4-40](src/lib/services/checkin.ts#L4-L40)

`getOrCreateTodaySession()` handles the `UNIQUE(user_id, session_date)`
constraint by catching error code `23505` (unique violation) and retrying
with a SELECT. This prevents the race condition where two concurrent requests
could try to create today's session simultaneously.

## Code References

- [src/lib/services/review.ts:60-64](src/lib/services/review.ts#L60-L64) — `completeSession()` missing `.select().single()`
- [src/pages/api/review.ts:98-99](src/pages/api/review.ts#L98-L99) — Non-atomic review + session completion
- [src/components/trades/TradesPage.tsx:30-38](src/components/trades/TradesPage.tsx#L30-L38) — Silent delete failure
- [src/lib/services/checkin.ts:58-70](src/lib/services/checkin.ts#L58-L70) — Check-in upsert (correct pattern)
- [src/lib/services/plan.ts:11-22](src/lib/services/plan.ts#L11-L22) — Plan upsert (correct pattern)
- [src/lib/services/trades.ts:23-31](src/lib/services/trades.ts#L23-L31) — Trade insert (correct pattern)
- [src/lib/services/review.ts:12-24](src/lib/services/review.ts#L12-L24) — Review upsert (correct pattern)

## Architecture Insights

1. **Consistent service-layer pattern.** All Supabase writes go through
   `src/lib/services/*.ts` functions that destructure `{ data, error }` and
   throw on error. The `.select().single()` chain is used everywhere *except*
   `completeSession()`, making that one function the odd one out.

2. **No `throwOnError()` usage.** The codebase consistently uses manual
   `if (error) throw error` instead of Supabase's `.throwOnError()`.
   Either pattern works; the manual pattern is fine but requires discipline
   to never forget the check.

3. **No shared fetch utility.** Each React form component duplicates the
   `fetch` + `res.ok` check + error handling pattern. Not a bug, but a
   future candidate for DRY-ing via a hook if more forms are added.

4. **Upsert for idempotent writes.** Check-in, plan, and review all use
   `upsert({ onConflict: "session_id" })`, which makes retries safe — a
   client retry after a 500 will overwrite with the same data, not create
   duplicates. Trade logging uses `insert()` (correctly — each trade is a
   new row).

## Test Implications for Phase 2

Based on these findings, integration tests for Risk #3 should cover:

| # | Scenario | What to assert | Entry point |
|---|----------|----------------|-------------|
| 1 | Happy path: each form submission persists data | After POST returns 2xx, SELECT the row from the database and verify all fields | All 4 API routes |
| 2 | Review submission completes session atomically | After POST `/api/review` returns 200, session status is `"complete"` | [api/review.ts:98-99](src/pages/api/review.ts#L98-L99) |
| 3 | `completeSession()` with wrong sessionId | Function should throw or surface an error, not silently succeed | [review.ts:60-64](src/lib/services/review.ts#L60-L64) |
| 4 | Supabase returns error on insert | API returns 500 with error message; data is NOT in database | Service layer throw path |
| 5 | RLS blocks insert (auth context lost) | API returns 500; data is NOT in database | RLS `WITH CHECK` on all tables |
| 6 | Concurrent session creation (race condition) | Only one session per user per date exists after both requests complete | [checkin.ts:4-40](src/lib/services/checkin.ts#L4-L40) |

## Open Questions (Risk #3)

1. **Should `completeSession()` be fixed before testing, or should the test
   document the current (broken) behavior?** — The missing `.select().single()`
   is arguably a production bug, not just a test gap. A pre-test fix would
   simplify the test matrix.

2. **Is the non-atomic review+completion acceptable, or should it use a
   Supabase RPC (database function) for transactional semantics?** — For
   single-user MVP scale, the partial-success window is small, but the
   inconsistent state is confusing if it happens.

3. **Should the test plan Phase 2 scope include client-side error display
   (trade deletion silent failure), or defer that to a UI-focused phase?** —
   The trade deletion issue is lower severity but confirms Risk #3's
   "silent write failure" concern from a different angle.

---

## Follow-up Research: Risk #5 — Unauthorized data access (IDOR)

**Date**: 2026-06-30
**Question**: Can an authenticated user access another user's session data
by manipulating API resource IDs?

### Summary

The app has **two independent IDOR defense layers** — RLS at the database
level and application-level `user_id` filtering. Both are present and
correct for all write operations. **However, four read functions in the
service layer lack application-level ownership checks**, relying entirely on
RLS for isolation. This is currently unexploitable because callers always
derive `session_id` server-side from authenticated context — but it violates
defense-in-depth and would become exploitable if a future endpoint accepted
`session_id` from user input.

### Defense Layer 1: RLS Policies (Complete)

All 5 tables have SELECT/INSERT/UPDATE/DELETE policies with
`auth.uid() = user_id`:

| Table | SELECT | INSERT | UPDATE | DELETE | Own `user_id` column |
|-------|--------|--------|--------|--------|----------------------|
| `sessions` | `auth.uid() = user_id` | `WITH CHECK` | `USING` + `WITH CHECK` | `USING` | YES |
| `check_ins` | `auth.uid() = user_id` | `WITH CHECK` | `USING` + `WITH CHECK` | `USING` | YES |
| `session_plans` | `auth.uid() = user_id` | `WITH CHECK` | `USING` + `WITH CHECK` | `USING` | YES |
| `trades` | `auth.uid() = user_id` | `WITH CHECK` | `USING` + `WITH CHECK` | `USING` | YES |
| `session_reviews` | `auth.uid() = user_id` | `WITH CHECK` | `USING` + `WITH CHECK` | `USING` | YES |

Key properties:
- Every child table has its **own** `user_id` column — no table relies on
  parent RLS via JOIN
- Only the anon key is used; **no service-role client** exists anywhere in
  `src/` (confirmed by grep)
- No `SUPABASE_SERVICE_ROLE_KEY` declared in `astro.config.mjs`
- `auth.uid()` resolves to `null` for unauthenticated requests → RLS denies
  all access

**Migration files:**
- [20260603000000_create_sessions_and_checkins.sql](supabase/migrations/20260603000000_create_sessions_and_checkins.sql) — `sessions` (lines 21-38), `check_ins` (lines 62-79)
- [20260609000000_create_plans_and_trades.sql](supabase/migrations/20260609000000_create_plans_and_trades.sql) — `session_plans` (lines 13-30), `trades` (lines 51-68)
- [20260612000000_create_session_reviews.sql](supabase/migrations/20260612000000_create_session_reviews.sql) — `session_reviews` (lines 14-31)

### Defense Layer 2: Application-Level Ownership Checks

#### Write operations — ALL have `user_id` scoping

| Function | File:Line | Filters by `user_id` | IDOR-safe |
|----------|-----------|----------------------|-----------|
| `upsertCheckin()` | [checkin.ts:50-74](src/lib/services/checkin.ts#L50-L74) | YES — sets `user_id: userId` | YES |
| `upsertPlan()` | [plan.ts:4-27](src/lib/services/plan.ts#L4-L27) | YES — sets `user_id: userId` | YES |
| `createTrade()` | [trades.ts:16-36](src/lib/services/trades.ts#L16-L36) | YES — sets `user_id: userId` | YES |
| `updateTrade()` | [trades.ts:38-56](src/lib/services/trades.ts#L38-L56) | YES — `.eq("user_id", userId)` | YES |
| `deleteTrade()` | [trades.ts:58-62](src/lib/services/trades.ts#L58-L62) | YES — `.eq("user_id", userId)` | YES |
| `upsertReview()` | [review.ts:4-28](src/lib/services/review.ts#L4-L28) | YES — sets `user_id: userId` | YES |
| `getOrCreateTodaySession()` | [checkin.ts:4-40](src/lib/services/checkin.ts#L4-L40) | YES — `.eq("user_id", userId)` | YES |
| `getSessionById()` | [sessions.ts:34-60](src/lib/services/sessions.ts#L34-L60) | YES — `.eq("user_id", userId)` | YES |
| `getSessionHistory()` | [sessions.ts:8-32](src/lib/services/sessions.ts#L8-L32) | YES — `.eq("user_id", userId)` | YES |

#### Read operations — FOUR functions lack `user_id` parameter

| Function | File:Line | Filters | Missing | IDOR-safe at function level |
|----------|-----------|---------|---------|----------------------------|
| `getCheckinBySession()` | [checkin.ts:42-48](src/lib/services/checkin.ts#L42-L48) | `session_id` only | `user_id` | NO |
| `getPlanBySession()` | [plan.ts:29-37](src/lib/services/plan.ts#L29-L37) | `session_id` only | `user_id` | NO |
| `getTradesBySession()` | [trades.ts:4-14](src/lib/services/trades.ts#L4-L14) | `session_id` only | `user_id` | NO |
| `getReviewBySession()` | [review.ts:30-36](src/lib/services/review.ts#L30-L36) | `session_id` only | `user_id` | NO |

And the already-identified:

| `completeSession()` | [review.ts:60-64](src/lib/services/review.ts#L60-L64) | `session_id` only | `user_id` | NO |

**Why this is currently safe:** All callers first derive `session_id` from
a user-scoped query (`getOrCreateTodaySession` or `getSessionById`), so the
`session_id` is guaranteed to belong to the authenticated user before these
functions are called. The call chains:

- `dashboard.astro` → fetches session with `.eq("user_id", user.id)` → then
  calls `getCheckinBySession(session.id)` — safe because session was scoped
- `api/review.ts` → calls `getOrCreateTodaySession(supabase, user.id)` →
  then `getCheckinBySession(session.id)` — safe for the same reason
- `history/[id].astro` → calls `getSessionById(supabase, id, user.id)` →
  then detail-loading functions — safe because ownership was verified

**Why this is still a gap:** These functions trust their callers to have
verified ownership. If a future endpoint passes a `session_id` from user
input (request body, URL parameter) directly to these functions, the IDOR
is immediately exploitable. RLS would still block the query at the database
level, but relying on a single defense layer is fragile.

### Attack Surface: API Endpoints

| Endpoint | Accepts external IDs | Ownership verified | IDOR exploitable |
|----------|----------------------|-------------------|-----------------|
| `POST /api/checkin` | NO — session derived server-side | YES | NO |
| `POST /api/plan` | NO — session derived server-side | YES | NO |
| `POST /api/trades` | NO — session derived server-side | YES | NO |
| `PUT /api/trades/[id]` | YES — `tradeId` from URL | YES — `.eq("user_id")` | NO |
| `DELETE /api/trades/[id]` | YES — `tradeId` from URL | YES — `.eq("user_id")` | NO |
| `POST /api/review` | NO — session derived server-side | YES | NO |

### Attack Surface: Astro Pages (SSR)

| Page | Accepts external IDs | Ownership verified | IDOR exploitable |
|------|----------------------|-------------------|-----------------|
| `/dashboard` | NO | YES — `.eq("user_id")` | NO |
| `/checkin` | NO | YES — `getTodayCheckin(userId)` | NO |
| `/plan` | NO | YES — `getTodayPlan(userId)` | NO |
| `/trades` | NO | YES — `getOrCreateTodaySession(userId)` | NO |
| `/review` | NO | YES — `getTodayReview(userId)` | NO |
| `/history` | NO | YES — `getSessionHistory(userId)` | NO |
| `/history/[id]` | YES — `id` from URL | YES — `getSessionById(id, userId)` | NO |

### Schema-Level Gap: No Cross-User FK Constraint

There is no database constraint enforcing that `child.user_id` must match
`sessions.user_id` for the referenced `session_id`. For example:

- `check_ins` has `session_id` FK → `sessions` and its own `user_id` FK → `auth.users`
- Nothing prevents inserting a check-in with `user_id = attacker` and
  `session_id = victim's session`

**Current protection:** The app always derives `session_id` server-side
from the authenticated user, so the attacker never controls `session_id`.
**Risk if that changes:** A future endpoint accepting `session_id` from user
input could create cross-user data linkage (attacker's check-in attached to
victim's session). RLS INSERT allows this because it only checks
`auth.uid() = user_id` on the inserted row's `user_id`, not the FK target.

### Test Implications for Phase 2 (Risk #5)

| # | Scenario | What to assert | Layer tested |
|---|----------|----------------|--------------|
| 1 | User A cannot SELECT User B's sessions | Query returns empty/null, not User B's data | RLS SELECT policy |
| 2 | User A cannot SELECT User B's check-ins/plans/trades/reviews | Same — RLS blocks even if attacker knows `session_id` | RLS SELECT on child tables |
| 3 | User A cannot UPDATE User B's trade via `PUT /api/trades/[id]` | 404 or error response, trade unchanged | Application + RLS |
| 4 | User A cannot DELETE User B's trade via `DELETE /api/trades/[id]` | Error response, trade still exists | Application + RLS |
| 5 | `/history/[id]` with User B's session ID returns 404 for User A | Page renders 404, no data leaked | Application (`.eq("user_id")`) |
| 6 | User A cannot INSERT a check-in linked to User B's session | Insert fails or check-in has User A's user_id (not User B's) | RLS INSERT + application |

### Anti-Pattern from Test Plan

The test plan warns: *"Testing only the owner path — verifying owner CAN
access but never that a non-owner CANNOT."* Every test above MUST include
a negative assertion: a second authenticated user who attempts the same
operation and fails.

## Open Questions (Risk #5)

4. **Should the four read functions add `userId` parameters for
   defense-in-depth?** — Adding `.eq("user_id", userId)` to
   `getCheckinBySession`, `getPlanBySession`, `getTradesBySession`,
   `getReviewBySession` would make them self-protecting. This is a code
   change, not just a test — decide before Phase 2 planning.

5. **Should a database trigger enforce `child.user_id = sessions.user_id`
   on FK inserts?** — This would close the schema-level gap at the database
   level. Low priority given current app-layer protection, but worth
   considering for defense-in-depth.

6. **How to test RLS in integration tests — two real Supabase users, or
   mock the auth context?** — Real users provide the strongest signal (RLS
   actually evaluated) but add test infrastructure complexity. This is a
   Phase 2 planning decision.
