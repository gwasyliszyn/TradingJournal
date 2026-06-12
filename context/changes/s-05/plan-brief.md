# Session History — Plan Brief

> Full plan: `context/changes/s-05/plan.md`

## What & Why

Implement FR-010: a session history page where the trader can view past sessions with date, Readiness Score, Process Score, and status, and click into any session for a read-only detail view. History is how the trader spots patterns and tracks discipline consistency — without it, each session exists in isolation.

## Starting Point

All domain tables exist (sessions, check_ins, session_plans, trades, session_reviews) with RLS policies. Score calculation and band functions are in place from S-01–S-03. The Today View (S-04) shows today's session at `/dashboard`. No history view, no session listing service, and no detail page exist.

## Desired End State

A `/history` page shows all past sessions as a card list (most recent first). Each card displays formatted date, status badge (Complete/Incomplete), and score badges with color bands. Clicking a card navigates to `/history/[id]` showing a read-only breakdown of all session steps. The dashboard links to history. Today's session is excluded from history — dashboard owns "now."

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| List format | Card list (vertical stack) | Consistent with dashboard card/badge patterns and max-w-lg layout |
| Detail navigation | Separate /history/[id] page | One-action-per-screen UX principle; consistent with page-per-step pattern |
| Pagination | None — load all sessions | Single-user MVP won't hit volume issues for months |
| Navigation entry | Link on dashboard (above Sign out) | Discoverable from main screen without adding a nav bar |
| Incomplete sessions | Show completed steps + "Not completed" placeholder | Trader sees exactly how far they got |
| Status badges | Yes — colored per status | Instant visual scan of discipline consistency |
| Back navigation | Explicit "← Session History" link | Predictable, doesn't rely on browser state |
| Today's session | Excluded from history list | Clean separation: dashboard = now, history = past |

## Scope

**In scope:**
- Session listing service function (join scores from child tables)
- Session detail service function (reuse existing per-step service functions)
- `/history` list page with card rows
- `/history/[id]` read-only detail page
- Route protection for `/history`
- Dashboard link to history
- Empty state when no past sessions exist

**Out of scope:**
- Pagination, filtering, search
- Calendar view (v2)
- Editing sessions from history
- Today's session in history list

## Architecture / Approach

Server-rendered Astro pages, no React islands needed (read-only data). New `src/lib/services/sessions.ts` provides `getSessionHistory()` (list with scores) and `getSessionById()` (full detail via parallel fetches of existing service functions). Two new Astro pages under `src/pages/history/`. Middleware updated to protect `/history` route.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Service layer + route protection | Query functions for list and detail, types, protected route | Low — follows established service patterns |
| 2. History list + detail page + navigation | Both pages, dashboard link, empty state | Low — server-rendered Astro, no complex state |

**Prerequisites:** S-03 complete (all domain tables and score functions exist) — already done.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes past sessions have been created via the discipline loop — if no sessions exist, empty state is shown
- No unit test framework yet (Module 3) — verification is manual + type checks

## Success Criteria (Summary)

- Trader can navigate to `/history` from the dashboard and see a chronological list of past sessions with scores and status
- Trader can click into any session and see a read-only breakdown of all completed steps
- Authentication is enforced — logged-out users redirect to sign-in
