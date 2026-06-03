# Pre-market Check-in with Readiness Score — Implementation Plan

## Overview

Build the first domain feature of the Trading Discipline System: a pre-market check-in form where a trader rates their physical and mental state, and receives a calculated Readiness Score (0–100). This is roadmap slice S-01 — it establishes the database schema pattern (sessions + child tables with RLS), the API route pattern for domain logic, and the app interior styling direction that all downstream slices follow.

## Current State Analysis

The app has authentication (email + password via Supabase), a middleware layer that attaches `context.locals.user` and protects routes, and a placeholder dashboard page. No domain logic, no database schema, and no Supabase migrations exist yet. The UI layer has a `FormField` component for text inputs, a shadcn/ui `Button`, and a cosmic/glassmorphism theme used on all pages. There are no form patterns for ratings, selects, or non-text inputs.

## Desired End State

A logged-in trader navigates to `/checkin`, completes a two-section form (physical state ratings + mental state selections), and sees an inline Readiness Score with color-coded interpretation band. The check-in is persisted to Supabase via a `sessions` + `check_ins` schema with row-level security. Existing check-ins for today are pre-filled for editing. The dashboard links to the check-in page and shows whether today's check-in is complete.

**Verification:** Log in → navigate to /checkin → fill all 7 fields → submit → see Readiness Score (0–100) with correct color band. Refresh → data persists. Edit → score recalculates. Log out and in → data still present. Second user cannot see first user's data.

### Key Discoveries

- `src/middleware.ts:4` — `PROTECTED_ROUTES` array controls auth gating; adding `/checkin` is a one-line change
- `src/pages/api/auth/signin.ts` — existing API routes use form data + redirect; the check-in API will diverge to JSON request/response for the inline score reveal
- `src/env.d.ts:2` — `Locals.user` is typed as `import("@supabase/supabase-js").User | null`; the Supabase client is already available in API route context
- `src/styles/global.css` — shadcn/ui design tokens (background, foreground, card, primary, muted, etc.) are defined for both light and dark mode; the app interior will use these instead of the cosmic theme
- `supabase/migrations/` — empty directory; this is the first migration and sets the schema pattern
- `src/components/auth/FormField.tsx` — text-input-only component; we need new input patterns for ratings and option selects

## What We're NOT Doing

- **No step ordering enforcement.** The PRD says steps are suggested, not forced. We don't block trade logging if check-in is missing.
- **No session status transitions.** The `status` column exists for downstream slices (S-03/S-04). S-01 only creates sessions with `active` status.
- **No Today View.** That's S-04. The dashboard gets a minimal link and status indicator, not a full session overview.
- **No form persistence across page reloads mid-entry.** If the user refreshes mid-form without submitting, unsaved field values are lost. Acceptable for a 2-minute form.
- **No dark mode implementation.** CSS variables exist for dark mode but we don't toggle it. Light theme only for now.

## Implementation Approach

Three phases, each independently verifiable:

1. **Database + types + score logic** — Create the Supabase migration, TypeScript domain types, and the pure Readiness Score calculation. Verifiable by applying the migration and running the type checker.
2. **Service layer + API** — CRUD service for sessions/check-ins and a JSON API endpoint. Verifiable by calling the API.
3. **UI + navigation** — Astro page, React form island with progressive disclosure, score display, and navigation wiring. Verifiable by completing the full flow in a browser.

## Critical Implementation Details

### Data model pattern

Every child table (check_ins now; trades, plans, reviews in future slices) carries its own `user_id` column alongside the `session_id` FK. This denormalization makes RLS policies uniform (`auth.uid() = user_id`) across all tables, avoiding subquery joins in policies. Downstream slices must follow this pattern.

### API divergence from auth routes

The existing auth API routes accept `formData` and redirect. The check-in API accepts JSON and returns JSON — a different pattern needed because the score reveal is inline (no page navigation). This becomes the standard pattern for all domain API routes going forward.

---

## Phase 1: Database Schema + Domain Types + Business Logic

### Overview

Create the foundational data layer: Supabase migration with `sessions` and `check_ins` tables, RLS policies, TypeScript domain types, and the Readiness Score calculation function. This phase touches no UI — it's the schema contract that all downstream slices build on.

