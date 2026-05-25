---
project: "Trading Discipline System"
version: 1
status: draft
created: 2026-05-24
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Day traders cannot judge their own readiness, decision quality, or rule adherence — they default to P&L as the only signal, which is a judgment gap, not a tool gap. Traders repeat the same mistakes without seeing patterns, don't know how much money rule-breaking costs them, and conflate a lucky profitable day with a well-executed one. The cost is invisible: no structured ritual exists before or after each session to check readiness, plan, or review discipline.

Existing trading journal and analytics tools optimize for the wrong metric (P&L analytics) and are too complex for a daily 5-minute ritual. The gap is a lightweight process/discipline layer that scores decision quality and rule adherence, not account balance. The insight: traders need to shift from "did I make money today?" to "did I follow my process today?" — and they need a tool simple enough that they'll actually use it every session.

## User & Persona

### Primary persona

A solo retail day trader who trades daily sessions. Building this tool for himself first — the MVP is a single-user validation. Trades actively (daily or near-daily), wants a structured pre-session check-in and post-session review ritual, and currently has no lightweight system to track process quality, psychological readiness, or rule adherence across sessions.

## Success Criteria

### Primary

- A trader can complete the full discipline loop in a single session: check-in → simplified session plan → add trade(s) → post-session review → see Process Score.

### Secondary

- Trader returns to the app 3+ times in a week — repeat usage proves the daily ritual sticks.

### Guardrails

- Session data must never be lost. If a trader fills in a full session, it persists reliably.
- The full loop (check-in through Process Score) must be completable in under 10 minutes.

## User Stories

### US-01: Trader completes a full discipline session

- **Given** a logged-in trader with no session recorded for today
- **When** they complete the check-in, create a session plan, add at least one trade, and submit the post-session review
- **Then** they see a Process Score (0–100) and today's session is marked as complete on the Today view

#### Acceptance Criteria

- Check-in must produce a visible Readiness Score before the trader proceeds
- At least one trade must be logged before the review can be submitted
- Process Score is calculated deterministically from session completeness and plan compliance
- All session data persists after the score is shown

## Functional Requirements

### Authentication

- FR-001: Trader can register a new account. Priority: must-have
  > Socrates: Counter-argument considered: "registration adds friction to a single-user MVP — a hardcoded login or OAuth-only would be simpler." Resolution: kept; user wants full registration with email + password even for MVP.

- FR-002: Trader can log in to an existing account. Priority: must-have
  > Socrates: Counter-argument considered: "could be merged with FR-001 into a single 'authenticate' FR." Resolution: kept as separate FR; registration and login are distinct flows.

### Today View

- FR-003: Trader can see current session status (check-in done, plan done, trade count, review done, scores). Priority: must-have
  > Socrates: Counter-argument considered: "a status dashboard adds UI complexity — inline navigation through steps could suffice." Resolution: kept; Today view is the navigation backbone that makes the ritual feel like a cohesive flow.

### Pre-Market Check-In

- FR-004: Trader can complete a pre-market check-in (sleep, energy, stress, focus ratings 1–5; dominant emotion; market bias; risk mode). Priority: must-have
  > Socrates: Counter-argument considered: "7 inputs creates friction for a daily ritual — maybe 4 fields (sleep, energy, stress, focus) are enough." Resolution: kept all 7; each field captures a distinct dimension of psychological readiness.

- FR-005: Trader can see a calculated Readiness Score (0–100) after completing check-in. Priority: must-have
  > Socrates: Counter-argument considered: "trader could self-assess readiness without a calculated score." Resolution: kept; the score is the heart of check-in — it gives an unambiguous signal.

### Session Plan

- FR-006: Trader can create a simplified session plan (goal, max trades, max daily loss in R). Priority: must-have
  > Socrates: Counter-argument considered: "3 fields might be too many or too few — could be just 1 field (goal only)." Resolution: kept at 3; fewer than 3 is no longer a plan.

### Trade Logging

