# Session History Implementation Plan

## Overview

Implement FR-010: a session history page where the trader can view a list of past sessions (date, Readiness Score, Process Score, status) and click into any session for a read-only detail view showing all completed steps.

## Current State Analysis

All domain tables exist (`sessions`, `check_ins`, `session_plans`, `trades`, `session_reviews`) with RLS policies. Score calculation functions (`getScoreBand`, `getProcessScoreBand`) and service CRUD functions are in place from S-01 through S-03. The Today View (S-04) at `/dashboard` shows today's session. No history view exists.

## Desired End State

A `/history` page displays all past sessions as a card list (most recent first). Each card shows the session date, a status badge (Complete / Incomplete), Readiness Score with color band, and Process Score with color band. Clicking a card navigates to `/history/[id]` where the trader sees a read-only breakdown of every step (check-in, plan, trades, review) with scores. Missing steps display a "Not completed" placeholder. A back link returns to the list. The dashboard links to history.

### Key Discoveries

- `sessions` table has `status` column (`active` | `complete` | `incomplete`) — usable for badge display
- Scores live on child tables: `check_ins.readiness_score` and `session_reviews.process_score` — the list query needs to join these
- `getScoreBand()` and `getProcessScoreBand()` return `{ label, colorClass }` — reusable for badge rendering on both list and detail views
- `trades.result_r` is returned as string by PostgREST — must convert with `Number()` as done in existing `getTradesBySession()`
- Middleware uses prefix matching (`startsWith`) — adding `/history` to `PROTECTED_ROUTES` covers both `/history` and `/history/[id]`

## What We're NOT Doing

- No pagination — load all past sessions at once (single-user MVP, months before volume matters)
- No filtering or search — simple chronological list per PRD ("No filtering or search needed for MVP")
- No editing from history — detail page is read-only; trader uses dashboard for today's session
- Today's session is excluded from history — dashboard owns "now", history owns "past"
- No calendar view — parked to v2 per roadmap

## Implementation Approach

Two-phase, bottom-up: service layer first, then pages and navigation. No new migration needed — all tables exist. The list page and detail page are server-rendered Astro pages with no React islands (read-only data, no interactivity needed). Service functions follow the established pattern from `src/lib/services/`.

## Phase 1: Service Layer + Route Protection

### Overview

Create session listing and detail service functions, add a composite type for history items, and protect the `/history` route.

### Changes Required

#### 1. Session History Types

**File**: `src/types.ts`

**Intent**: Add a `SessionHistoryItem` interface for the list view — a session row enriched with optional scores from child tables.

**Contract**: New exported interface `SessionHistoryItem` with fields: `id`, `session_date`, `status`, `readiness_score: number | null`, `process_score: number | null`. Also add `SessionDetail` interface for the detail view: a `Session` with optional `CheckIn`, `SessionPlan`, `Trade[]`, and `SessionReview`.

#### 2. Session Service

**File**: `src/lib/services/sessions.ts` (new file)

**Intent**: Provide two query functions — one for the history list, one for the full detail view. Follow the same pattern as `checkin.ts` / `review.ts` (accept `SupabaseClient` + IDs, return typed data, throw on error).

**Contract**:
- `getSessionHistory(supabase, userId): Promise<SessionHistoryItem[]>` — queries `sessions` where `user_id` matches and `session_date < today`, ordered by `session_date` DESC. For each session, fetches the `readiness_score` from `check_ins` and `process_score` from `session_reviews` via a joined select or parallel queries.
- `getSessionById(supabase, sessionId, userId): Promise<SessionDetail | null>` — fetches the session (guarded by `user_id`), then parallel-fetches check-in, plan, trades, and review using existing service functions.

#### 3. Route Protection

**File**: `src/middleware.ts`

**Intent**: Protect the `/history` route so unauthenticated visitors redirect to sign-in.

