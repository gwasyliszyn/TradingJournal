# Session Plan and Trade Logging — Plan Brief

> Full plan: `context/changes/s-02/plan.md`

## What & Why

Add session plan creation and trade logging to the discipline loop — the second and third steps after check-in. A trader sets a goal, max trade count, and max daily loss before trading, then logs individual trades with instrument, result in R, plan compliance, and main mistake. This data feeds into S-03's Process Score calculation, which is the north star of the product.

## Starting Point

S-01 is complete. The app has working auth, a `sessions` + `check_ins` schema with RLS, a service layer, a JSON API route, and a `/checkin` page with a React form island. The dashboard shows one check-in status card. The check-in score display already links to `/plan`. No plan or trade tables, services, or UI exist yet.

## Desired End State

A logged-in trader navigates to `/plan`, fills a 3-field form (goal, max trades, max daily loss in R), and sees a confirmation. They then navigate to `/trades`, add trades to an inline list (5 fields each), and can edit or delete them. The dashboard shows three status cards (check-in, plan, trades) reflecting today's session state. All data persists and is user-scoped via RLS.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Goal input | Predefined options + custom text | Enables cross-session goal analysis while keeping flexibility for unique goals | Plan |
| Result in R | Fixed 0.25R increments via stepper | Prevents typos while matching the granularity traders actually use | Plan |
| Plan compliance | Yes / No / Partial selector | Quick to fill, unambiguous, directly feeds Process Score's "majority aligned" check | Plan |
| Main mistake | Predefined list + custom text | Consistent with goal pattern; enables mistake frequency analysis | Plan |
| Trade list UX | Inline list with add button | One page, no navigation away, quick to add 1–5 trades per session | Plan |
| Trade editing | Full edit + delete per trade | Matches PRD Open Question #2 (all forms allow re-editing) | Plan |
| Page layout | Separate /plan and /trades | Follows S-01's one-page-per-step pattern; plan is filled once, trades added throughout the session | Plan |
| DB table naming | `session_plans` + `trades` | `session_plans` avoids ambiguity; `trades` is the natural domain term | Plan |

## Scope

**In scope:**
- Supabase migration: `session_plans` + `trades` tables with RLS
- TypeScript domain types and const arrays (goals, mistakes, compliances)
- Plan service (upsert, get) + trade service (CRUD, list)
- POST `/api/plan`, POST `/api/trades`, PUT/DELETE `/api/trades/[id]`
- `/plan` Astro page with React form island (single-screen, 3 fields)
- `/trades` Astro page with trade list + inline add/edit form
- Reusable components: GoalSelector, MistakeSelector, RValueStepper
- Dashboard: plan and trades status cards
- Navigation wiring between check-in → plan → trades

**Out of scope:**
- Process Score calculation (S-03)
- Session status transitions (S-03)
- Today View (S-04)
- Trade import / broker integration
- Trade list pagination or reordering
- Dark mode

## Architecture / Approach

Same architecture as S-01: Astro SSR pages load data from Supabase, pass to React islands. React components manage form state client-side and submit via `fetch()` to JSON API routes. API routes validate, persist via service layer, return JSON. Every table has `user_id` + RLS.

The key structural addition is the one-to-many trades pattern: `session_plans` uses upsert (like check-ins), but `trades` needs individual CRUD with two API files (`/api/trades.ts` for POST, `/api/trades/[id].ts` for PUT/DELETE).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database + types | Migration, TS interfaces, const arrays | Schema must match what S-03's Process Score formula needs |
| 2. Service + API routes | Plan CRUD, trade CRUD, 3 API endpoints | Trade API introduces a new pattern (individual CRUD vs upsert) |
| 3. Plan page + form UI | /plan page, goal selector, R-value stepper | First use of text input + predefined options hybrid pattern |
| 4. Trades page + dashboard | /trades list+form, dashboard cards | Most UI-intensive phase — inline edit/delete is new to codebase |

**Prerequisites:** S-01 complete, local Supabase running, existing auth working
**Estimated effort:** ~2 sessions across 4 phases

## Open Risks & Assumptions

- The `session_plans` and `trades` schema must store what S-03's Process Score formula needs (+20 for max daily loss not exceeded, +20 for majority trades aligned, +20 for no critical rule broken). The `plan_compliance` and `main_mistake` fields plus the plan's `max_daily_loss_r` should cover this, but S-03 planning may surface gaps.
- The predefined goals and mistakes lists are first-pass — the trader may want to adjust them after using the app.

## Success Criteria (Summary)

- Trader can create a session plan with goal, max trades, and max daily loss, and edit it after submission
- Trader can add, edit, and delete individual trades within today's session
- Dashboard shows check-in, plan, and trades status reflecting today's session state
