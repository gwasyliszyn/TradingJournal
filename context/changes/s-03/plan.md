# Post-Session Review + Process Score — Implementation Plan

## Overview

Build the third and north-star slice of the Trading Discipline System: a post-session review form (plan adherence, what went wrong, rule broken, goal for next session) and a deterministic Process Score (0–100) computed from session completeness and plan adherence data. Submitting the review auto-completes the session. The trader sees a score breakdown showing exactly which components earned or lost points — the core product insight that shifts focus from P&L to process quality.

## Current State Analysis

S-01 (check-in + readiness score) and S-02 (plan + trade logging) are implemented. The app has:
- `sessions` table with status `'active' | 'complete' | 'incomplete'`
- `check_ins` table (one-to-one with session, upsert semantics)
- `session_plans` table (one-to-one with session, upsert semantics) with `max_daily_loss_r`
- `trades` table (one-to-many with session) with `result_r` and `plan_compliance` columns
- Service layer in `src/lib/services/` with `checkin.ts`, `plan.ts`, `trades.ts`, `readiness-score.ts`
- API routes at `/api/checkin`, `/api/plan`, `/api/trades`, `/api/trades/[id]`
- Dashboard with three status cards (check-in, plan, trades)
- "Continue to review" link already wired in `src/components/trades/TradesPage.tsx` pointing to `/review`

### Key Discoveries

- `src/components/trades/TradesPage.tsx` — "Continue to review" link already points to `/review`
- `src/lib/services/checkin.ts:4` — `getOrCreateTodaySession` is reusable; review service calls it to ensure a session exists
- `src/lib/services/readiness-score.ts:8` — `getScoreBand` returns `{ label, colorClass }` for score bands; Process Score needs its own band function with process-specific labels
- `src/types.ts:42` — `ScoreBand` interface already exists and is reusable
- `src/types.ts:103` — `PLAN_COMPLIANCES` array (`["yes", "no", "partial"]`) is reusable for plan adherence field
- `src/middleware.ts:4` — `PROTECTED_ROUTES` already includes `"/api"` prefix; need to add `"/review"` page route
- `src/pages/dashboard.astro` — three-card layout; 4th card follows identical pattern
- S-02 review finding: PostgREST returns `numeric(5,2)` as strings — coerce in service layer (applies to `process_score` if stored as numeric; using `smallint` avoids this)

## Desired End State

A logged-in trader navigates to `/review`, fills a single-screen form (plan adherence from enum, what went wrong as free text, rule broken as yes/no toggle, goal for next session from predefined list or custom text), and submits. The app computes a Process Score (0–100) from session data: +15 check-in completed, +15 plan recorded, +20 daily loss within limit, +20 majority trades plan-compliant, +20 no critical rule broken, +10 review completed. The trader sees the total score with color band and a checklist breakdown showing each component's earned/missed status. The session is auto-marked as `complete`. The dashboard shows a 4th card with the Process Score.

**Verification:** Log in → complete check-in → create plan → add trades → navigate to /review → fill all 4 fields → submit → see Process Score with breakdown → verify score matches formula. Dashboard shows 4th card with score. Refresh → data persists. Edit review → score recalculates. No-trade session → trade components show as 0, max score is 60.

## What We're NOT Doing

- **No auto-recalculation.** If the trader edits trades after submitting the review, the stored process_score becomes stale. The trader can re-submit the review to recalculate. Auto-recalc is over-engineered for MVP.
- **No session history.** That's S-05. We store the process_score for later display but don't build a history page.
- **No Today View.** That's S-04. The dashboard gets a 4th card, not a unified status page.
- **No step enforcement.** The trader can submit a review without having completed check-in, plan, or trades — they'll just earn fewer Process Score points.
- **No pre-filling goal for next session into tomorrow's plan.** Nice-to-have, out of scope.

## Implementation Approach

Three phases, each independently verifiable:

1. **Database + types** — Create the `session_reviews` migration, TypeScript types, and const arrays. Verifiable by applying the migration and running the type checker.
2. **Service layer + API route** — Review CRUD service, Process Score calculation service, `/api/review` endpoint. Verifiable by calling the API.
3. **Review page + score display + dashboard** — Astro page, review form, Process Score breakdown, dashboard 4th card. Verifiable end-to-end in a browser.

## Critical Implementation Details

### Process Score edge cases on no-trade and no-plan sessions

