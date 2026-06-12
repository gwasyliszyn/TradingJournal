# Today View Implementation Plan

## Overview

Replace the current basic card-list dashboard (`src/pages/dashboard.astro`) with a Today View that presents the discipline loop as a cohesive flow. A horizontal stepper shows step completion state (completed/current/pending), highlights the suggested next step, and displays Readiness Score and Process Score prominently when the session is complete. No database, API, or service changes — this is a pure presentation layer rewrite.

## Current State Analysis

The existing `src/pages/dashboard.astro` (197 lines) shows four independent cards with completion status and action links. It already loads all necessary data via `Promise.all([getCheckinBySession, getPlanBySession, getTradesBySession, getReviewBySession])`. The data fetching pattern is correct and will be preserved — only the template and presentation layer changes.

### Key Discoveries:

- Data loading logic in dashboard frontmatter (lines 25-79) already fetches all session entities in parallel — reuse as-is
- Score band functions (`getScoreBand`, `getProcessScoreBand`) already return `{label, colorClass}` — reuse for score display
- All four step pages (`/checkin`, `/plan`, `/trades`, `/review`) exist and handle both create and edit flows
- Middleware already protects `/dashboard` — no routing changes needed
- The page is server-rendered Astro with no client JS — the Today View stays server-rendered

## Desired End State

The `/dashboard` route shows a polished Today View with:
1. A horizontal stepper bar (Check-in → Plan → Trades → Review) where each step shows completed (checkmark), current/suggested (highlighted), or pending (dimmed) state
2. Below the stepper, a focused content area showing the suggested next step's CTA or, when all steps are done, a summary with both scores displayed prominently
3. A compact step list below the stepper content showing completion status and links to each step
4. Sign-out link at the bottom

**Verification**: Navigate to `/dashboard` as an authenticated user. The stepper reflects actual session state. Clicking step links navigates to the correct pages. Completing all steps shows both scores with correct color bands.

## What We're NOT Doing

- No new database tables or migrations
- No new API routes or services
- No new React components — the entire page is server-rendered Astro
- No enforced step ordering — all steps remain clickable regardless of completion state
- No session history link (that's S-05)
- No animated transitions between states

## Implementation Approach

Single-phase rewrite of `dashboard.astro`. Extract the stepper into a reusable Astro component (`src/components/Stepper.astro`) so it can be reused by S-05 or other pages. The page continues to use the existing data fetching pattern but renders a stepper-based layout instead of independent cards.

## Phase 1: Stepper Component + Page Redesign

### Overview

Build a server-rendered Astro stepper component and rewrite the dashboard page template to present the discipline loop as a cohesive flow with clear visual progression.

### Changes Required:

#### 1. Stepper component

**File**: `src/components/Stepper.astro`

**Intent**: Create a reusable horizontal stepper that renders 4 steps (Check-in, Plan, Trades, Review) with completed/current/pending visual states. Each step is a link to its page. The stepper accepts step definitions and completion flags via props.

**Contract**: Astro component accepting a `steps` prop — an array of `{ label: string; href: string; completed: boolean }`. Renders a horizontal bar with connected step indicators. Completed steps show a checkmark icon, the first incomplete step is visually highlighted as "current" (suggested next), remaining steps are dimmed. All steps are always clickable (no enforcement). Uses Tailwind utility classes consistent with the existing `bg-card`, `text-foreground`, `text-muted-foreground` theme tokens.

#### 2. Dashboard page rewrite

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the four independent cards with the stepper-based Today View layout. Keep the existing frontmatter data loading logic intact. Restructure the template into three sections: (1) stepper bar at top, (2) main content area showing either the suggested next step CTA or a completion summary with both scores, (3) compact step status list with edit/start links.

**Contract**: The frontmatter keeps the same data loading pattern (session query → parallel entity fetches → flag/score extraction). The template renders:
- Page title "Today" (not "Dashboard")
- The `Stepper` component with steps derived from `checkinExists`, `planExists`, `tradesExist`, `reviewExists`
- A main content card: if all 4 steps complete, show Readiness Score and Process Score side by side with color bands; if not all complete, show a CTA card for the first incomplete step (label + description + prominent button linking to that step's page)
- Below the main card, a compact list of all 4 steps showing status (completed badge or "Pending") and action link (Edit if completed, Start if not)
- Sign-out link at bottom

#### 3. Protected route label update

**File**: `src/middleware.ts`

**Intent**: No functional change needed — `/dashboard` is already protected. Just confirming no middleware edits required.

**Contract**: No changes. The `/dashboard` path is already in `PROTECTED_ROUTES`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`
- No new lint errors introduced

#### Manual Verification:

- Navigate to `/dashboard` with no session data — stepper shows all steps as pending, CTA suggests Check-in as first step
- Complete check-in, return to dashboard — stepper shows step 1 completed, CTA suggests Plan
- Complete all 4 steps — stepper shows all completed, summary shows both Readiness Score and Process Score with correct color bands
- Click any step link — navigates to the correct page regardless of completion state
- Score bands display correct colors: green (80+), yellow (60-79), orange (40-59), red (0-39)
- Page renders correctly with no client-side JS (view source confirms no script tags from this page)
- Sign-out button works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None needed — no business logic changes, no services or API routes modified

### Integration Tests:

- None needed — server-rendered page with existing data fetching

### Manual Testing Steps:

1. Sign in and visit `/dashboard` with a fresh session (no data) — verify stepper shows 4 pending steps, CTA points to Check-in
2. Complete check-in via `/checkin`, return to `/dashboard` — verify step 1 shows checkmark, CTA points to Plan, Readiness Score visible in step list
3. Complete plan via `/plan`, return to `/dashboard` — verify steps 1-2 completed, CTA points to Trades
4. Add trades via `/trades`, return to `/dashboard` — verify steps 1-3 completed, CTA points to Review
5. Complete review via `/review`, return to `/dashboard` — verify all 4 steps completed, summary shows both scores with bands
6. Click "Edit" on any completed step — verify navigation works and pre-filled data is shown
7. Verify sign-out works from the Today View

## Performance Considerations

No performance impact — the data fetching pattern is identical to the current dashboard. The page remains fully server-rendered with zero client JS.

## Migration Notes

No migration needed. This is a drop-in replacement of the dashboard template. The route (`/dashboard`), data loading, and middleware protection remain unchanged.

## References

- Current dashboard: `src/pages/dashboard.astro`
- Score services: `src/lib/services/readiness-score.ts`, `src/lib/services/process-score.ts`
- PRD FR-003: Today View requirement
- PRD Open Question 1: Step ordering is suggestive, not enforced

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Stepper Component + Page Redesign

#### Automated

- [x] 1.1 Type checking passes: `npm run lint`
- [x] 1.2 Build succeeds: `npm run build`
- [x] 1.3 No new lint errors introduced

#### Manual

- [x] 1.4 Empty session shows all steps pending with Check-in CTA
- [x] 1.5 Partial completion shows correct stepper state and next-step CTA
- [x] 1.6 Full completion shows both scores with correct color bands
- [x] 1.7 All step links navigate correctly regardless of completion state
- [x] 1.8 Sign-out works from Today View
