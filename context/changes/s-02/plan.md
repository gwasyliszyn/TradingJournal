# Session Plan and Trade Logging — Implementation Plan

## Overview

Build the second slice of the Trading Discipline System: a session plan form where the trader sets a goal, max trade count, and max daily loss in R, and a trade logging page where the trader adds, edits, and deletes individual trades for the current session. This is roadmap slice S-02 — it extends the session data model with two new child tables (`session_plans` and `trades`), follows S-01's established patterns for services/API/UI, and introduces the first one-to-many relationship (multiple trades per session).

## Current State Analysis

S-01 is implemented. The app has:
- `sessions` table (one per user per date, auto-created on first check-in)
- `check_ins` table (one-to-one with session, upsert semantics)
- Service layer in `src/lib/services/checkin.ts` with `getOrCreateTodaySession`, `upsertCheckin`, `getTodayCheckin`
- JSON API route at `src/pages/api/checkin.ts` (POST, validates, calculates score, returns JSON)
- `/checkin` Astro page with React island (`CheckinForm`) using progressive disclosure
- Dashboard with a single check-in status card
- Reusable components: `RatingGroup`, `OptionSelector`, `ScoreDisplay` in `src/components/checkin/`
- shadcn/ui components installed: `button`, `badge`, `card`, `label`
- `ScoreDisplay` already links to `/plan` (forward-looking from S-01)

### Key Discoveries

- `src/components/checkin/ScoreDisplay.tsx:33` — "Continue to plan" link already points to `/plan`
- `src/lib/services/checkin.ts:4` — `getOrCreateTodaySession` is reusable; plan and trade services call it to ensure a session exists
- `src/pages/api/checkin.ts:8-48` — validation function pattern returns `{ data, error }` tagged union; replicate for plan and trade validation
- `src/middleware.ts:4` — `PROTECTED_ROUTES` includes `"/api"` prefix, so `/api/plan` and `/api/trades` are already auth-gated for the API; need to add `/plan` and `/trades` page routes
- `supabase/migrations/20260603000000_create_sessions_and_checkins.sql` — `set_updated_at()` trigger function already exists; reuse in new migration
- `src/types.ts` — flat file with all domain types and const arrays; extend with plan and trade types

## Desired End State

A logged-in trader navigates to `/plan`, fills a single-screen form (goal from predefined list or custom text, max trades as integer, max daily loss in R), and submits. The plan is persisted and editable. The trader then navigates to `/trades`, sees a list of today's trades (initially empty), clicks "Add trade" to reveal an inline form (instrument, setup name, result in 0.25R increments, plan compliance, main mistake from predefined list or custom), and submits. Trades appear in the list and can be edited or deleted. The dashboard shows three status cards: check-in, plan, and trades.

**Verification:** Log in → /plan → fill all 3 fields → submit → see confirmation with "Continue to trades" link. Navigate to /trades → add a trade → see it in the list → edit it → delete it → add another. Dashboard shows plan status and trade count. Refresh → data persists. Second user cannot see first user's data.

## What We're NOT Doing

- **No Process Score calculation.** That's S-03. We store the data S-03 needs (plan compliance, daily loss exceeded, rule broken) but don't compute a score.
- **No session status transitions.** Sessions stay `active`. Marking as `complete` is S-03's job after the review.
- **No Today View.** That's S-04. The dashboard gets additional cards, not a unified status page.
- **No trade import or broker integration.** All trades are manual entry (PRD non-goal).
- **No drag-and-drop reordering of trades.** Trades display in creation order.
- **No pagination for trades.** A typical session has 1–10 trades; no need for pagination in MVP.

## Implementation Approach

Four phases, each independently verifiable:

1. **Database + types** — Create the migration, TypeScript types, and const arrays. Verifiable by applying the migration and running the type checker.
2. **Service layer + API routes** — CRUD services for plans and trades, three API endpoints. Verifiable by calling the APIs.
3. **Plan page + form UI** — Astro page and React form island for session plans. Verifiable by completing the plan flow in a browser.
4. **Trades page + list/form UI + dashboard** — Astro page, trade list, inline add/edit form, and dashboard updates. Verifiable by adding/editing/deleting trades and checking the dashboard.

