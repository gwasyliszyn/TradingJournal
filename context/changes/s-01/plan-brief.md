# Pre-market Check-in with Readiness Score — Plan Brief

> Full plan: `context/changes/s-01/plan.md`

## What & Why

Build the first domain feature: a pre-market check-in where the trader rates physical state (sleep, energy, stress, focus) and mental state (dominant emotion, market bias, risk mode), then sees a calculated Readiness Score (0–100). This is the first step of the discipline loop — it shifts the trader's focus from P&L to process quality, and establishes the data/UI patterns that all downstream slices follow.

## Starting Point

The app has working auth (Supabase email+password), a middleware-protected dashboard route, and a cosmic-themed UI. No domain logic, no database schema, no Supabase migrations, and no form patterns beyond text inputs exist. The `supabase/migrations/` directory is empty.

## Desired End State

A logged-in trader navigates to `/checkin`, completes a two-section progressive form, and sees an inline Readiness Score with a color-coded band (green/yellow/orange/red). The check-in persists to Supabase and is editable. The dashboard links to check-in and shows the score. The app interior uses a clean light theme with shadcn/ui design tokens, distinct from the cosmic landing pages.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Navigation | `/checkin` top-level route | Simple URL, one action per screen; Today View (S-04) unifies navigation later |
| Form layout | Two sections (physical → mental) | Progressive disclosure per UX principle; natural grouping keeps it to 2 screens |
| Rating input | Tappable 1–5 button group | Fastest input method, visually clear, no fiddly sliders |
| Dropdown values | Curated short lists (7 emotions, 3 biases, 3 risk modes) | Covers trader psychology without free-text friction |
| Session lifecycle | Auto-create on first check-in | Zero friction; ritual starts the session implicitly |
| Score display | Inline reveal on same page | Instant feedback, no page navigation, preserves the ritual moment |
| App interior styling | Clean light theme with shadcn tokens | Matches Todoist benchmark; reserves cosmic for landing/auth |
| Data model | Separate `sessions` + `check_ins` tables | Clean separation; child tables FK to sessions; user_id on each for uniform RLS |

## Scope

**In scope:**
- Supabase migration: `sessions` + `check_ins` tables with RLS
- TypeScript domain types and const arrays for field values
- Readiness Score calculation (pure function)
- Service layer for session/check-in CRUD
- POST `/api/checkin` JSON API endpoint
- `/checkin` Astro page with React form island
- Two-section progressive form (physical ratings + mental selects)
- Inline score reveal with color band
- Dashboard link and check-in status badge
- Protected route wiring

**Out of scope:**
- Step ordering enforcement
- Session status transitions (S-03/S-04)
- Today View (S-04)
- Dark mode toggle
- Form persistence across page refreshes mid-entry
- Unit test framework setup

## Architecture / Approach

Server-rendered Astro page loads existing check-in data from Supabase, passes it as props to a React island. The React component manages the progressive form flow client-side and submits via `fetch()` to a JSON API route. The API route validates, calculates the score, persists via a service layer, and returns the result. Every table has `user_id` + RLS policy (`auth.uid() = user_id`) for uniform access control.

```
Browser → /checkin (Astro SSR) → loads existing data → React island
         ↓ submit
         POST /api/checkin (JSON) → validate → calculate score → upsert via service → Supabase
         ↓ response
         React shows score inline
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database + types + score logic | Migration, TS types, score calculation | Schema shape sets pattern for all future slices — wrong shape costs migration effort |
| 2. Service + API route | CRUD service, JSON POST endpoint | New API pattern (JSON, not form+redirect) — must be clean since it's the template |
| 3. UI + navigation | Check-in page, form, score display, dashboard link | First app-interior screen — styling direction must match Todoist-level minimalism |

**Prerequisites:** Local Supabase running (`npx supabase start`), existing auth working
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- First migration sets the schema pattern — if the shape is wrong, downstream slices (S-02 through S-05) pay migration costs
- The JSON API pattern diverges from the existing form+redirect auth routes — must be intentional and documented as the standard for domain routes
- Cloudflare Workers 10ms CPU limit should not be a problem for this slice, but worth monitoring after deployment

## Success Criteria (Summary)

- Trader can complete a full check-in (7 fields across 2 sections) and see a Readiness Score with correct color band
- Existing check-ins load on revisit and can be edited with score recalculation
- Data is isolated per user via RLS — no cross-user data access
