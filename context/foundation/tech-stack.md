---
starter_id: 10x-astro-starter
package_manager: npm
project_name: trading-discipline-system
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo builder shipping a trading discipline web app in 3 weeks after-hours, with email+password auth as the only technology-forcing feature. The 10x Astro Starter (Astro 6 + React 19 + TypeScript + Supabase + Cloudflare Pages) is the recommended default for (web-app, js) and clears all four agent-friendly gates: typed (TypeScript end-to-end with Zod schemas at boundaries), convention-based (file-based routing, island architecture), popular in JS training data, and well-documented. Supabase covers auth and PostgreSQL out of the box, eliminating the need to wire up a separate auth provider or database. Cloudflare Pages deploys at the edge with a generous free tier, matching the small-scale, solo profile. CI runs on GitHub Actions with auto-deploy-on-merge.