When no trades exist, trade-dependent components (daily loss +20, trade compliance +20) award 0 points — the trader cannot earn credit for compliance without trades. Max score on a no-trade day is 60. When no plan exists, the plan component (+15) is 0 AND the daily loss component (+20) is 0 because there's no `max_daily_loss_r` limit to compare against. The review is always submittable regardless of what other steps are completed.

---

## Phase 1: Database Schema + Domain Types

### Overview

Create the `session_reviews` table and update TypeScript types. This phase establishes the data contract for the review and Process Score.

### Changes Required

#### 1. Supabase migration

**File**: `supabase/migrations/20260612000000_create_session_reviews.sql`

**Intent**: Create `session_reviews` table (one-to-one with session) storing the review form data and computed Process Score. Follows the same pattern as `check_ins` and `session_plans` — UNIQUE on `session_id`, upsert semantics.

**Contract**:

`session_reviews` table:

- `id` uuid PK (gen_random_uuid)
- `session_id` uuid NOT NULL FK → sessions ON DELETE CASCADE, UNIQUE
- `user_id` uuid NOT NULL FK → auth.users ON DELETE CASCADE
- `plan_adherence` text NOT NULL CHECK (plan_adherence IN ('yes', 'no', 'partial'))
- `what_went_wrong` text NOT NULL DEFAULT ''
- `rule_broken` boolean NOT NULL
- `goal_next_session` text NOT NULL
- `process_score` smallint NOT NULL CHECK (process_score BETWEEN 0 AND 100)
- `created_at` timestamptz NOT NULL DEFAULT now()
- `updated_at` timestamptz NOT NULL DEFAULT now()

RLS: Enable on table. Four policies (SELECT, INSERT, UPDATE, DELETE) with `auth.uid() = user_id`, identical pattern to existing tables.

Trigger: Bind `set_updated_at()` to the table (function already exists from first migration).

#### 2. Domain types and const arrays

**File**: `src/types.ts` (append to existing)

**Intent**: Add TypeScript interfaces for reviews, form data, and Process Score breakdown types.

**Contract**:

