---
project: "Trading Discipline System"
version: 1
status: draft
created: 2026-05-29
updated: 2026-05-29
prd_version: 1
main_goal: low-complexity
top_blocker: capacity
---

# Roadmap: Trading Discipline System

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Day traders default to P&L as the only signal, repeating mistakes without seeing patterns. The Trading Discipline System is a lightweight process/discipline layer that scores decision quality and rule adherence — shifting the question from "did I make money today?" to "did I follow my process today?" Built as a single-user MVP validation: a daily ritual of check-in, plan, trade logging, review, and a deterministic Process Score.

## North star

**S-03: Review + Process Score** — the first moment the trader sees a deterministic answer to "did I follow my process?" instead of "did I make money?" Placed after S-01 and S-02 because the Process Score formula consumes data from check-in, plan, and trades.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the core product hypothesis — the idea that scoring process quality (not P&L) changes trader behavior. Everything else only matters if this works.

## At a glance

| ID   | Change ID                | Outcome (user can …)                                          | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------------ | ------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| S-01 | pre-market-checkin       | complete check-in and see Readiness Score (0–100)             | —             | FR-001, FR-002, FR-004, FR-005, US-01 | ready    |
| S-02 | plan-and-trade-logging   | create a session plan and add trades                          | S-01          | FR-006, FR-007, US-01                 | proposed |
| S-03 | review-and-process-score | complete review and see Process Score (0–100)                 | S-02          | FR-008, FR-009, US-01                 | proposed |
| S-04 | today-view               | see current session status and navigate discipline loop steps | S-03          | FR-003, US-01                         | proposed |
| S-05 | session-history          | view past sessions with scores and click into details         | S-03          | FR-010                                | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                     | Note                                                                          |
| ------ | ------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| A      | Discipline loop     | `S-01` → `S-02` → `S-03` | Core path to north star; minimal sequential chain to prove the product works. |
| B      | Dashboard + history | `S-04` / `S-05`           | Branch from S-03; both can run in parallel once the loop is complete.          |

## Baseline

What's already in place in the codebase as of 2026-05-29 (auto-researched + user-confirmed).
No foundations below re-scaffold these layers.

- **Frontend:** present — Astro 6 + React 19, Tailwind CSS 4, file-based routing, pages (index, dashboard, auth signin/signup/confirm-email)
- **Backend / API:** partial — Astro SSR with API routes for auth only (`src/pages/api/auth/`); no domain logic controllers or services
- **Data:** partial — Supabase client installed (`@supabase/supabase-js`, `@supabase/ssr`); no schema files, no migrations, no seed data
- **Auth:** present — Supabase auth with cookie-based sessions (`src/lib/supabase.ts`), route-level middleware (`src/middleware.ts`), signup/signin/signout endpoints
- **Deploy / infra:** partial — Cloudflare Workers configured (`wrangler.jsonc`), GitHub Actions CI/CD (`.github/workflows/ci.yml`), not yet deployed to production
- **Observability:** absent — no logging library, no error tracking, no metrics

## Foundations

None. With a low-complexity goal and auth/frontend/infra already present, all cross-cutting work (data schema, RLS policies) is introduced progressively in the first vertical slice that needs it. No separate foundation is justified.

## Slices

### S-01: Pre-market check-in + Readiness Score

- **Outcome:** trader can complete a pre-market check-in (sleep, energy, stress, focus ratings 1–5; dominant emotion; market bias; risk mode) and see a calculated Readiness Score (0–100)
- **Change ID:** pre-market-checkin
- **PRD refs:** FR-001, FR-002, FR-004, FR-005, US-01
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First slice establishes the data schema pattern (sessions + check-ins tables with RLS) that all downstream slices follow. Wrong schema shape here costs migration effort downstream.
- **Status:** ready

### S-02: Session plan + trade logging

- **Outcome:** trader can create a session plan (goal, max trades, max daily loss in R) and add trades to the current session (instrument, setup name, result in R, plan compliance, main mistake)
- **Change ID:** plan-and-trade-logging
- **PRD refs:** FR-006, FR-007, US-01
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Two forms in one slice — if scope creeps, split plan and trades into separate slices. Sequenced after S-01 because trades belong to a session with an existing check-in record.
- **Status:** proposed

### S-03: Post-session review + Process Score

- **Outcome:** trader can complete a post-session review (plan adherence, what went wrong, rule broken, goal for next session) and see a calculated Process Score (0–100)
- **Change ID:** review-and-process-score
- **PRD refs:** FR-008, FR-009, US-01
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Process Score formula consumes data from all prior steps (check-in completed, plan recorded, trades logged, daily loss, plan compliance, rule broken). If earlier tables lack the needed columns, this slice hits integration friction. This is the north star — deferring it defeats the product hypothesis.
- **Status:** proposed

### S-04: Today View

- **Outcome:** trader can see current session status (check-in done, plan done, trade count, review done, scores) and navigate to each discipline loop step
- **Change ID:** today-view
- **PRD refs:** FR-003, US-01
- **Prerequisites:** S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on all loop data existing. Built after S-03 to avoid incremental partial-status logic — simpler implementation consistent with low-complexity goal.
- **Status:** proposed

### S-05: Session history

- **Outcome:** trader can view a list of past sessions with date, Readiness Score, and Process Score, and click into any session for full details
- **Change ID:** session-history
- **PRD refs:** FR-010
- **Prerequisites:** S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Simple list view with detail drill-down — low inherent risk. Depends on S-03 so both scores are available to display.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                    | Ready for `/10x-plan` | Notes                                |
| ---------- | ------------------------ | ---------------------------------------- | --------------------- | ------------------------------------ |
| S-01       | pre-market-checkin       | Pre-market check-in with Readiness Score | yes                   | Run `/10x-plan pre-market-checkin`   |
| S-02       | plan-and-trade-logging   | Session plan and trade logging           | no                    | Depends on S-01                      |
| S-03       | review-and-process-score | Post-session review with Process Score   | no                    | Depends on S-02; north star          |
| S-04       | today-view               | Today View — session status dashboard    | no                    | Depends on S-03                      |
| S-05       | session-history          | Session history list with detail view    | no                    | Depends on S-03; parallel with S-04  |

## Open Roadmap Questions

None. All three PRD Open Questions have inline answers:

1. Step ordering → non-enforced; suggestive UI (affects S-04 implementation).
2. Editing after submission → yes, all forms allow re-editing (affects S-01–S-03 implementation).
3. Incomplete previous-day sessions → marked as incomplete (affects session lifecycle logic in S-01).

These are resolved design decisions, not open questions. They will surface as implementation details in `/10x-plan`.

## Parked

- **Broker integration / trade import** — Why parked: PRD §Non-Goals. Manual entry forces reflection.
- **AI coaching / automated analysis** — Why parked: PRD §Non-Goals. App is a discipline form, not an advisor.
- **Mobile app / responsive mobile UI** — Why parked: PRD §Non-Goals. Trading ritual happens at the desk.
- **Multi-user features** — Why parked: PRD §Non-Goals. Single-user MVP.
- **Playbook (predefined setups)** — Why parked: PRD §Cut to v2. Free-text setup name on trades instead.
- **Calendar view (monthly color-coded)** — Why parked: PRD §Cut to v2.
- **Insights (7-day avg, common mistake, Rule Break Cost)** — Why parked: PRD §Cut to v2.
- **Observability (logging, error tracking, metrics)** — Why parked: no PRD NFR requires it; low-complexity goal deprioritizes infrastructure not gating launch.

## Done

(Empty on first generation. `/10x-archive` appends entries here when a change is archived.)
