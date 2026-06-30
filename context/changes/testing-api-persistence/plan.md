# Test Phase 2 — API Persistence + Access Control Implementation Plan

## Overview

Bootstrap vitest, fix the `completeSession()` bug, then write integration tests for Risk #3 (session data loss on form submission) and Risk #5 (unauthorized data access / IDOR). Tests call service-layer functions directly with real Supabase clients authenticated as two test users against a local Supabase instance, so RLS policies are actually evaluated by PostgreSQL.

## Current State Analysis

- **No test infrastructure exists.** No vitest, no test files, no test scripts. Phase 1 (test runner bootstrap) hasn't shipped — its change folder doesn't exist despite being listed as "change opened" in the test plan.
- **Local Supabase is configured.** `supabase/config.toml` has `enable_confirmations = false`, making test user creation trivial (no email verification). Migrations are in place. Seed file referenced but doesn't exist.
- **Service functions accept `SupabaseClient` as a parameter.** This means tests can create clients via `@supabase/supabase-js` (already installed) and pass them directly — no need to mock Astro's SSR client factory.
- **One production bug identified.** `completeSession()` in `src/lib/services/review.ts:60-64` is missing `.select().single()` and `userId` — a zero-row match returns no error, silently leaving sessions in "active" state.

### Key Discoveries:

- All write operations use `.select().single()` to verify writes landed — except `completeSession()` ([review.ts:60-64](src/lib/services/review.ts#L60-L64))
- RLS policies are complete and correct on all 5 tables; no service-role client exists in the app code
- Four read functions (`getCheckinBySession`, `getPlanBySession`, `getTradesBySession`, `getReviewBySession`) lack `userId` filtering — safe today because callers scope `sessionId` upstream, but RLS is the sole defense for reads
- `@supabase/supabase-js` v2.99.1 is already a dependency — test clients can use `createClient` + `signInWithPassword` directly

## Desired End State

After this plan is complete:

1. `npm test` runs vitest and executes integration tests that prove form submission data persists and RLS prevents cross-user access.
2. `completeSession()` uses `.select().single()` with a `userId` filter, so a zero-row match is caught as an error.
3. The 12 test scenarios from the research document (6 for Risk #3, 6 for Risk #5) have passing integration tests against a local Supabase instance.

Verification: `npx vitest run` exits 0 with all tests passing. `npm run build` still succeeds.

## What We're NOT Doing

- **Not adding `userId` to the 4 read functions** — tests verify RLS blocks cross-user reads as-is. Defense-in-depth refactor is a separate change.
- **Not fixing trade deletion silent failure** — that's a client-side React concern, deferred to Phase 3.
- **Not writing unit tests for score logic** — that's Phase 1's scope, which can be done separately using the vitest infrastructure this phase bootstraps.
- **Not setting up CI** — that's Phase 3 of the test plan.
- **Not testing at the API route level** (HTTP requests) — service-layer tests with real Supabase clients give the strongest signal for persistence and RLS without needing an Astro test server.

## Implementation Approach

Three phases: infrastructure first, then persistence tests, then access control tests. Each phase has a clear pause point for manual verification before proceeding.

The test pattern for every integration test:
1. **Arrange**: Create a session with a unique `session_date` (using the test user's authenticated Supabase client) to isolate from other tests.
2. **Act**: Call the service function under test.
3. **Assert**: Query the database to verify the expected state.
4. **Cleanup**: Delete all test data for the user via a service-role admin client in `afterEach`.

---

## Phase 1: Test Infrastructure Bootstrap + `completeSession` Fix

### Overview

Install vitest, create test helpers for Supabase client management and data cleanup, add npm scripts, and fix the `completeSession()` bug so all subsequent tests verify correct behavior.

### Changes Required:

#### 1. Install vitest

**File**: `package.json`

**Intent**: Add vitest as a dev dependency and create test scripts so `npm test` runs the integration suite.

**Contract**: Add `vitest` to `devDependencies`. Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

#### 2. Create vitest configuration

**File**: `vitest.config.ts` (new)

**Intent**: Configure vitest to find test files under `tests/`, resolve the `@/*` path alias to `./src/*`, and load environment variables from `.env.test`.

**Contract**: `defineConfig` from `vitest/config` with `resolve.alias` mapping `@` → `./src`, and `test.include` set to `['tests/**/*.test.ts']`. File timeout should be generous (30s) since tests hit a real database.

#### 3. Create environment file for tests

**File**: `.env.test` (new, gitignored)

**Intent**: Provide Supabase connection details for the local instance. Three variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — all from `supabase status` output.

**Contract**: `.env.test` is added to `.gitignore`. A `.env.test.example` is created (checked in) with placeholder values and a comment pointing to `supabase status` for real values.

#### 4. Create Supabase test helpers

**File**: `tests/helpers/supabase.ts` (new)

**Intent**: Factory functions that create Supabase clients for tests — one authenticated as a specific user (with RLS enforced via anon key), and one admin client (service-role key, RLS bypassed) for setup/cleanup.

**Contract**: Exports:
- `createAuthenticatedClient(email, password)` → `Promise<SupabaseClient>` — uses `createClient` from `@supabase/supabase-js` with anon key, calls `signInWithPassword`, throws on auth failure.
- `createAdminClient()` → `SupabaseClient` — uses service-role key, RLS bypassed. For cleanup only.

#### 5. Create test setup and cleanup utilities

**File**: `tests/helpers/setup.ts` (new)

**Intent**: Shared constants for test users and helper functions for creating sessions (with unique dates for isolation) and cleaning up all test data. Used in `beforeAll`/`afterEach` hooks across test files.

**Contract**: Exports:
- `TEST_USER_A` / `TEST_USER_B` — objects with `email` and `password` fields.
- `ensureTestUsers()` → `Promise<void>` — signs up both test users via `auth.signUp` (idempotent — ignores "already registered" errors). Called once in `beforeAll`.
- `createTestSession(client, userId, dateString)` → `Promise<Session>` — inserts a session with a specific date (for isolation). Each test uses a unique date like `'2020-01-01'`, `'2020-01-02'`, etc.
- `cleanupUserData(adminClient, userId)` → `Promise<void>` — deletes all rows for a user across all tables in correct FK order: `session_reviews` → `trades` → `session_plans` → `check_ins` → `sessions`.

#### 6. Fix `completeSession()` — add write verification and user scoping

**File**: `src/lib/services/review.ts`

**Intent**: The current `completeSession()` filters only by `sessionId` without verifying the update matched a row. Add a `userId` parameter and `.select().single()` so that a zero-row match (wrong ID or RLS block) throws an error instead of silently succeeding.

**Contract**: Function signature changes from `(supabase, sessionId)` to `(supabase, sessionId, userId)`. The Supabase query adds `.eq("user_id", userId).select().single()`. Return type stays `Promise<void>`.

#### 7. Update `completeSession` caller

**File**: `src/pages/api/review.ts`

**Intent**: Pass the authenticated user's ID to the updated `completeSession` function.

**Contract**: Line 99 changes from `await completeSession(supabase, session.id)` to `await completeSession(supabase, session.id, user.id)`.

### Success Criteria:

#### Automated Verification:

- `npm install` completes without errors
- `npx vitest run` executes and exits 0 (no test files yet is OK — no failures)
- `npm run build` passes (no regressions from `completeSession` fix)
- `npx astro check` passes (TypeScript compiles)
- `npm run lint` passes

#### Manual Verification:

- `supabase start` runs successfully and `supabase status` shows the local instance
- `.env.test` contains valid values from `supabase status` output
- Importing `tests/helpers/supabase.ts` and calling `createAuthenticatedClient` with test user credentials returns a working client (quick smoke check in a scratch test file)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Risk #3 — Data Persistence Tests

### Overview

Write integration tests that prove each of the four form submissions (check-in, plan, trade, review) persists data retrievable from the database, and that session completion leaves consistent state.

### Changes Required:

#### 1. Data persistence test file

**File**: `tests/integration/data-persistence.test.ts` (new)

**Intent**: Integration tests covering the 6 Risk #3 scenarios from the research document. Each test creates an isolated session (unique date), calls a service function with an authenticated client, then queries the database to verify the data landed with correct field values.

**Contract**: A single `describe("Risk #3: Data persistence")` block containing:

**Test 1 — Check-in persists after upsert:**
Call `upsertCheckin()` with known form data and readiness score. Then call `getCheckinBySession()` and assert all fields match: sleep, energy, stress, focus, emotion, market_bias, risk_mode, readiness_score.

**Test 2 — Plan persists after upsert:**
Call `upsertPlan()` with known form data. Then call `getPlanBySession()` and assert: goal, max_trades, max_daily_loss_r.

**Test 3 — Trade persists after insert:**
Call `createTrade()` with known form data. Then call `getTradesBySession()` and assert the trade appears with correct: instrument, setup_name, result_r, plan_compliance, main_mistake.

**Test 4 — Review persists after upsert and session completes:**
Call `upsertReview()` with known form data and process score, then `completeSession()`. Assert: review fields match, AND `session.status === "complete"`.

**Test 5 — Session completion is verified (non-existent session throws):**
Call `completeSession()` with a random UUID that doesn't exist. Assert it throws an error (the `.select().single()` fix from Phase 1 catches this).

**Test 6 — Upsert is idempotent (retry-safe):**
Call `upsertCheckin()` twice with the same session. Assert only one `check_in` row exists (no duplicate), and the second call's data wins.

Each test uses `afterEach` → `cleanupUserData()` for isolation.

### Success Criteria:

#### Automated Verification:

- `npx vitest run tests/integration/data-persistence.test.ts` — all 6 tests pass
- `npm run lint` passes (test file follows project lint rules)

#### Manual Verification:

- Review test output to confirm each form type (check-in, plan, trade, review) is covered
- Review test assertions to confirm they verify field values, not just row existence (avoids the test-plan anti-pattern: "happy-path-only")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Risk #5 — Access Control Tests

### Overview

Write integration tests that prove an authenticated user cannot read or modify another user's session data. Tests use two authenticated clients (User A and User B) — User A creates data, User B attempts to access it and fails. Every test includes both a positive assertion (owner CAN access) and a negative assertion (non-owner CANNOT), per the test plan's anti-pattern warning.

### Changes Required:

#### 1. Access control test file

**File**: `tests/integration/access-control.test.ts` (new)

**Intent**: Integration tests covering the 6 Risk #5 scenarios from the research document. Tests prove RLS actually blocks cross-user operations at the PostgreSQL level, not via mocking.

**Contract**: A single `describe("Risk #5: Access control (IDOR)")` block with a `beforeAll` that creates User A's session + check-in + plan + trade + review (full loop), and User B's authenticated client.

**Test 1 — User B cannot read User A's sessions:**
User A queries sessions → gets data. User B queries the same session ID → gets null/empty (RLS blocks SELECT).

**Test 2 — User B cannot read User A's check-in by session ID:**
Call `getCheckinBySession(clientB, userASessionId)` → returns null. Verify User A calling the same function returns data.

**Test 3 — User B cannot read User A's plan, trades, or review:**
Same pattern as Test 2 for `getPlanBySession`, `getTradesBySession`, `getReviewBySession`. Can be parameterized or separate test cases.

**Test 4 — User B cannot update User A's trade:**
Call `updateTrade(clientB, userATradeId, userBId, newData)` → throws error. Verify the trade is unchanged by querying as User A.

**Test 5 — User B cannot delete User A's trade:**
Call `deleteTrade(clientB, userATradeId, userBId)` → throws error. Verify the trade still exists by querying as User A.

**Test 6 — User B cannot complete User A's session:**
Call `completeSession(clientB, userASessionId, userBId)` → throws error (the Phase 1 fix ensures this). Verify session status is still "active" by querying as User A.

Cleanup in `afterAll` — delete User A's and User B's test data.

### Success Criteria:

#### Automated Verification:

- `npx vitest run tests/integration/access-control.test.ts` — all 6 tests pass
- `npx vitest run` — full suite (both test files) passes
- `npm run lint` passes

#### Manual Verification:

- Review test output to confirm each test has BOTH a positive assertion (owner succeeds) and a negative assertion (non-owner fails)
- Verify no test uses mocked auth — all tests use real Supabase clients with real RLS evaluation

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Integration Tests (this plan):

- Check-in, plan, trade, review: happy-path persistence with field-level assertions
- Session completion: atomicity and error on non-existent session
- Upsert idempotency: retry-safe writes
- IDOR: cross-user read/write/delete blocked by RLS (6 negative tests)

### Not in scope (future phases):

- Unit tests for score formulas (Phase 1 of test plan)
- API route-level tests (middleware, validation, HTTP status codes)
- CI gate (Phase 3 of test plan)
- Client-side error display (trade deletion silent failure)

## Performance Considerations

- Tests hit a real local Supabase instance — expect ~50-100ms per database round-trip.
- `afterEach` cleanup adds overhead but prevents cross-test pollution.
- Total suite should run in under 30 seconds for 12 tests.

## References

- Research: `context/changes/testing-api-persistence/research.md`
- Test plan: `context/foundation/test-plan.md` (Phase 2, Risks #3 and #5)
- PRD guardrail: "Session data must never be lost" (PRD section: Guardrails)
- PRD NFR: "Session data is visible only to the authenticated account owner"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test Infrastructure Bootstrap + completeSession Fix

#### Automated

- [x] 1.1 `npm install` completes without errors — 7f4b7d0
- [x] 1.2 `npx vitest run` executes and exits 0 — 7f4b7d0
- [x] 1.3 `npm run build` passes — 7f4b7d0
- [x] 1.4 `npx astro check` passes — 7f4b7d0
- [x] 1.5 `npm run lint` passes — 7f4b7d0

#### Manual

- [ ] 1.6 `supabase start` runs and `.env.test` has valid values
- [ ] 1.7 `createAuthenticatedClient` returns a working client

### Phase 2: Risk #3 — Data Persistence Tests

#### Automated

- [x] 2.1 `npx vitest run tests/integration/data-persistence.test.ts` — all 6 tests pass — f88a2a7
- [x] 2.2 `npm run lint` passes — f88a2a7

#### Manual

- [ ] 2.3 Each form type covered with field-level assertions (not just row existence)

### Phase 3: Risk #5 — Access Control Tests

#### Automated

- [x] 3.1 `npx vitest run tests/integration/access-control.test.ts` — all 6 tests pass — dd25d71
- [x] 3.2 `npx vitest run` — full suite passes — dd25d71
- [x] 3.3 `npm run lint` passes — dd25d71

#### Manual

- [ ] 3.4 Every test has both positive (owner) and negative (non-owner) assertions
- [ ] 3.5 No mocked auth — all tests use real Supabase clients