### Changes Required

#### 1. Supabase migration

**File**: `supabase/migrations/20260603000000_create_sessions_and_checkins.sql`

**Intent**: Create the `sessions` and `check_ins` tables with proper constraints, indexes, RLS policies, and an `updated_at` trigger. This is the first migration and establishes the pattern for all future domain tables.

**Contract**:

`sessions` table:
- `id` uuid PK (gen_random_uuid)
- `user_id` uuid NOT NULL FK → auth.users ON DELETE CASCADE
- `session_date` date NOT NULL
- `status` text NOT NULL DEFAULT 'active', CHECK IN ('active', 'complete', 'incomplete')
- `created_at` timestamptz NOT NULL DEFAULT now()
- `updated_at` timestamptz NOT NULL DEFAULT now()
- UNIQUE (user_id, session_date)

`check_ins` table:
- `id` uuid PK (gen_random_uuid)
- `session_id` uuid NOT NULL FK → sessions ON DELETE CASCADE, UNIQUE
- `user_id` uuid NOT NULL FK → auth.users ON DELETE CASCADE
- `sleep` smallint NOT NULL CHECK 1–5
- `energy` smallint NOT NULL CHECK 1–5
- `stress` smallint NOT NULL CHECK 1–5
- `focus` smallint NOT NULL CHECK 1–5
- `emotion` text NOT NULL
- `market_bias` text NOT NULL
- `risk_mode` text NOT NULL
- `readiness_score` smallint NOT NULL CHECK 0–100
- `created_at` timestamptz NOT NULL DEFAULT now()
- `updated_at` timestamptz NOT NULL DEFAULT now()

RLS: Enable on both tables. Policy pattern: `auth.uid() = user_id` for SELECT, INSERT, UPDATE, DELETE. No public access.

Include a reusable `set_updated_at()` trigger function applied to both tables.

#### 2. Domain types

**File**: `src/types.ts` (new file)

**Intent**: Define TypeScript types for sessions, check-ins, and check-in form data. Also export the allowed values for emotion, market bias, and risk mode as const arrays so they're shared between validation and UI rendering.

**Contract**:

- `Session` type matching the sessions table shape
- `CheckIn` type matching the check_ins table shape
- `CheckInFormData` type for the 7 form fields (without computed/system fields)
- `EMOTIONS` const array: `['confident', 'calm', 'anxious', 'fearful', 'excited', 'frustrated', 'greedy']`
- `MARKET_BIASES` const array: `['bullish', 'bearish', 'neutral']`
- `RISK_MODES` const array: `['normal', 'reduced', 'no-trade']`
- `ScoreBand` type: `{ label: string; colorClass: string }`

#### 3. Readiness Score service

**File**: `src/lib/services/readiness-score.ts`

**Intent**: Pure functions for calculating the Readiness Score and mapping it to an interpretation band. No database access — these are deterministic transforms.

**Contract**:

