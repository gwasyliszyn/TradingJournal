# Post-Session Review + Process Score — Plan Brief

> Full plan: `context/changes/s-03/plan.md`

## What & Why

Build a post-session review form (4 fields) and a deterministic Process Score (0–100) that tells the trader "did I follow my process today?" — independent of P&L. This is the north-star slice: the first moment the product delivers its core hypothesis that scoring process quality changes trader behavior.

## Starting Point

S-01 (check-in + readiness score) and S-02 (plan + trade logging) are implemented. The database has `sessions`, `check_ins`, `session_plans`, and `trades` tables. The service layer, API routes, and UI follow a consistent pattern (migration → types → service → API → page → dashboard card). The "Continue to review" link is already wired in the trades page pointing to `/review`.

## Desired End State

The trader navigates to `/review`, fills a quick form (plan adherence, what went wrong, rule broken, goal for next session), and submits. The app computes a Process Score from the full session data and displays it with a 6-component breakdown checklist showing exactly where points were earned or lost. The session is auto-marked as `complete`. The dashboard shows a 4th card with the Process Score and color band.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Plan adherence field type | Enum (yes/no/partial) | Consistent with trade-level plan_compliance; feeds directly into score calculation |
| Rule broken field type | Yes/No boolean toggle | Maps directly to the +20 Process Score component; "what went wrong" captures detail |
| Goal for next session | Reuse SESSION_GOALS + custom | Same GoalSelector component; consistent UX across plan and review |
| "Majority" threshold | >50% trades with compliance 'yes' | Simple, intuitive; 'partial' counts as non-compliant |
| Daily loss calculation | Sum of absolute negative result_r | Winning trades don't mask losing trades; matches risk management intent |
| Session completion trigger | Auto-complete on review submit | Review IS the final step; no extra button needed |
| Score display | Score + 6-component breakdown | Transparency drives behavior change — the core product insight |
| No-trade sessions | Allow review, trade components = 0 | Supports "no-trade is a valid session"; max score is 60 on no-trade days |

## Scope

**In scope:**
- `session_reviews` table with RLS (one-to-one with session, upsert semantics)
- Process Score calculation service (pure function, 6 components totaling 100 points)
- `/api/review` endpoint (validates, gathers session data, computes score, persists, completes session)
- `/review` page with form and Process Score breakdown display
- Dashboard 4th card showing Process Score

**Out of scope:**
- Auto-recalculation of score when trades change after review
- Session history (S-05)
- Today View (S-04)
- Step enforcement (all steps optional; fewer steps = lower score)
- Pre-filling tomorrow's plan from review's goal

## Architecture / Approach

Follows the S-01/S-02 established pattern: migration → types → service → API → page. The Process Score calculation is a pure function in its own service file (`process-score.ts`), separated from the review CRUD service (`review.ts`) — mirroring the `readiness-score.ts` / `checkin.ts` separation. The API endpoint orchestrates: validates form → fetches check-in/plan/trades via `Promise.all` → computes score → upserts review → completes session → returns result with breakdown.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database Schema + Domain Types | `session_reviews` table, TypeScript types | Low — follows established migration pattern |
| 2. Service Layer + API Route | Review CRUD, Process Score calculator, `/api/review` | Medium — cross-table data gathering and score formula edge cases |
| 3. Review Page + Score Display + Dashboard | Full UI with form, breakdown display, 4th dashboard card | Medium — most UI-intensive phase; breakdown component is new pattern |

**Prerequisites:** S-01 and S-02 fully implemented, local Supabase running
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- PostgREST numeric-to-string coercion (known from S-02) — mitigated by using `smallint` for `process_score`
- UTC date computation (known from S-01 review) — sessions use UTC dates, which could assign wrong date near midnight. Deferred as product-level decision.
- Stale process_score after trade edits — accepted for MVP; trader can re-submit review to recalculate.

## Success Criteria (Summary)

- Trader completes the full discipline loop (check-in → plan → trades → review) and sees a Process Score with component breakdown
- Score formula is deterministic and matches the PRD specification (6 components, 100 max)
- Dashboard shows all 4 discipline loop steps with their status