- `SessionReview` interface matching the `session_reviews` table shape
- `ReviewFormData` type: `{ plan_adherence: string; what_went_wrong: string; rule_broken: boolean; goal_next_session: string }`
- `ScoreComponent` interface: `{ label: string; earned: boolean; points: number; maxPoints: number }`
- `ProcessScoreResult` interface: `{ score: number; components: ScoreComponent[]; band: ScoreBand }`
- Reuse existing `PLAN_COMPLIANCES` array for plan_adherence values (same set: yes/no/partial)

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset`
- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Table `session_reviews` visible in Supabase Studio (localhost:54323)
- RLS policies appear under the table's policies tab
- UNIQUE constraint on `session_id` is visible
- Inserting a row without auth context is rejected by RLS

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Service Layer + API Route

### Overview

Build the review data access service, Process Score calculation service, and a single API endpoint. The API endpoint gathers data from all prior steps (check-in, plan, trades), computes the Process Score, persists the review, and marks the session as complete.

### Changes Required

#### 1. Process Score calculation service

**File**: `src/lib/services/process-score.ts`

**Intent**: Pure function that computes the Process Score and component breakdown from session data. Separated from the review service because the score logic is complex enough to deserve its own file, and mirrors the separation of `readiness-score.ts` from `checkin.ts`.

**Contract**:

- `calculateProcessScore(input: { checkinExists: boolean; planExists: boolean; trades: Trade[]; maxDailyLossR: number | null; ruleBroken: boolean })` → `ProcessScoreResult`
  - Component allocation:
    - Check-in completed: +15 if `checkinExists`
    - Plan recorded: +15 if `planExists`
    - Daily loss within limit: +20 if `planExists` AND trades exist AND sum of `abs(negative result_r)` ≤ `maxDailyLossR`. Award 0 if no plan or no trades.
    - Majority trades compliant: +20 if trades exist AND count of trades with `plan_compliance === 'yes'` is strictly greater than 50% of total trades. Award 0 if no trades.
    - No critical rule broken: +20 if `!ruleBroken`
    - Review completed: +10 (always awarded — this function is only called during review submission)
  - Returns `{ score, components, band }` where `band` uses `getProcessScoreBand()`

- `getProcessScoreBand(score: number)` → `ScoreBand`
  - ≥80: `{ label: "Great process", colorClass: "text-green-600 bg-green-100" }`
  - ≥60: `{ label: "Needs improvement", colorClass: "text-yellow-600 bg-yellow-100" }`
  - ≥40: `{ label: "Poor process", colorClass: "text-orange-600 bg-orange-100" }`
  - <40: `{ label: "Critical", colorClass: "text-red-600 bg-red-100" }`

#### 2. Review service

**File**: `src/lib/services/review.ts`

**Intent**: Encapsulate Supabase queries for session reviews. Follows the same pattern as `checkin.ts` and `plan.ts` — one-to-one with session, upsert semantics.

**Contract**:

- `upsertReview(supabase, sessionId, userId, data: ReviewFormData, processScore: number)` → `SessionReview`. Upserts on the unique `session_id` constraint. Returns the persisted row.
- `getReviewBySession(supabase, sessionId)` → `SessionReview | null`. Returns the review for a given session, or null.
- `getTodayReview(supabase, userId)` → `{ session: Session; review: SessionReview | null } | null`. Convenience function: gets today's session and its review. Returns null if no session exists.
- `completeSession(supabase, sessionId)` → `void`. Updates `sessions.status` to `'complete'` for the given session id.

#### 3. Review API route

**File**: `src/pages/api/review.ts`

**Intent**: POST endpoint that validates the review form, gathers all session data, computes the Process Score, persists the review, and marks the session as complete. Returns the review, breakdown, and score band.

**Contract**:

- Method: POST only
- Auth: Check `context.locals.user`. Return 401 if null.
- Request body (JSON): `{ plan_adherence: string, what_went_wrong: string, rule_broken: boolean, goal_next_session: string }`
- Validation:
  - `plan_adherence` must be in `PLAN_COMPLIANCES` array
  - `what_went_wrong` must be a string (empty string allowed)
  - `rule_broken` must be a boolean
  - `goal_next_session` must be a non-empty string
- Workflow:
  1. Get or create today's session
  2. Fetch check-in, plan, and trades for the session (parallel `Promise.all`)
  3. Call `calculateProcessScore()` with gathered data + form data
  4. Upsert review with process_score
  5. Complete session (set status to `'complete'`)
  6. Return response
- On success: Return 200 JSON: `{ session, review, process_score_result: ProcessScoreResult }`
- On error: Return 400/401/500 JSON: `{ error: string }`

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- POST /api/review with valid JSON body and auth cookie returns 200 with review and process_score_result
- POST /api/review with missing fields returns 400
- Second POST /api/review for same day upserts (updates, no duplicate)
- Process score breakdown shows correct component allocation
- Session status changes to 'complete' after review submission
- POST /api/review without auth returns 401
- No-trade session: trade compliance and daily loss components show as 0
- Full session (check-in + plan + trades + no rule broken): score is 100

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Review Page + Score Display + Dashboard

### Overview

Build the `/review` page with a review form and Process Score breakdown display, and add a 4th card to the dashboard. The review form is a single-screen experience (4 fields). On submit, the form transitions to a result view showing the Process Score with a component-level breakdown checklist. This is the most UI-intensive phase and the moment the trader first sees the north-star metric.

### Changes Required

#### 1. Install shadcn/ui textarea component

**Intent**: Add the `textarea` shadcn/ui component needed for the "what went wrong" free-text field.

**Contract**: Run `npx shadcn@latest add textarea`. Component lands in `src/components/ui/textarea.tsx`.

#### 2. Process Score display component

**File**: `src/components/review/ProcessScoreDisplay.tsx`

**Intent**: Displays the Process Score total with color band and a checklist breakdown of all 6 components. Each component shows earned/missed status, points, and a label. This is the core UX moment of the entire product.

**Contract**:

- Props: `{ result: ProcessScoreResult; onEdit: () => void }`
- Renders:
  - Large score number with color band badge (reuses `ScoreBand` styling from readiness score)
  - Component breakdown as a vertical list of 6 items, each showing: a ✓ (green) or ✗ (red) icon, the component label, and points earned vs max (e.g., "+15/15" or "+0/20")
  - Total score at the bottom of the breakdown
  - "Edit review" button (calls `onEdit`)
  - "Back to dashboard" link
- Uses `cn()` for conditional styling on earned/missed items

#### 3. Review form component

**File**: `src/components/review/ReviewForm.tsx`

**Intent**: Main React island for the review page. Manages the 4 form fields, submission to `/api/review`, and transition to the Process Score result view. Handles both creating and editing reviews.

**Contract**:

- Props: `{ existingReview?: { plan_adherence: string; what_went_wrong: string; rule_broken: boolean; goal_next_session: string; process_score: number } | null; existingScoreResult?: ProcessScoreResult | null }`
- Internal state: `mode` (`form` | `result`), form field values, loading/error state, `scoreResult` (set after submission)
- Form fields:
  - Plan adherence: `OptionSelector` with labels "Yes" / "Partial" / "No" mapping to `PLAN_COMPLIANCES` values
  - What went wrong: `Textarea` (optional — placeholder text, not required for submit)
  - Rule broken: two-button toggle (Yes / No) — simple button group, selected = default variant, unselected = outline
  - Goal for next session: `GoalSelector` with `SESSION_GOALS`
- Result section: renders `ProcessScoreDisplay` with the returned `process_score_result`
- If `existingReview` is provided: pre-fill fields and start in `result` mode (showing the score breakdown)
- Submission: `fetch('/api/review', { method: 'POST', ... })` → on success, store `scoreResult` and switch to `result` mode
- Uses `client:load` for immediate hydration

#### 4. Review Astro page

**File**: `src/pages/review.astro`

**Intent**: Server-rendered page that loads existing session/review data and renders the ReviewForm React island. If a review exists, it also pre-computes the Process Score breakdown so the result view can render immediately on page load.

**Contract**:

- Frontmatter:
  - Get user from `Astro.locals`
  - Call `getTodayReview(supabase, userId)` to load existing review
  - If review exists: also fetch check-in, plan, trades for the session and call `calculateProcessScore()` to produce the breakdown for SSR
- Renders inside `Layout` with title "Post-session Review"
- Page wrapper uses `bg-background text-foreground` styling (matches other pages)
- Centered, max-width container with heading "Post-session Review"
- Renders `<ReviewForm client:load existingReview={reviewData} existingScoreResult={scoreResult} />`

#### 5. Protected route registration

**File**: `src/middleware.ts`

**Intent**: Add `/review` to the protected routes array so unauthenticated users are redirected.

**Contract**: Add `"/review"` to the `PROTECTED_ROUTES` array.

#### 6. Dashboard updates

**File**: `src/pages/dashboard.astro`

**Intent**: Add a 4th "Post-session Review" card to the dashboard showing the Process Score or "Not completed yet" status.

**Contract**:

- Import `getReviewBySession` from review service and `getProcessScoreBand` from process-score service
- Add `getReviewBySession` call to the existing `Promise.all` alongside check-in, plan, trades
- Review card: shows "Not completed yet" or the Process Score with color band badge (same badge pattern as the check-in readiness score)
- Button: "Start" or "View" linking to `/review`
- Card order: Check-in → Session Plan → Trades → Post-session Review (matches discipline loop order)

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Navigate to /review while logged in → form loads with all 4 fields
- Plan adherence selector works (yes/partial/no)
- What went wrong textarea accepts text or can be left empty
- Rule broken toggle switches between Yes and No
- Goal for next session shows predefined options and Custom
- Submit → Process Score result view appears with score number, color band, and 6-component breakdown
- Each breakdown component shows correct earned/missed status and points
- Full session (check-in + plan + trades compliant + no rule broken): score is 100
- No-trade session: trade compliance and daily loss show as ✗ with 0 points
- Refresh → existing review loads in result mode with breakdown
- Click "Edit review" → form returns with pre-filled values
- Re-submit → score recalculates from current session data
- Navigate to /review while logged out → redirects to /auth/signin
- Dashboard shows 4 cards with correct status
- Dashboard review card shows Process Score when review exists
- "Continue to review" link from trades page navigates to /review
- Full navigation flow: check-in → plan → trades → review → see Process Score

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

No unit test framework is configured (same as S-01/S-02). Correctness is verified through type checking, linting, and manual testing. If a test runner is added later, priority targets:

- Process Score calculation: all component combinations (all present, none present, partial)
- Edge cases: no trades → compliance/loss components are 0, no plan → plan/loss components are 0
- Daily loss calculation: sum of absolute negative result_r vs max_daily_loss_r
- Majority threshold: 2/4 trades compliant = no (not >50%), 3/4 = yes

### Manual Testing Steps

1. Start local Supabase: `npx supabase start`
2. Apply migrations: `npx supabase db reset`
3. Start dev server: `npm run dev`
4. **Full loop test:** Sign in → complete check-in → create plan (max loss = 2R) → add 3 trades (2 compliant, 1 not; total loss < 2R) → navigate to /review → fill form (plan adherence: yes, no rule broken) → submit → verify score is 100
5. **Partial session test:** Sign in → skip check-in and plan → add 1 trade → review → verify score reflects missing check-in (0/15) and plan (0/15) and daily loss (0/20)
6. **No-trade test:** Sign in → complete check-in → create plan → review with no trades → verify trade compliance (0/20) and daily loss (0/20), max score is 60
7. **Rule broken test:** Submit review with rule_broken = true → verify no-rule-broken component shows 0/20
8. **Daily loss exceeded test:** Create plan with max_daily_loss_r = 1R → add trade with result_r = -2R → review → verify daily loss component is 0/20
9. **Edit flow:** After submitting review, click "Edit review" → change a field → re-submit → verify score recalculates
10. **Dashboard:** Verify 4th card shows Process Score with correct band
11. **Session status:** Check Supabase Studio → verify session.status is 'complete' after review
12. **RLS:** In Studio SQL editor, try to SELECT another user's review — should return empty

## Performance Considerations

Minimal for this slice. The review page loads today's session + review (one query). The API endpoint fetches check-in, plan, and trades in parallel via `Promise.all` — three lightweight queries. The Process Score calculation is a pure in-memory function with no I/O.

The most complex query path is the review page when a review exists and needs to pre-compute the breakdown for SSR — this requires loading check-in, plan, and trades in addition to the review. All queries are indexed on session_id (existing indexes from S-01 and S-02).

## Migration Notes

This is the third Supabase migration. Prerequisites:

- Local Supabase must be running (`npx supabase start`)
- Migration applies via `npx supabase db reset` (resets and replays all three migrations)
- The migration reuses `set_updated_at()` trigger function from the first migration — do not redefine it
- The `session_reviews` table follows the same one-to-one pattern as `check_ins` and `session_plans` (UNIQUE on session_id, upsert semantics)

## References

- PRD: `context/foundation/prd.md` — FR-008 (post-session review), FR-009 (Process Score), Business Logic (score formula)
- Roadmap: `context/foundation/roadmap.md` — S-03 definition (north star), risk note about integration friction
- S-02 plan: `context/changes/s-02/plan.md` — established patterns for migration, service, API, UI
- Existing service patterns: `src/lib/services/checkin.ts`, `src/lib/services/plan.ts`, `src/lib/services/trades.ts`
- Score calculation pattern: `src/lib/services/readiness-score.ts`
- Existing API pattern: `src/pages/api/checkin.ts`
- UI pattern: `src/components/checkin/CheckinForm.tsx` (form + result view), `src/components/checkin/ScoreDisplay.tsx`
- Middleware: `src/middleware.ts` — PROTECTED_ROUTES
- Types: `src/types.ts`
- Trades "Continue to review" link: `src/components/trades/TradesPage.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema + Domain Types

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset`
- [x] 1.2 Type checking passes: `npm run lint`
- [x] 1.3 Build succeeds: `npm run build`

#### Manual

- [ ] 1.4 Table and RLS policies visible in Supabase Studio
- [ ] 1.5 UNIQUE constraint on session_id visible
- [ ] 1.6 RLS rejects unauthenticated inserts

### Phase 2: Service Layer + API Route

#### Automated

- [ ] 2.1 Type checking passes: `npm run lint`
- [ ] 2.2 Build succeeds: `npm run build`

#### Manual

- [ ] 2.3 POST /api/review with valid data returns 200 with review and process_score_result
- [ ] 2.4 POST /api/review upserts on second call (no duplicate)
- [ ] 2.5 Process score breakdown shows correct component allocation
- [ ] 2.6 Session status changes to 'complete' after review
- [ ] 2.7 API returns 401 without auth, 400 with invalid data
- [ ] 2.8 Full session scores 100, no-trade session max is 60

### Phase 3: Review Page + Score Display + Dashboard

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Build succeeds: `npm run build`

#### Manual

- [ ] 3.3 Review form loads with all 4 fields
- [ ] 3.4 Submit → Process Score result with breakdown displays
- [ ] 3.5 Each breakdown component shows correct earned/missed status
- [ ] 3.6 Existing review pre-fills on page reload with breakdown
- [ ] 3.7 Edit flow works (pre-filled values, score recalculates on resubmit)
- [ ] 3.8 Unauthenticated access redirects to /auth/signin
- [ ] 3.9 Dashboard shows 4 cards including review with Process Score
- [ ] 3.10 Full navigation flow: check-in → plan → trades → review → score