- `calculateReadinessScore(sleep, energy, stress, focus)` → number (0–100, integer). Formula from PRD: average of (sleep, energy, focus, 6−stress), scaled from 1–5 range to 0–100. Round to nearest integer (`Math.round`). Score is always an integer 0–100.
- `getScoreBand(score)` → `ScoreBand`. Bands per PRD: 80–100 green/good, 60–79 yellow/cautious, 40–59 orange/reduced risk, 0–39 red/no-trade recommended.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset` (requires local Supabase running)
- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Tables `sessions` and `check_ins` visible in Supabase Studio (localhost:54323)
- RLS policies appear in Studio under each table's policies tab
- Inserting a row without auth context is rejected by RLS

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Service Layer + API Route

### Overview

Build the data access service for creating/reading/updating sessions and check-ins, and a POST API endpoint that accepts JSON, persists the check-in, calculates the score, and returns a JSON response. This phase connects the database layer to HTTP but adds no UI.

### Changes Required

#### 1. Check-in service

**File**: `src/lib/services/checkin.ts`

**Intent**: Encapsulate all Supabase queries for sessions and check-ins. The API route and Astro page both call these functions — they never query Supabase directly.

**Contract**:

- `getOrCreateTodaySession(supabase, userId)` → `Session`. Queries for a session with today's date for this user. If none exists, inserts one with status `active` and returns it. Uses upsert on the unique (user_id, session_date) constraint.
- `getCheckinBySession(supabase, sessionId)` → `CheckIn | null`. Returns the check-in for a given session, or null.
- `upsertCheckin(supabase, sessionId, userId, data: CheckInFormData, readinessScore: number)` → `CheckIn`. Inserts or updates the check-in for this session (keyed by the unique session_id constraint). Returns the persisted row.
- `getTodayCheckin(supabase, userId)` → `{ session: Session; checkin: CheckIn | null } | null`. Convenience function: gets today's session and its check-in in one call. Returns null if no session exists.

The `supabase` parameter is the server client from `createClient()` in `src/lib/supabase.ts`.

#### 2. API route

**File**: `src/pages/api/checkin.ts`

**Intent**: POST endpoint that creates or updates today's check-in. Accepts JSON (not form data), validates input, calculates the Readiness Score, persists via the service, and returns JSON (not a redirect). This establishes the pattern for all future domain API routes.

**Contract**:

- Method: POST only
- Auth: Check `context.locals.user` (set by middleware). Return 401 JSON if null. Create Supabase client via `createClient(context.request.headers, context.cookies)` for DB queries.
- Request body (JSON): `{ sleep: number, energy: number, stress: number, focus: number, emotion: string, market_bias: string, risk_mode: string }`
- Validation: All fields required. Ratings 1–5. Emotion/bias/risk must be in the allowed const arrays from `src/types.ts`.
- On success: Return 200 JSON: `{ session: Session, checkin: CheckIn, readiness_score: number, score_band: ScoreBand }`
- On validation error: Return 400 JSON: `{ error: string }`
- On auth error: Return 401 JSON: `{ error: string }`
- On server error: Return 500 JSON: `{ error: string }`

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- POST /api/checkin with valid JSON body and auth cookie returns 200 with correct score
- POST /api/checkin without auth returns 401
- POST /api/checkin with invalid data (rating=6, unknown emotion) returns 400
- Second POST for the same day updates the existing check-in (upsert), not duplicates
- Score calculation matches PRD formula: all-5 sleep/energy/focus + stress=1 → score 100; all-1 + stress=5 → score 0

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Check-in Page + Form UI + Navigation

### Overview

Build the user-facing check-in experience: the `/checkin` Astro page, a React form island with two-section progressive disclosure, reusable input components (rating button group, option selector), inline score reveal, and navigation wiring (protected route + dashboard link). This is the phase where the feature becomes real for the trader.

### Changes Required

#### 1. Install shadcn/ui components

**Intent**: Add the shadcn/ui components needed for the app interior (clean light theme). The auth pages used custom glassmorphism styling; the check-in page uses the standard shadcn design tokens.

**Contract**: Run `npx shadcn@latest add card label badge` (or whichever subset the implementer needs). Components land in `src/components/ui/`. Use the "new-york" style already configured.

#### 2. Rating button group component

**File**: `src/components/checkin/RatingGroup.tsx`

**Intent**: Reusable input for 1–5 ratings. Renders 5 tappable buttons in a row. Selected button is visually distinct (filled/primary). Used for sleep, energy, stress, and focus fields.

**Contract**:

- Props: `{ name: string; label: string; value: number | null; onChange: (value: number) => void; description?: string }`
- Renders a label, 5 buttons (1–5), and optional description text
- Selected state uses primary variant; unselected uses outline variant
- Accessible: buttons have aria-pressed, group has role and aria-label

#### 3. Option selector component

**File**: `src/components/checkin/OptionSelector.tsx`

**Intent**: Reusable input for selecting one option from a short list. Renders all options as visible, tappable chips/buttons (not a dropdown). Used for emotion (7 options), market bias (3 options), and risk mode (3 options).

**Contract**:

- Props: `{ name: string; label: string; options: readonly string[]; value: string | null; onChange: (value: string) => void }`
- Renders a label and a flex-wrap group of option buttons
- Selected state visually distinct from unselected
- Options display with capitalized, human-readable labels (e.g., `'no-trade'` → `'No-trade'`)

#### 4. Score display component

**File**: `src/components/checkin/ScoreDisplay.tsx`

**Intent**: Shows the Readiness Score after check-in submission. Big number, color-coded band badge, interpretation text, and a link to continue (or edit).

**Contract**:

- Props: `{ score: number; band: ScoreBand; onEdit: () => void }`
- Displays the score prominently (large text)
- Band badge with color matching the band (green/yellow/orange/red via the `colorClass` from `ScoreBand`)
- Interpretation text: band label + one-line guidance (e.g., "Good — you're ready to trade")
- "Edit check-in" button that calls `onEdit`
- "Continue to plan" link (navigates to /plan — will 404 until S-02, acceptable)

#### 5. Check-in form component

**File**: `src/components/checkin/CheckinForm.tsx`

**Intent**: Main React island for the check-in page. Manages the two-section progressive form flow, submission via fetch to `/api/checkin`, and transition to the score display. Handles both fresh check-ins and editing existing ones.

**Contract**:

- Props: `{ existingCheckin?: CheckIn | null }` — pre-filled data when editing
- Internal state: current section (`physical` | `mental` | `result`), form field values, submission loading/error state, score result
- Section 1 (physical): Four `RatingGroup` inputs (sleep, energy, stress, focus). "Next" button enabled when all four are selected.
- Section 2 (mental): Three `OptionSelector` inputs (emotion, market bias, risk mode). "Submit" button enabled when all three are selected. Shows loading state during submission.
- Result: `ScoreDisplay` component with the returned score and band. "Edit" returns to section 1 with values pre-filled.
- Submission: `fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })`. On success, transition to result section. On error, show error message inline.
- If `existingCheckin` is provided: pre-fill all fields from it and start at the result section (showing existing score). "Edit" button switches to section 1 with pre-filled values.
- Uses `client:load` directive for immediate hydration (form must be interactive on page load).

#### 6. Check-in Astro page

**File**: `src/pages/checkin.astro`

**Intent**: Server-rendered page that loads existing session/check-in data and renders the CheckinForm React island. Uses the clean light theme (no cosmic background).

**Contract**:

- Frontmatter: imports Layout, gets user from `Astro.locals`, calls `getTodayCheckin(supabase, user.id)` to load existing data
- Renders inside `Layout` with title "Check-in"
- Page wrapper uses `bg-background text-foreground` (shadcn tokens, not cosmic)
- Centered, max-width container with heading "Pre-market Check-in"
- Renders `<CheckinForm client:load existingCheckin={checkin} />`

#### 7. Middleware + dashboard updates

**File**: `src/middleware.ts`

**Intent**: Add `/checkin` to the protected routes array.

**Contract**: Add `"/checkin"` to the `PROTECTED_ROUTES` array.

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the placeholder dashboard with a minimal hub that links to the check-in and shows whether today's check-in is complete.

**Contract**:

- Frontmatter: load today's session/check-in status via `getTodayCheckin()`
- Show a "Start check-in" or "Edit check-in" link to `/checkin` based on whether a check-in exists
- If check-in exists, show the Readiness Score as a small badge
- Keep the sign-out button
- Use clean light theme styling (bg-background, not cosmic)

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Navigate to /checkin while logged in → form loads at section 1
- Fill all 4 ratings → "Next" becomes enabled → click → section 2 appears
- Fill all 3 selects → "Submit" becomes enabled → click → score appears with correct color band
- Score matches manual calculation of the Readiness Score formula
- Refresh the page → form shows existing check-in in result view
- Click "Edit" → form returns to section 1 with all values pre-filled
- Edit a rating → submit → score recalculates
- Navigate to /checkin while logged out → redirects to /auth/signin
- Dashboard shows link to check-in and displays score badge after check-in is complete
- App interior uses clean light theme (no cosmic gradient)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

No unit test framework is configured in the project. For this MVP slice, correctness is verified through type checking, linting, and manual testing. If a test runner is added later, priority targets:

- Readiness Score calculation: boundary values (all 1s, all 5s, mixed), score band thresholds
- Input validation: reject out-of-range ratings, unknown emotion/bias/risk values

### Manual Testing Steps

1. Start local Supabase: `npx supabase start`
2. Apply migration: `npx supabase db reset`
3. Start dev server: `npm run dev`
4. Sign up / sign in
5. Navigate to /checkin
6. Complete section 1 (physical ratings) → verify "Next" only enables when all 4 are filled
7. Complete section 2 (mental selects) → verify "Submit" only enables when all 3 are filled
8. Submit → verify score appears with correct band color
9. Verify score matches manual calculation: `((sleep + energy + focus + (6 - stress)) / 4 - 1) / 4 * 100`
10. Refresh page → verify existing check-in data loads
11. Edit check-in → verify score recalculates
12. Check dashboard → verify check-in status and score badge
13. Open Supabase Studio → verify data in sessions and check_ins tables
14. Test RLS: in Studio SQL editor, try to SELECT another user's session — should return empty

## Performance Considerations

Minimal for this slice. One Supabase query on page load (today's session + check-in), one upsert on submit. No client-side state management library needed — React useState is sufficient for a 7-field form. The Readiness Score is a pure arithmetic calculation with no measurable cost.

The main consideration is Cloudflare Workers' 10ms CPU limit on the free tier. An SSR page with one Supabase query + React hydration should stay well under this. Monitor via `wrangler tail` after deployment.

## Migration Notes

This is the first Supabase migration. Prerequisites:
- Local Supabase must be running (`npx supabase start`)
- Migration applies via `npx supabase db reset` (resets and replays all migrations)
- For remote/production: `npx supabase db push` after connecting to the hosted project

The sessions table shape is intentionally forward-looking: the `status` column and the one-session-per-date constraint anticipate S-02 through S-04 without requiring schema changes. The check_ins table uses a UNIQUE on session_id (one check-in per session) to support upsert semantics.

## References

- PRD: `context/foundation/prd.md` — FR-004, FR-005 (check-in fields), Business Logic (Readiness Score formula)
- Roadmap: `context/foundation/roadmap.md` — S-01 definition, risk note about schema pattern
- Existing auth form pattern: `src/components/auth/SignInForm.tsx`
- Existing API route pattern: `src/pages/api/auth/signin.ts`
- Middleware: `src/middleware.ts:4` — PROTECTED_ROUTES
- Supabase client: `src/lib/supabase.ts`
- Design tokens: `src/styles/global.css` — shadcn/ui CSS variables

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema + Domain Types + Business Logic

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 8ab3e08
- [x] 1.2 Type checking passes: `npm run lint` — 8ab3e08
- [x] 1.3 Build succeeds: `npm run build` — 8ab3e08

#### Manual

- [ ] 1.4 Tables and RLS policies visible in Supabase Studio
- [ ] 1.5 RLS rejects unauthenticated inserts

### Phase 2: Service Layer + API Route

#### Automated

- [x] 2.1 Type checking passes: `npm run lint` — dab6a5f
- [x] 2.2 Build succeeds: `npm run build` — dab6a5f

#### Manual

- [ ] 2.3 POST /api/checkin with valid data returns 200 with correct score
- [ ] 2.4 POST /api/checkin without auth returns 401
- [ ] 2.5 POST /api/checkin with invalid data returns 400
- [ ] 2.6 Second POST upserts (no duplicate check-in)
- [ ] 2.7 Score calculation matches PRD formula at boundary values

### Phase 3: Check-in Page + Form UI + Navigation

#### Automated

- [x] 3.1 Lint passes: `npm run lint`
- [x] 3.2 Build succeeds: `npm run build`

#### Manual

- [ ] 3.3 Full check-in flow works in browser (section 1 → section 2 → score)
- [ ] 3.4 Score displays with correct color band
- [ ] 3.5 Existing check-in pre-fills on page reload
- [ ] 3.6 Edit flow works (pre-filled values, score recalculates)
- [ ] 3.7 Unauthenticated access redirects to /auth/signin
- [ ] 3.8 Dashboard shows check-in link and score badge
- [ ] 3.9 App interior uses clean light theme (no cosmic gradient)