## Critical Implementation Details

### One-to-many trades vs. one-to-one plan

The `session_plans` table uses a UNIQUE on `session_id` (one plan per session) with upsert semantics — identical to `check_ins`. The `trades` table has no UNIQUE on `session_id` — multiple trades per session. This means trades need individual CRUD (create, update by id, delete by id) instead of the single upsert pattern used by check-in and plan. The trade API needs two files: `src/pages/api/trades.ts` (POST to create) and `src/pages/api/trades/[id].ts` (PUT to update, DELETE to delete).

### Predefined + custom pattern for goal and mistake fields

Both goal and main_mistake use a hybrid approach: the user picks from a predefined list or chooses "Custom" and types their own. The database stores the final text value — no separate `is_custom` flag. The const arrays (`SESSION_GOALS`, `TRADING_MISTAKES`) include all predefined values; the UI renders them as OptionSelector buttons plus a "Custom" button that reveals a text input. Validation accepts either a value from the const array or any non-empty string (custom text).

---

## Phase 1: Database Schema + Domain Types

### Overview

Create the `session_plans` and `trades` tables, RLS policies, and update trigger bindings. Add TypeScript interfaces and const arrays for all new domain entities. This phase touches no UI or services — it establishes the data contract.

### Changes Required

#### 1. Supabase migration

**File**: `supabase/migrations/20260609000000_create_plans_and_trades.sql`

**Intent**: Create `session_plans` (one-to-one with session) and `trades` (one-to-many with session) tables, reusing the existing `set_updated_at()` trigger function from the first migration.

**Contract**:

`session_plans` table:

- `id` uuid PK (gen_random_uuid)
- `session_id` uuid NOT NULL FK → sessions ON DELETE CASCADE, UNIQUE
- `user_id` uuid NOT NULL FK → auth.users ON DELETE CASCADE
- `goal` text NOT NULL
- `max_trades` smallint NOT NULL CHECK (max_trades BETWEEN 1 AND 50)
- `max_daily_loss_r` numeric(5,2) NOT NULL CHECK (max_daily_loss_r > 0)
- `created_at` timestamptz NOT NULL DEFAULT now()
- `updated_at` timestamptz NOT NULL DEFAULT now()

`trades` table:

- `id` uuid PK (gen_random_uuid)
- `session_id` uuid NOT NULL FK → sessions ON DELETE CASCADE (NO unique — many per session)
- `user_id` uuid NOT NULL FK → auth.users ON DELETE CASCADE
- `instrument` text NOT NULL
- `setup_name` text NOT NULL
- `result_r` numeric(5,2) NOT NULL
- `plan_compliance` text NOT NULL CHECK (plan_compliance IN ('yes', 'no', 'partial'))
- `main_mistake` text NOT NULL
- `created_at` timestamptz NOT NULL DEFAULT now()
- `updated_at` timestamptz NOT NULL DEFAULT now()

RLS: Enable on both tables. Four policies each (SELECT, INSERT, UPDATE, DELETE) with `auth.uid() = user_id`, identical pattern to `sessions` and `check_ins`.

Triggers: Bind `set_updated_at()` to both tables (function already exists from first migration).

Index: Add `CREATE INDEX trades_session_id_idx ON trades (session_id)` for efficient per-session trade lookups.

#### 2. Domain types and const arrays

**File**: `src/types.ts` (append to existing)

**Intent**: Add TypeScript interfaces for plans and trades, form data types, and const arrays for predefined goals, trading mistakes, and plan compliance values.

**Contract**:

