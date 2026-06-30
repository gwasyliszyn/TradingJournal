# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (sections 1-5); cookbook patterns at the bottom (section 6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see section 8).
>
> Last updated: 2026-06-16

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost x signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   user is worried about X, and the failure would surface somewhere in
   area Y" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (14 commits/30d).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact x likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see section 1 principle 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence) |
|---|-------------------------|--------|------------|-------------------|
| 1 | Process Score miscalculation — formula computes wrong, trader gets false "good/bad process day" signal | High | High | PRD Business Logic (Process Score formula), interview Q1 (top worry) + Q3 (low confidence area), hot-spot dir `src/lib/services` (11 changes/30d) |
| 2 | Readiness Score miscalculation — average-of-ratings formula drifts, trader gets wrong readiness signal before trading | High | Medium | PRD Business Logic (Readiness Score formula), interview Q1 + Q3, hot-spot dir `src/lib/services` |
| 3 | Session data loss on form submission — trader completes the loop but data doesn't persist (API error, silent write failure, RLS blocks insert) | High | Medium | PRD Guardrails ("session data must never be lost"), roadmap S-01 through S-03 (3 separate form submissions) |
| 4 | Auth/middleware regression — unauthenticated user reaches protected route, or authenticated user hits redirect loop | High | Medium | PRD Access Control, AGENTS.md (middleware lifecycle), hot-spot dir `src/` — middleware 6 changes/30d |
| 5 | Unauthorized data access (IDOR) — authenticated user accesses another user's sessions by manipulating API IDs | High | Low | PRD NFR ("session data visible only to authenticated account owner"), abuse lens (authorization/access) |
| 6 | Dashboard shows wrong session status — Today View aggregates data from all loop steps incorrectly, trader sees misleading completion state | Medium | Medium | Roadmap S-04, hot-spot dir `src/pages` (13 changes/30d, dashboard highest-churn file) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Given session data with known check-in/plan/trades/review values, Process Score matches PRD formula deterministically | "Current code matches the PRD formula" — test oracle must come from the PRD spec, not from reading the implementation | Process Score function entry point, which fields it consumes, how it handles missing steps (no plan, no trades) | Unit test | Oracle problem — copying the formula from implementation into the test assertion; expected values must derive from the PRD formula independently |
| #2 | Given check-in inputs (sleep, energy, focus, stress each 1-5), Readiness Score equals the PRD formula with correct boundary behavior (all 1s, all 5s) | "Simple formula = no bugs" — boundary values and the stress inversion (6 minus stress) are easy to get wrong | Readiness Score function signature, input domain, stress inversion logic | Unit test | Oracle problem — same as Risk 1; also happy-path-only (testing mid-range values, missing boundaries) |
| #3 | After submitting each form (check-in, plan, trade, review), data is retrievable from the database for the authenticated user | "Successful API response means data persisted" — a 200 response does not prove the write landed | API route handlers, Supabase client usage, error handling on failed writes, RLS insert policies | Integration test | Happy-path-only — testing only success, never what happens when Supabase returns an error |
| #4 | Unauthenticated requests to protected routes redirect to /auth/signin; authenticated requests pass through with user attached | "PROTECTED_ROUTES list covers all protected pages" — the list must match actual protected pages | Middleware implementation, PROTECTED_ROUTES list, cookie/session handling | Integration test | Over-mocking — mocking Supabase auth to always succeed, never testing the unauthenticated path |
| #5 | An authenticated user cannot read or modify another user's session data via API endpoints that accept resource IDs | "RLS is enabled, so we're safe" — RLS policies must be verified to actually filter by auth.uid() on all tables | RLS policies on all tables, API routes accepting ID params, how Supabase client passes auth context | Integration test | Testing only the owner path — verifying owner CAN access but never that a non-owner CANNOT |
| #6 | Dashboard reflects correct completion state for each loop step, including partial sessions (check-in done, no plan yet) | "If individual steps work, the dashboard works" — the aggregation/query logic may have its own bugs | How dashboard queries session state, what service/query it uses to aggregate step completion | Integration test | Snapshot-without-meaning — snapshotting dashboard output without asserting specific status values |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|-----------|-----------------|---------------|------------|--------|---------------|
| 1 | Score logic + test runner bootstrap | Prove Process Score and Readiness Score formulas match PRD spec; bootstrap vitest | #1, #2 | unit | change opened | context/changes/testing-score-logic/ |
| 2 | API persistence + access control | Prove form submissions persist data and RLS prevents cross-user access | #3, #5 | integration | not started | — |
| 3 | Auth middleware + dashboard status + CI gate | Prove route protection works, dashboard aggregates correctly; wire tests into CI | #4, #6 | integration, CI gate | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | none yet — see Phase 1 | Bootstrapped by Phase 1; natural fit for Astro/Vite project |
| API mocking | none yet — see Phase 2 | — | Evaluate during Phase 2 research (MSW or direct Supabase test client) |
| e2e | none yet | — | Not planned for initial rollout; evaluate if integration tests prove insufficient |
| accessibility | none yet | — | Not in scope for initial rollout |

**Stack grounding tools (current session):**
- Docs: none available in current session; checked: 2026-06-16
- Search: WebSearch (deferred) — available, not used; checked: 2026-06-16
- Runtime/browser: none; checked: 2026-06-16
- Provider/platform: IDE getDiagnostics — marginal relevance; checked: 2026-06-16

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| unit tests | local + CI | required after Phase 1 | score logic regressions |
| integration tests | local + CI | required after Phase 2 | data persistence and access control regressions |
| CI test gate | CI on PR | required after Phase 3 | prevents merging without passing tests |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see Phase N."

### 6.1 Adding a unit test

TBD — see Phase 1 for score logic / pure-function test pattern.

### 6.2 Adding an integration test

TBD — see Phase 2 for API persistence / access control test pattern.

### 6.3 Adding a test for a new API endpoint

TBD — see Phase 2 for the API route integration test pattern.

### 6.4 Per-rollout-phase notes

(After each phase lands, the final sub-phase appends a 2-3 line note
here capturing anything surprising the rollout phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI component rendering (shadcn/ui snapshots)** — these are library
  components; testing them is testing someone else's code. Re-evaluate if
  the project adds custom base components that override library behavior.
  (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (sections 1-5) last reviewed: 2026-06-16
- Stack versions last verified: 2026-06-16
- AI-native tool references last verified: n/a (none in use)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- section 7 negative-space no longer matches what the team believes.