- FR-007: Trader can manually add a trade to the current session (instrument, setup name, result in R, plan compliance, main mistake). Priority: must-have
  > Socrates: Counter-argument considered: "8 fields was too many." Resolution: revised — scoped down from 8 to 5 fields. Dropped: planned grade, emotion, note (moved to v2).

### Post-Session Review

- FR-008: Trader can complete a post-session review (plan adherence, what went wrong, rule broken, goal for next session). Priority: must-have
  > Socrates: Counter-argument considered: "8 review fields was too many for daily use." Resolution: revised — scoped down from 8 to 4 fields. Dropped: what went well, main mistake, emotional trigger, what to change (moved to v2).

### Process Score

- FR-009: Trader can see a calculated Process Score (0–100) after completing the session, computed deterministically from session data. Priority: must-have
  > Socrates: Counter-argument considered: "trader could self-rate process quality instead of an auto-calculated score." Resolution: kept automatic; deterministic scoring removes self-bias and makes scores comparable across sessions.

### Session History

- FR-010: Trader can view a list of past sessions with date, Readiness Score, and Process Score, and click into any session for details. Priority: must-have
  > Socrates: Counter-argument considered: "history could be cut to v2 — today's session is enough for MVP." Resolution: kept as simple list view; reviewing past sessions is key to spotting patterns. No filtering or search needed for MVP.

## Non-Functional Requirements

- Each form submission produces visible acknowledgement within 1 second under normal conditions.
- Session data is visible only to the authenticated account owner. No session data is accessible to other users or unauthenticated visitors.
- The product is usable on the latest two major versions of Chrome and Firefox on desktop.

## Business Logic

The app scores each trading session on process quality (0–100) by measuring ritual completeness and plan adherence, independent of financial outcome.

**Readiness Score (pre-session, 0–100):** Consumes four self-reported ratings — sleep, energy, focus (each 1–5), and stress (1–5, inverted so lower stress = higher readiness). The output is the average of sleep, energy, focus, and (6 − stress), scaled to 0–100. The trader sees this number immediately after completing check-in as an unambiguous readiness signal. Interpretation bands: 80–100 good, 60–79 cautious, 40–59 reduced risk, 0–39 no-trade recommended.

**Process Score (post-session, 0–100):** Consumes session completeness indicators and plan adherence data. Deterministic point allocation: +15 for check-in completed, +15 for session plan recorded, +20 for max daily loss not exceeded, +20 for majority of trades aligned with plan, +20 for no critical rule broken, +10 for post-session review completed. The trader sees this after submitting the review. Color bands: 80–100 green (good process day), 60–79 yellow, 40–59 orange, 0–39 red.

## Access Control

Login via email + password or OAuth. Flat single-user model — one login, one trader, one view. No role separation for MVP. All features are accessible to the authenticated user.

## Non-Goals

- **No broker integration or trade import.** All trades are manual entry only. No auto-import from trading platforms. Manual entry forces the trader to reflect on each trade.
- **No AI coaching or automated analysis.** No LLM summaries, AI suggestions, or automated pattern detection. The app is a structured discipline form, not an advisor.
- **No mobile app or responsive mobile UI.** Desktop web only. No PWA, no native mobile, no mobile-optimized layout. The trading ritual happens at the desk.
- **No multi-user features.** No shared workspaces, leaderboards, community features, coach/mentee views, or social feed. Single-user MVP only.

## Open Questions

1. **Should the discipline loop enforce step ordering?** — Can a trader skip check-in and go straight to adding trades, or must steps be completed in sequence (check-in → plan → trades → review)? Owner: user.
don't enforce, user can do whatever he want but make suggestions in which order should he do the steps. Make these steps clear in the interface.
2. **Can completed session steps be edited after submission?** — Once a check-in, plan, or review is submitted, can the trader modify it, or is it immutable for that session? Owner: user.
Yes
3. **What happens to incomplete sessions from previous days?** — If a trader starts a check-in on Monday but never submits the review, what state does Monday's session have when the trader opens the app on Tuesday? Owner: user.
Set as incompleted 