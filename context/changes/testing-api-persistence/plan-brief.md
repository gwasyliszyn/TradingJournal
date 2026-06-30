# Test Phase 2 — API Persistence + Access Control — Plan Brief

> Full plan: `context/changes/testing-api-persistence/plan.md`
> Research: `context/changes/testing-api-persistence/research.md`

## What & Why

Integration tests proving that form submissions persist data to the database (Risk #3) and that RLS prevents cross-user access (Risk #5). The PRD guardrail states "session data must never be lost" and the NFR requires "session data visible only to the authenticated account owner" — these tests are the concrete verification of both guarantees.

## Starting Point

No test infrastructure exists — no vitest, no test files, no test scripts. Phase 1 (vitest bootstrap) hasn't shipped. Local Supabase is configured with migrations and RLS policies in place. The research identified one production bug (`completeSession()` missing write verification) and four read functions that lack application-level user scoping (relying solely on RLS).

## Desired End State

`npm test` runs 12 integration tests against a local Supabase instance. Tests use two real authenticated users — every IDOR test proves both that the owner CAN access and a non-owner CANNOT. `completeSession()` is fixed to catch zero-row matches. All tests pass in under 30 seconds.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-------------------|--------|
| Vitest bootstrap | Include in Phase 2 | Phase 1 hasn't shipped; no reason to wait | Plan |
| Bug fix scope | Fix `completeSession`, defer trade delete | Server bug is 2 lines; testing broken code wastes test budget | Plan |
| Auth strategy | Two real test users on local Supabase | RLS must be actually evaluated by PostgreSQL, not mocked | Plan |
| Test level | Service layer with real Supabase client | Strongest persistence/RLS signal without needing HTTP server | Plan |
| Read function refactor | Don't change, test RLS as-is | Smaller scope; tests validate the actual defense (RLS) | Plan |
| Test isolation | Unique session dates + cleanup in afterEach | Parallel-safe, no database reset needed | Plan |

## Scope

**In scope:**
- Vitest installation + config + test scripts
- Test helpers (authenticated clients, admin client, cleanup)
- `completeSession()` bug fix (add `userId` + `.select().single()`)
- 6 persistence tests (Risk #3): happy path for all 4 forms, completion atomicity, upsert idempotency
- 6 access control tests (Risk #5): cross-user read/write/delete blocked by RLS

**Out of scope:**
- Unit tests for score formulas (Phase 1 of test plan)
- Adding `userId` to read functions (defense-in-depth refactor, separate change)
- Trade deletion silent failure fix (client-side, Phase 3)
- CI gate (Phase 3 of test plan)
- API route-level tests (middleware, validation)

## Architecture / Approach

Tests call service functions (`upsertCheckin`, `createTrade`, etc.) directly, passing a `SupabaseClient` created via `@supabase/supabase-js` and authenticated with `signInWithPassword`. RLS is enforced because the client uses the anon key. A service-role admin client handles setup/cleanup (RLS bypassed). No Astro server needed — the service layer is the test boundary.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Infrastructure + fix | vitest, helpers, `completeSession` fix | `.env.test` misconfigured or local Supabase not running |
| 2. Persistence tests | 6 tests proving data lands after form submission | Test isolation — unique session dates must prevent cross-test pollution |
| 3. Access control tests | 6 tests proving RLS blocks cross-user access | Two-user setup complexity; both positive and negative assertions required |

**Prerequisites:** Local Supabase running (`supabase start`), migrations applied, `.env.test` populated from `supabase status` output.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- Local Supabase must be running before tests execute — no auto-start. If forgotten, tests fail with connection errors.
- Test user sign-up via `auth.signUp` is idempotent only if `enable_confirmations = false` (currently true in `supabase/config.toml`).
- The `@` path alias must resolve in vitest the same way it does in Astro's build — if not, imports in service functions will break at test time.

## Success Criteria (Summary)

- `npx vitest run` exits 0 with all 12 tests passing
- Every IDOR test has both a positive (owner) and negative (non-owner) assertion
- `npm run build` still passes (no regressions from the `completeSession` fix)