**Contract**: Add `"/history"` to the `PROTECTED_ROUTES` array. Prefix matching in the middleware already covers `/history` and `/history/[id]`.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`
- No new lint errors

#### Manual Verification

- Accessing `/history` while logged out redirects to `/auth/signin`
- Service functions return correct data when called from an Astro page (verified in Phase 2)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: History List Page + Detail Page + Navigation

### Overview

Create the two Astro pages (`/history` and `/history/[id]`) and add a navigation link from the dashboard.

### Changes Required

#### 1. History List Page

**File**: `src/pages/history/index.astro` (new file)

**Intent**: Server-render a card list of past sessions. Each card shows date (formatted as "Jun 11, 2026"), status badge (colored), Readiness Score with band badge, and Process Score with band badge. Cards link to `/history/[session.id]`. Empty state: a message when no past sessions exist.

**Contract**: Astro page using `Layout` with `title="Session History"`. Frontmatter calls `getSessionHistory()` with the current user. Renders inside the established `max-w-lg` centered column layout. Each card uses `bg-card rounded-xl border` styling matching dashboard step-detail rows. Score bands use `getScoreBand()` and `getProcessScoreBand()` with the existing `colorClass` for badge styling. Status badge colors: green for `complete`, gray for `incomplete`. Past sessions with `active` status display with the same gray `Incomplete` badge — they are functionally incomplete.

#### 2. Session Detail Page

**File**: `src/pages/history/[id].astro` (new file)

**Intent**: Server-render a read-only view of a single past session with all its steps. Shows a "← Session History" back link at the top, session date and status, then four sections (Check-in, Plan, Trades, Review). Completed steps display their data; missing steps show a muted "Not completed" placeholder.

**Contract**: Dynamic Astro route. Frontmatter extracts `id` from `Astro.params`, calls `getSessionById()`, returns 404 if not found or user mismatch. Uses the same `max-w-lg` centered layout. Each section renders as a card (`bg-card rounded-xl border`) with a section title. Check-in card shows ratings + Readiness Score band. Plan card shows goal, max trades, max daily loss. Trades card shows a list of trades (instrument, setup, result in R, compliance, mistake). Review card shows plan adherence, what went wrong, rule broken, goal for next session, and Process Score band.

#### 3. Dashboard Navigation Link

**File**: `src/pages/dashboard.astro`

**Intent**: Add a "Session History" link at the bottom of the Today View, above the Sign out button, so traders can discover the history page.

**Contract**: Add an anchor element `<a href="/history">` styled as a secondary text link, consistent with the existing Sign out button styling (text-sm, underline-offset). Placed between the step details list and the sign-out form.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`
- No new lint errors

#### Manual Verification

- Navigate to `/history` — see a list of past sessions sorted by date (most recent first)
- Each session card shows formatted date, status badge, and score badges with correct color bands
- Click a session card — navigate to `/history/[id]` with full session detail
- Detail page shows all completed steps with their data
- Detail page shows "Not completed" placeholder for missing steps
- "← Session History" link navigates back to the list
- Dashboard shows "Session History" link that navigates to `/history`
- Empty state displays correctly when no past sessions exist
- Logged-out access to `/history` or `/history/[id]` redirects to sign-in

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps

1. Create several sessions across different days (some complete, some incomplete) via the existing discipline loop
2. Navigate to `/history` — verify all past sessions appear in correct order with accurate scores and status badges
3. Click into a complete session — verify all four sections display correct data
4. Click into an incomplete session — verify completed steps show data and missing steps show "Not completed"
5. Check score band colors match existing dashboard band colors (green/yellow/orange/red)
6. Test back link from detail page returns to history list
7. Test dashboard "Session History" link navigates correctly
8. Log out — verify both `/history` and `/history/[id]` redirect to sign-in
9. Verify RLS: user A cannot access user B's session detail via direct URL

## Performance Considerations

- All sessions loaded at once — acceptable for MVP. A single-user trading daily accumulates ~250 sessions per year; a simple `SELECT` with `ORDER BY session_date DESC` handles this without performance concern.
- The list query joins check_ins and session_reviews for scores. With unique constraints on `session_id` in both tables, joins are index-backed.
- Detail page uses `Promise.all()` for parallel fetching of check-in, plan, trades, and review — same pattern as the dashboard.

## References

- PRD FR-010: `context/foundation/prd.md`
- Roadmap S-05: `context/foundation/roadmap.md`
- Dashboard pattern: `src/pages/dashboard.astro`
- Service patterns: `src/lib/services/checkin.ts`, `src/lib/services/review.ts`
- Score bands: `src/lib/services/readiness-score.ts`, `src/lib/services/process-score.ts`
- Domain types: `src/types.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Service Layer + Route Protection

#### Automated

- [x] 1.1 Type checking passes: `npm run lint`
- [x] 1.2 Build succeeds: `npm run build`

#### Manual

- [ ] 1.3 Accessing `/history` while logged out redirects to `/auth/signin`

### Phase 2: History List Page + Detail Page + Navigation

#### Automated

- [ ] 2.1 Type checking passes: `npm run lint`
- [ ] 2.2 Build succeeds: `npm run build`

#### Manual

- [ ] 2.3 History list shows past sessions sorted by date (most recent first)
- [ ] 2.4 Each session card shows formatted date, status badge, and score badges with correct color bands
- [ ] 2.5 Click a session card navigates to detail page with full session data
- [ ] 2.6 Detail page shows all completed steps with their data
- [ ] 2.7 Detail page shows "Not completed" placeholder for missing steps
- [ ] 2.8 Back link and dashboard navigation link work correctly
- [ ] 2.9 Empty state displays correctly when no past sessions exist
- [ ] 2.10 Logged-out access to /history or /history/[id] redirects to sign-in
