<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session Plan and Trade Logging

- **Plan**: context/changes/s-02/plan.md
- **Scope**: Phase 1–4 of 4
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 3 warnings · 5 observations

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

### F1 — numeric(5,2) returns string, but types declare number

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/types.ts:56,64 → src/components/trades/TradeList.tsx:37, src/components/plan/PlanForm.tsx:149
- **Detail**: Postgres numeric(5,2) columns (max_daily_loss_r, result_r) are returned as strings by Supabase JS / PostgREST. The TypeScript interfaces declare them as `number`, and downstream code calls `.toFixed(2)` on these values — which throws TypeError at runtime because strings don't have `.toFixed()`. This pattern did not exist in S-01 because readiness_score is smallint (returned as number).
- **Fix A ⭐ Recommended**: Coerce in service layer — `{ ...data, result_r: Number(data.result_r) }` in plan.ts and trades.ts return paths.
  - Strength: No migration change, isolates the fix to plan.ts and trades.ts.
  - Tradeoff: Adds manual coercion steps that could be forgotten for future numeric columns.
  - Confidence: HIGH — standard PostgREST behavior, well-documented.
  - Blind spot: None significant.
- **Fix B**: Change DB column type to real/double precision.
  - Strength: Supabase returns real/float as JS numbers natively, eliminating the mismatch at the source.
  - Tradeoff: Requires a new migration; loses exact decimal precision (floating-point arithmetic). 0.25R step increments could introduce rounding artifacts.
  - Confidence: MEDIUM — haven't checked if CHECK constraints depend on exact decimal comparison.
  - Blind spot: Floating-point rounding in CHECK constraints.
- **Decision**: FIXED via Fix A — coerced numeric columns in plan.ts and trades.ts service return paths

### F2 — NaN and Infinity pass API validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/plan.ts:22, src/pages/api/trades.ts:23, src/pages/api/trades/[id].ts:24
- **Detail**: Validation checks `typeof x !== "number"` which passes NaN and Infinity (both have typeof "number"). The `> 0` check also passes Infinity. These values would cause a Postgres error (500) instead of a clean 400 validation error.
- **Fix**: Add `!Number.isFinite(value)` to numeric validation checks in all three API files.
- **Decision**: SKIPPED

### F3 — validateTradeData duplicated across two API files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/trades.ts:8-44, src/pages/api/trades/[id].ts:9-45
- **Detail**: The validateTradeData function is copy-pasted identically between the two trade API files. S-01 didn't face this (single API file), but the duplication means validation rule changes must be applied in two places.
- **Fix**: Extract to src/lib/services/trades.ts alongside the service functions, or a shared validation helper.
- **Decision**: SKIPPED

### F4 — deleteTrade silently succeeds when trade doesn't exist

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/trades.ts:55-58
- **Detail**: DELETE succeeds silently (no row count check) unlike updateTrade which uses .single(). Acceptable as idempotent REST semantics — the UI only shows delete buttons for existing trades.
- **Fix**: Add `.select().single()` after `.delete()` if "trade not found" feedback is desired. Otherwise accept as-is.
- **Decision**: FIXED — added .select().single() to deleteTrade for consistency with updateTrade

### F5 — trades.astro creates session as side effect of page load

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/trades.astro:17
- **Detail**: Uses getOrCreateTodaySession() (write) instead of a read-only lookup. Intentional — TradesPage needs sessionId to pass to the API for creating new trades. Without a session, the trade creation flow would fail.
- **Fix**: Acceptable as-is. The trade-off is correct.
- **Decision**: SKIPPED — accepted as intentional design

### F6 — Dashboard makes 3 redundant session lookups

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:23,32,38
- **Detail**: Each of getTodayCheckin/getTodayPlan/getTodayTrades independently queries the sessions table (6 queries total vs optimal 4). Acceptable for single-user MVP.
- **Fix**: If performance becomes a concern, fetch session once and pass ID to getCheckinBySession/getPlanBySession/getTradesBySession.
- **Decision**: FIXED — single session lookup + Promise.all for child queries (4 queries instead of 6)

### F7 — TradeForm declares unused sessionId prop

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/trades/TradeForm.tsx:16,19
- **Detail**: sessionId is declared in TradeFormProps but not destructured or used in the component body. Dead code — the API determines session server-side via getOrCreateTodaySession.
- **Fix**: Remove sessionId from TradeFormProps and stop passing it from TradesPage.
- **Decision**: SKIPPED

### F8 — GoalSelector/MistakeSelector can hold stale value on Custom switch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/GoalSelector.tsx:43-47, src/components/trades/MistakeSelector.tsx:43-47
- **Detail**: Clicking "Custom" without typing anything leaves the parent state holding the previously selected predefined value. Visually blank input but submits the old value. Minor UX inconsistency.
- **Fix**: When "Custom" is clicked, call onChange("") to clear the parent state, forcing the user to type before submission is enabled.
- **Decision**: FIXED — onChange("") called when switching to Custom to clear stale parent value
