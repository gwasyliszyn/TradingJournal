# Today View — Plan Brief

> Full plan: `context/changes/s-04/plan.md`

## What & Why

Replace the basic card-list dashboard with a Today View that presents the trading discipline loop (Check-in → Plan → Trades → Review) as a cohesive visual flow. FR-003 calls the Today View the "navigation backbone" — it should make the ritual feel like a connected sequence, not four independent cards.

## Starting Point

`src/pages/dashboard.astro` already loads all session data (check-in, plan, trades, review) in parallel and renders four independent status cards with action links. The data fetching is correct — only the template needs redesigning.

## Desired End State

The `/dashboard` route shows a horizontal stepper bar with completed/current/pending step states. Below it, a focused content area either highlights the suggested next step (CTA) or, when all steps are done, shows Readiness Score and Process Score prominently with color bands. All steps remain clickable regardless of completion — ordering is suggestive, not enforced.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Route | Replace dashboard in place | One page to maintain, no routing confusion |
| Loop UX | Horizontal stepper/progress bar | Clearest visual flow that suggests ordering without enforcing it |
| Done state | Summary with both scores | Gives sense of accomplishment; edit links on each step |
| Trade detail level | Count only | Keeps Today View clean per one-action-per-screen principle |
| Rendering | Server-rendered Astro | No client JS needed — page is read-only status with plain links |

## Scope

**In scope:**
- Stepper Astro component (`src/components/Stepper.astro`)
- Dashboard page template rewrite with stepper, next-step CTA, score summary, and step list
- Title change from "Dashboard" to "Today"

**Out of scope:**
- Database, API, or service changes
- React components or client-side JS
- Enforced step ordering
- Session history link (S-05)
- Animated transitions

## Architecture / Approach

Pure presentation layer change. The existing frontmatter data loading pattern (session query → parallel entity fetches) is preserved. A new `Stepper.astro` component receives step definitions and renders the horizontal progress bar. The dashboard template is restructured into three sections: stepper, main content (CTA or score summary), and compact step list.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Stepper Component + Page Redesign | Complete Today View replacing dashboard | Stepper CSS may need iteration for visual polish |

**Prerequisites:** S-01, S-02, S-03 implemented (all discipline loop pages and services exist)
**Estimated effort:** ~1 session, single phase

## Open Risks & Assumptions

- Assumes all four step pages (`/checkin`, `/plan`, `/trades`, `/review`) handle both create and edit flows correctly (established by S-01–S-03)
- Stepper visual design may need polish iteration — the plan describes behavior, not pixel-perfect styling

## Success Criteria (Summary)

- Dashboard shows stepper with correct completion state for each discipline loop step
- Suggested next step is visually prominent; all steps remain clickable
- Both scores display with correct color bands when session is complete