- `SessionPlan` interface matching the `session_plans` table shape
- `Trade` interface matching the `trades` table shape
- `PlanFormData` type: `{ goal: string; max_trades: number; max_daily_loss_r: number }`
- `TradeFormData` type: `{ instrument: string; setup_name: string; result_r: number; plan_compliance: string; main_mistake: string }`
- `SESSION_GOALS` const array: `["Follow the plan", "Practice patience", "Stick to stop losses", "Only A+ setups", "Reduce position size"]`
- `TRADING_MISTAKES` const array: `["No mistake", "Oversized position", "Chased entry", "Moved stop loss", "Revenge trade", "Broke risk rules", "FOMO entry"]`
- `PLAN_COMPLIANCES` const array: `["yes", "no", "partial"]`

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset`
- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Tables `session_plans` and `trades` visible in Supabase Studio (localhost:54323)
- RLS policies appear under each table's policies tab
- `trades_session_id_idx` index is visible on the `trades` table
- Inserting a row without auth context is rejected by RLS

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Service Layer + API Routes

### Overview

Build data access services for plans and trades, and three API endpoints: `/api/plan` (POST upsert), `/api/trades` (POST create), and `/api/trades/[id]` (PUT update, DELETE delete). This phase follows the exact service and API patterns from S-01's checkin implementation.

### Changes Required

#### 1. Plan service

**File**: `src/lib/services/plan.ts`

**Intent**: Encapsulate Supabase queries for session plans. Mirrors the structure of `src/lib/services/checkin.ts` — the plan is one-to-one with session and uses upsert.

**Contract**:

- `upsertPlan(supabase, sessionId, userId, data: PlanFormData)` → `SessionPlan`. Upserts on the unique `session_id` constraint. Returns the persisted row.
- `getPlanBySession(supabase, sessionId)` → `SessionPlan | null`. Returns the plan for a given session, or null.
- `getTodayPlan(supabase, userId)` → `{ session: Session; plan: SessionPlan | null } | null`. Convenience function: gets today's session and its plan. Returns null if no session exists.

#### 2. Trade service

**File**: `src/lib/services/trades.ts`

**Intent**: Encapsulate Supabase queries for trades. Unlike checkin/plan, trades are one-to-many — the service provides list, create, update, and delete operations keyed by individual trade id.

**Contract**:

- `getTradesBySession(supabase, sessionId)` → `Trade[]`. Returns all trades for a session, ordered by `created_at` ascending.
- `createTrade(supabase, sessionId, userId, data: TradeFormData)` → `Trade`. Inserts a new trade and returns it.
- `updateTrade(supabase, tradeId, userId, data: TradeFormData)` → `Trade`. Updates an existing trade (identified by id). The `userId` check ensures the RLS policy passes. Returns the updated row.
- `deleteTrade(supabase, tradeId, userId)` → `void`. Deletes a trade by id.
- `getTodayTrades(supabase, userId)` → `{ session: Session; trades: Trade[] } | null`. Convenience function: gets today's session and its trades. Returns null if no session exists.

#### 3. Plan API route

**File**: `src/pages/api/plan.ts`

**Intent**: POST endpoint that creates or updates today's session plan. Same pattern as `/api/checkin` — JSON in/out, auth check, validation, upsert via service.

**Contract**:

- Method: POST only
- Auth: Check `context.locals.user`. Return 401 if null.
- Request body (JSON): `{ goal: string, max_trades: number, max_daily_loss_r: number }`
- Validation: `goal` must be non-empty string. `max_trades` must be integer 1–50. `max_daily_loss_r` must be positive number.
- On success: Return 200 JSON: `{ session: Session, plan: SessionPlan }`
- On validation/auth/server error: Return 400/401/500 JSON: `{ error: string }`

#### 4. Trade create API route

**File**: `src/pages/api/trades.ts`

**Intent**: POST endpoint to create a new trade for today's session.

**Contract**:

- Method: POST only
- Auth: Check `context.locals.user`. Return 401 if null.
- Request body (JSON): `{ instrument: string, setup_name: string, result_r: number, plan_compliance: string, main_mistake: string }`
- Validation: `instrument` and `setup_name` must be non-empty strings. `result_r` must be a number. `plan_compliance` must be in `PLAN_COMPLIANCES` array. `main_mistake` must be non-empty string.
- On success: Return 201 JSON: `{ trade: Trade }`
- On error: Return 400/401/500 JSON: `{ error: string }`

#### 5. Trade update/delete API route

**File**: `src/pages/api/trades/[id].ts`

**Intent**: PUT and DELETE endpoints for individual trades, identified by the `[id]` URL parameter.

**Contract**:

- PUT: Same request body and validation as POST create. Returns 200 JSON: `{ trade: Trade }`.
- DELETE: No request body. Returns 200 JSON: `{ success: true }`.
- Both methods: Auth check first. If trade id is not a valid UUID or trade doesn't exist, return 404.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- POST /api/plan with valid JSON body and auth cookie returns 200 with session and plan
- POST /api/plan with missing fields returns 400
- Second POST /api/plan for same day upserts (updates, no duplicate)
- POST /api/trades with valid data returns 201 with trade
- PUT /api/trades/{id} with updated data returns 200 with updated trade
- DELETE /api/trades/{id} returns 200 with success: true
- POST /api/trades without auth returns 401
- PUT /api/trades/{invalid-id} returns 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Plan Page + Form UI

### Overview

Build the `/plan` Astro page and a React form island. The plan form is a single-screen experience (3 fields, no progressive disclosure needed). It supports creating a new plan and editing an existing one. On success, the form shows a confirmation view with a "Continue to trades" link.

### Changes Required

#### 1. Install shadcn/ui input component

**Intent**: Add the `input` shadcn/ui component needed for text inputs (custom goal text, and later instrument/setup name on the trades page).

**Contract**: Run `npx shadcn@latest add input`. Component lands in `src/components/ui/input.tsx`.

#### 2. Goal selector component

**File**: `src/components/plan/GoalSelector.tsx`

**Intent**: Reusable input for selecting a goal from predefined options or entering custom text. Renders predefined options as OptionSelector-style buttons plus a "Custom" button that reveals a text input.

**Contract**:

- Props: `{ value: string | null; onChange: (value: string) => void; predefinedOptions: readonly string[] }`
- Renders a label, the predefined option buttons (selected = default variant, unselected = outline), a "Custom" button, and conditionally a text input when "Custom" is active
- If the current value is not in the predefined list and is non-empty, the component shows as custom mode with the text input visible and filled
- The text input uses the shadcn `Input` component

#### 3. R-value stepper component

**File**: `src/components/shared/RValueStepper.tsx`

**Intent**: Reusable input for selecting an R-multiple value in 0.25 increments. Used for max daily loss (plan form, positive only) and trade result (trade form, positive and negative). Renders decrement/display/increment controls.

**Contract**:

- Props: `{ name: string; label: string; value: number | null; onChange: (value: number) => void; min: number; max: number; step?: number; description?: string }`
- Default step: 0.25
- Renders: label, a row of `[−]` button · displayed value (e.g., "1.50 R") · `[+]` button, and optional description
- Buttons disable at min/max boundaries
- Displayed value formatted to 2 decimal places with "R" suffix
- Accessible: aria-label on the group, aria-valuemin/max/now on the display

#### 4. Plan form component

**File**: `src/components/plan/PlanForm.tsx`

**Intent**: Main React island for the plan page. Manages the form fields, submission to `/api/plan`, and transition to a confirmation/result view. Handles both creating and editing plans.

**Contract**:

- Props: `{ existingPlan?: { goal: string; max_trades: number; max_daily_loss_r: number } | null }`
- Internal state: `mode` (`form` | `result`), form field values, loading/error state
- Form section: `GoalSelector` for goal, number input (1–50) for max trades, `RValueStepper` (min: 0.25, max: 20) for max daily loss
- Result section: summary of the submitted plan with "Edit plan" and "Continue to trades" buttons
- If `existingPlan` is provided: pre-fill fields and start in `result` mode
- Submission: `fetch('/api/plan', { method: 'POST', ... })`
- Uses `client:load` for immediate hydration

#### 5. Plan Astro page

**File**: `src/pages/plan.astro`

**Intent**: Server-rendered page that loads existing session/plan data and renders the PlanForm React island.

**Contract**:

- Frontmatter: get user from `Astro.locals`, call `getTodayPlan(supabase, userId)` to load existing data
- Renders inside `Layout` with title "Session Plan"
- Page wrapper uses `bg-background text-foreground` styling (matches checkin page)
- Centered, max-width container with heading "Session Plan"
- Renders `<PlanForm client:load existingPlan={planData} />`

#### 6. Protected route registration

**File**: `src/middleware.ts`

**Intent**: Add `/plan` and `/trades` to the protected routes array so unauthenticated users are redirected.

**Contract**: Add `"/plan"` and `"/trades"` to the `PROTECTED_ROUTES` array.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Navigate to /plan while logged in → form loads with all 3 fields
- Select a predefined goal → submit is not yet enabled (need all fields)
- Select "Custom" → text input appears → type a custom goal
- Set max trades and max daily loss → submit becomes enabled
- Submit → confirmation view shows plan summary with "Continue to trades" link
- Refresh → existing plan loads in result mode
- Click "Edit plan" → form returns with pre-filled values
- Navigate to /plan while logged out → redirects to /auth/signin
- "Continue to plan" link on check-in score display navigates to /plan

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Trades Page + Trade List/Form UI + Dashboard Updates

### Overview

Build the `/trades` page with a trade list and inline add/edit form, and update the dashboard to show plan and trade status cards alongside the existing check-in card. This is the most UI-intensive phase — it introduces the list + inline form pattern that's new to the codebase.

### Changes Required

#### 1. Trade form component

**File**: `src/components/trades/TradeForm.tsx`

**Intent**: Reusable form for creating and editing a single trade. Used inline on the trades page. 5 fields on a single screen.

**Contract**:

- Props: `{ existingTrade?: Trade | null; onSubmit: (trade: Trade) => void; onCancel: () => void; sessionId: string }`
- Fields: text input for instrument, text input for setup name, `RValueStepper` (min: -10, max: 10) for result in R, `OptionSelector` for plan compliance (yes/no/partial), `GoalSelector`-style component for main mistake (predefined + custom)
- Submit: For new trade, POST to `/api/trades`. For existing trade, PUT to `/api/trades/{id}`.
- On success: call `onSubmit(trade)` with the returned trade data so the parent can update the list
- On cancel: call `onCancel()` to hide the form
- Loading/error state managed internally

#### 2. Mistake selector component

**File**: `src/components/trades/MistakeSelector.tsx`

**Intent**: Reusable input for selecting a trading mistake — same pattern as `GoalSelector` (predefined options + custom text).

**Contract**:

- Props: `{ value: string | null; onChange: (value: string) => void }`
- Renders `TRADING_MISTAKES` as option buttons plus "Custom" with text input
- Same behavior as GoalSelector: if value not in predefined list, shows custom mode

#### 3. Trade list component

**File**: `src/components/trades/TradeList.tsx`

**Intent**: Displays a list of trades for the current session as compact cards. Each trade shows instrument, result, compliance badge, and edit/delete actions.

**Contract**:

- Props: `{ trades: Trade[]; onEdit: (trade: Trade) => void; onDelete: (tradeId: string) => void }`
- Each trade renders as a card-style row: instrument name, setup name (muted), result in R (color-coded: green for positive, red for negative), compliance badge, main mistake text, and Edit/Delete action buttons
- Delete calls the parent's `onDelete` handler
- Edit calls the parent's `onEdit` handler
- Empty state: "No trades yet" message

#### 4. Trades page container component

**File**: `src/components/trades/TradesPage.tsx`

**Intent**: Main React island for the trades page. Manages the trade list state, inline form visibility, and CRUD operations (add, edit, delete). Orchestrates TradeList and TradeForm.

**Contract**:

- Props: `{ initialTrades: Trade[]; sessionId: string }`
- Internal state: `trades` array (initialized from props), `mode` (`list` | `adding` | `editing`), `editingTrade` (the trade being edited)
- List mode: renders TradeList + "Add trade" button at the bottom
- Adding mode: renders TradeList + TradeForm at the bottom (no existing trade)
- Editing mode: renders TradeList (with the edited trade highlighted or hidden) + TradeForm pre-filled with the trade being edited
- On successful add: append to trades array, switch to list mode
- On successful edit: replace in trades array, switch to list mode
- On delete: call DELETE `/api/trades/{id}`, remove from trades array
- Below the trade list/form, show a "Continue to review" link (points to `/review` — will 404 until S-03, acceptable)
- Uses `client:load` for immediate hydration

#### 5. Trades Astro page

**File**: `src/pages/trades.astro`

**Intent**: Server-rendered page that loads existing session and trades, passes to the TradesPage React island.

**Contract**:

- Frontmatter: get user from `Astro.locals`, call `getOrCreateTodaySession()` then `getTradesBySession()` to load existing data
- Renders inside `Layout` with title "Trades"
- Page wrapper uses `bg-background text-foreground` styling
- Centered, max-width container with heading "Trade Log"
- Renders `<TradesPage client:load initialTrades={trades} sessionId={sessionId} />`

#### 6. Dashboard updates

**File**: `src/pages/dashboard.astro`

**Intent**: Add session plan and trades status cards to the dashboard, matching the existing check-in card pattern.

**Contract**:

- Load plan status via `getTodayPlan()` and trade count via `getTodayTrades()`
- Session Plan card: shows "Not completed yet" or the goal text. Button: "Start" or "Edit" linking to `/plan`.
- Trades card: shows "No trades yet" or trade count (e.g., "3 trades logged"). Button: "Add trades" or "View trades" linking to `/trades`.
- Card order: Check-in → Session Plan → Trades (matches discipline loop order)

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Navigate to /trades while logged in → empty state shows "No trades yet" with "Add trade" button
- Click "Add trade" → inline form appears with all 5 fields
- Fill instrument (text), setup name (text), result (stepper), compliance (selector), mistake (selector) → submit
- Trade appears in the list with correct data
- Click edit on a trade → form pre-fills with that trade's data → edit a field → submit → list updates
- Click delete on a trade → trade is removed from list
- Add 3 trades → verify all display correctly with proper formatting
- Refresh the page → all trades persist from database
- Navigate to /trades while logged out → redirects to /auth/signin
- Dashboard shows all three cards (check-in, plan, trades) with correct status
- Dashboard plan card shows goal text when plan exists
- Dashboard trades card shows trade count when trades exist
- "Continue to trades" link on plan confirmation navigates to /trades

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

No unit test framework is configured in the project (same as S-01). Correctness is verified through type checking, linting, and manual testing. If a test runner is added later, priority targets:

- Plan validation: reject max_trades < 1 or > 50, reject max_daily_loss_r <= 0
- Trade validation: reject invalid plan_compliance values, reject empty instrument/setup_name
- R-value stepper: boundary values, step increment arithmetic

### Manual Testing Steps

1. Start local Supabase: `npx supabase start`
2. Apply migrations: `npx supabase db reset`
3. Start dev server: `npm run dev`
4. Sign in (or complete check-in first to have a session)
5. Navigate to /plan → fill all 3 fields → submit → verify confirmation
6. Navigate to /trades → add a trade → verify it appears in list
7. Edit the trade → verify changes persist
8. Delete the trade → verify it's removed
9. Add multiple trades → verify ordering by creation time
10. Refresh both pages → verify data persists from database
11. Check dashboard → verify all three status cards show correct state
12. Test navigation flow: check-in score → "Continue to plan" → plan → "Continue to trades" → trades
13. Open Supabase Studio → verify data in `session_plans` and `trades` tables
14. Test RLS: in Studio SQL editor, try to SELECT another user's plan/trades — should return empty

## Performance Considerations

Minimal for this slice. The plan page has the same load profile as check-in: one query for today's session + plan. The trades page loads all trades for today's session — typically 1–10 rows, no pagination needed.

The inline add/edit pattern means trade CRUD happens via individual fetch calls, not batch operations. Each trade submit is one Supabase insert/update. This is fine for the expected volume (1–10 trades per session).

The `trades_session_id_idx` index ensures trade lookups by session are efficient even if the table grows.

## Migration Notes

This is the second Supabase migration. Prerequisites:

- Local Supabase must be running (`npx supabase start`)
- Migration applies via `npx supabase db reset` (resets and replays all migrations including the first one from S-01)
- The migration reuses `set_updated_at()` trigger function from the first migration — do not redefine it

The `session_plans` table follows the same one-to-one pattern as `check_ins` (UNIQUE on session_id, upsert semantics). The `trades` table is the first one-to-many relationship — no UNIQUE on session_id, individual CRUD by trade id.

## References

- PRD: `context/foundation/prd.md` — FR-006 (session plan), FR-007 (trade logging), Business Logic (Process Score inputs)
- Roadmap: `context/foundation/roadmap.md` — S-02 definition, risk note about scope
- S-01 plan: `context/changes/s-01/plan.md` — established patterns for migration, service, API, UI
- Existing service pattern: `src/lib/services/checkin.ts`
- Existing API pattern: `src/pages/api/checkin.ts`
- Existing UI pattern: `src/components/checkin/CheckinForm.tsx`
- Middleware: `src/middleware.ts` — PROTECTED_ROUTES
- Types: `src/types.ts`
- Score display link: `src/components/checkin/ScoreDisplay.tsx:33` — "Continue to plan"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema + Domain Types

#### Automated

- [ ] 1.1 Migration applies cleanly: `npx supabase db reset`
- [x] 1.2 Type checking passes: `npm run lint`
- [x] 1.3 Build succeeds: `npm run build`

#### Manual

- [ ] 1.4 Tables and RLS policies visible in Supabase Studio
- [ ] 1.5 trades_session_id_idx index visible on trades table
- [ ] 1.6 RLS rejects unauthenticated inserts

### Phase 2: Service Layer + API Routes

#### Automated

- [x] 2.1 Type checking passes: `npm run lint` — 3a71883
- [x] 2.2 Build succeeds: `npm run build` — 3a71883

#### Manual

- [ ] 2.3 POST /api/plan with valid data returns 200 with session and plan
- [ ] 2.4 POST /api/plan upserts on second call (no duplicate)
- [ ] 2.5 POST /api/trades with valid data returns 201 with trade
- [ ] 2.6 PUT /api/trades/{id} returns 200 with updated trade
- [ ] 2.7 DELETE /api/trades/{id} returns 200 with success
- [ ] 2.8 API returns 401 without auth, 400 with invalid data

### Phase 3: Plan Page + Form UI

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — e5ff54a
- [x] 3.2 Build succeeds: `npm run build` — e5ff54a

#### Manual

- [ ] 3.3 Plan form loads with all 3 fields, predefined goals display
- [ ] 3.4 Custom goal input appears when "Custom" selected
- [ ] 3.5 Submit → confirmation shows plan summary
- [ ] 3.6 Existing plan pre-fills on page reload
- [ ] 3.7 Edit flow works (pre-filled values, update on resubmit)
- [ ] 3.8 Unauthenticated access redirects to /auth/signin
- [ ] 3.9 "Continue to plan" link from check-in navigates to /plan

### Phase 4: Trades Page + Trade List/Form UI + Dashboard

#### Automated

- [x] 4.1 Lint passes: `npm run lint`
- [x] 4.2 Build succeeds: `npm run build`

#### Manual

- [ ] 4.3 Empty state shows on /trades with no trades
- [ ] 4.4 Add trade inline → appears in list
- [ ] 4.5 Edit trade → form pre-fills → submit → list updates
- [ ] 4.6 Delete trade → removed from list
- [ ] 4.7 Multiple trades display in creation order
- [ ] 4.8 Page refresh → trades persist from database
- [ ] 4.9 Dashboard shows check-in, plan, and trades status cards
- [ ] 4.10 Dashboard plan card shows goal text, trades card shows count
- [ ] 4.11 "Continue to trades" link from plan navigates to /trades
