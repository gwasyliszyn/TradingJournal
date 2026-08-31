# Trading Discipline System

A daily discipline journal for day traders. Instead of asking _"did I make money today?"_, it
answers _"did I follow my process today?"_ — scoring psychological readiness before the session
and decision quality after it.

Traders default to P&L as their only feedback signal, which hides the difference between a lucky
profitable day and a well-executed one. This app adds the missing process layer: a structured
5-minute ritual that produces two deterministic scores and a session history you can review for
patterns.

See [`context/foundation/prd.md`](context/foundation/prd.md) for the full problem statement, personas,
user stories, and requirements.

## The daily loop

The whole product is one linear flow, one session per user per day:

| Step                    | Route                    | What happens                                                                                               |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1. Pre-market check-in  | `/checkin`               | Rate sleep, energy, stress, focus (1–5) plus emotion, market bias, risk mode → **Readiness Score (0–100)** |
| 2. Session plan         | `/plan`                  | Set the session goal, max trades, and max daily loss in R                                                  |
| 3. Trade log            | `/trades`                | Add / edit / delete trades: instrument, setup, result in R, plan compliance, main mistake                  |
| 4. Post-session review  | `/review`                | Plan adherence, what went wrong, rule broken, goal for next session → **Process Score (0–100)**            |
| 5. Today view & history | `/dashboard`, `/history` | Completion state for today; past sessions with both scores                                                 |

### The two scores

Both are pure, deterministic functions — no ML, no external calls — and they are the core value of
the product.

**Readiness Score** — [`src/lib/services/readiness-score.ts`](src/lib/services/readiness-score.ts)
Averages the four 1–5 ratings with the stress rating inverted (`6 - stress`), normalised to 0–100.
Bands: Good (≥80) · Cautious (≥60) · Reduced risk (≥40) · No-trade recommended (<40).

**Process Score** — [`src/lib/services/process-score.ts`](src/lib/services/process-score.ts)
Weighted sum of six components, each earned or not:

| Component                                | Points |
| ---------------------------------------- | ------ |
| Check-in completed                       | 15     |
| Session plan recorded                    | 15     |
| Daily loss within the planned limit      | 20     |
| Majority of trades plan-compliant (>50%) | 20     |
| No critical rule broken                  | 20     |
| Post-session review completed            | 10     |

Bands: Great process (≥80) · Needs improvement (≥60) · Poor process (≥40) · Critical (<40).

## Tech Stack

- [Astro](https://astro.build/) v6 — SSR (`output: "server"`), pages render server-side
- [React](https://react.dev/) v19 — interactive islands (forms, trade list, score displays)
- [TypeScript](https://www.typescriptlang.org/) v5 — shared types in `src/types.ts`
- [Tailwind CSS](https://tailwindcss.com/) v4 + [shadcn/ui](https://ui.shadcn.com/) (new-york style)
- [Supabase](https://supabase.com/) — Postgres + Auth, with Row Level Security on every table
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment via `@astrojs/cloudflare`
- [Vitest](https://vitest.dev/) (integration) + [Playwright](https://playwright.dev/) (e2e)

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) and ~7 GB RAM — only if you run Supabase locally

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

3. Create a `.dev.vars` file for local Cloudflare dev secrets:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

4. Apply the database migrations (creates `sessions`, `check_ins`, `session_plans`, `trades`,
   `session_reviews` with their RLS policies):

   ```bash
   npx supabase db push          # against a linked cloud project
   # or, for the local stack:
   npx supabase db reset
   ```

5. Run the development server:

   ```bash
   npm run dev
   ```

Open `http://localhost:4321`, sign up at `/auth/signup`, then start the loop at `/checkin`.

## Available Scripts

- `npm run dev` — Start development server (Cloudflare workerd runtime)
- `npm run build` — Build for production
- `npm run preview` — Preview production build
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (includes Astro + Tailwind plugins)
- `npm test` — Vitest integration tests (needs `.env.test`, see [Testing](#testing))
- `npm run test:watch` — Vitest in watch mode
- `npm run test:e2e` / `npm run test:e2e:ui` — Playwright e2e tests
- `npm run deploy` — Build and deploy to Cloudflare Workers
- `npx astro sync` — Regenerate Astro types after changing `env.schema` in `astro.config.mjs`

## Project Structure

```md
.
├── src/
│ ├── pages/ # Astro pages: checkin, plan, trades, review, dashboard, history
│ │ └── api/ # API endpoints (see API routes below)
│ ├── components/ # UI: auth/, checkin/, plan/, trades/, review/, shared/, ui/
│ ├── lib/
│ │ ├── services/ # Business logic: scores, and per-table data access
│ │ └── supabase.ts # SSR Supabase client factory
│ ├── middleware.ts # Resolves the user from cookies, guards protected routes
│ └── types.ts # Shared domain types
├── supabase/migrations/ # Schema + RLS policies
├── tests/
│ ├── integration/ # Vitest — persistence and access control
│ └── e2e/ # Playwright — the loop through a real browser
├── context/ # Written foundation: PRD, roadmap, test plan, per-change plans
└── wrangler.jsonc # Cloudflare Workers config
```

## Data model

One session per user per date (`UNIQUE (user_id, session_date)`); every other table hangs off it.

| Table             | Cardinality        | Holds                                                                                    |
| ----------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `sessions`        | 1 per user per day | `session_date`, `status` (`active` / `complete` / `incomplete`)                          |
| `check_ins`       | 1 per session      | four 1–5 ratings, emotion, market bias, risk mode, `readiness_score`                     |
| `session_plans`   | 1 per session      | `goal`, `max_trades`, `max_daily_loss_r`                                                 |
| `trades`          | many per session   | `instrument`, `setup_name`, `result_r`, `plan_compliance`, `main_mistake`                |
| `session_reviews` | 1 per session      | `plan_adherence`, `what_went_wrong`, `rule_broken`, `goal_next_session`, `process_score` |

Every table has RLS enabled with `auth.uid() = user_id` policies for select / insert / update /
delete, so a user's rows are invisible to everyone else at the database level — independently of
application code.

## Authentication & access control

Access is scoped per user across three layers:

1. **Middleware** — `src/middleware.ts` creates the SSR Supabase client, resolves the user from
   cookies onto `context.locals.user`, and redirects unauthenticated requests for
   `PROTECTED_ROUTES` to `/auth/signin`. Add paths to that array to require authentication.
2. **API routes** — every handler checks `context.locals.user` and returns `401` without it.
3. **Database** — RLS policies filter by `auth.uid()`, and service functions additionally scope
   writes with `.eq("user_id", userId)`.

### Auth routes

| Route                 | Description                         |
| --------------------- | ----------------------------------- |
| `/auth/signin`        | Email/password sign-in form         |
| `/auth/signup`        | Email/password sign-up form         |
| `/auth/confirm-email` | Post-signup "check your inbox" page |

### API routes

| Route                                                       | Methods         | Purpose                                                            |
| ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `/api/auth/signin`, `/api/auth/signup`, `/api/auth/signout` | `POST`          | Session lifecycle (public)                                         |
| `/api/checkin`                                              | `POST`          | Upsert today's check-in, returns the Readiness Score               |
| `/api/plan`                                                 | `POST`          | Upsert today's session plan                                        |
| `/api/trades`                                               | `POST`          | Create a trade in today's session                                  |
| `/api/trades/[id]`                                          | `PUT`, `DELETE` | Update or delete a trade                                           |
| `/api/review`                                               | `POST`          | Upsert the review, compute the Process Score, complete the session |

## Supabase Configuration

Environment variables are declared via Astro's `astro:env` schema and are treated as
**server-only secrets** — they are never exposed to the client. Import them from `astro:env/server`.

### First-time setup (local, no cloud project needed)

1. Create your `.env` file:

   ```bash
   cp .env.example .env
   ```

2. Start the local stack (downloads Docker images on first run):

   ```bash
   npx supabase start
   ```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

   ```dotenv
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_KEY=<anon key from CLI output>
   ```

4. Apply the migrations:

   ```bash
   npx supabase db reset
   ```

5. To stop the stack when done:

   ```bash
   npx supabase stop
   ```

The local Studio UI is available at `http://localhost:54323`.

### Using a cloud Supabase project instead

Add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Then link the project and push the schema: `npx supabase link --project-ref <ref> && npx supabase db push`.

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during
local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

## Testing

The test strategy is risk-driven — [`context/foundation/test-plan.md`](context/foundation/test-plan.md)
carries a ranked risk map, and each test names the risk it protects against.

| Suite                        | Risk covered                                  | Files                                        |
| ---------------------------- | --------------------------------------------- | -------------------------------------------- |
| Integration — persistence    | #3 Session data loss on form submission       | `tests/integration/data-persistence.test.ts` |
| Integration — access control | #5 Unauthorized cross-user data access (IDOR) | `tests/integration/access-control.test.ts`   |
| E2E — check-in persistence   | #3, through a real browser                    | `tests/e2e/checkin-persistence.spec.ts`      |

Both suites run against a **real Supabase project** — never production. Create `.env.test`
(gitignored) from its example and fill in test-project credentials:

```bash
cp .env.test.example .env.test
```

It needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (used only to clean
up test rows), plus `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` for the e2e sign-in. The integration
suite creates its own `test-user-a@test.local` / `test-user-b@test.local` accounts on first run and
deletes their rows afterwards.

```bash
npm test           # Vitest — tests/**/*.test.ts
npm run test:e2e   # Playwright — starts the dev server itself
```

Playwright signs in once via `tests/e2e/auth.setup.ts` and reuses the stored session, so specs start
authenticated. E2E specs run serially (`workers: 1`) because they share one test user and clear
"today's" rows around each test.

When writing new e2e tests, follow the rules in [`CLAUDE.md`](CLAUDE.md): role/label-based locators,
never `page.waitForTimeout()`, each test independent with its own setup and cleanup.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

```bash
npm run deploy     # astro build && wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via
`npx wrangler secret put`. Deployment details and rollback notes live in
[`context/deployment/deploy-plan.md`](context/deployment/deploy-plan.md).

## CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint + build on every
push and PR to `main`, then deploys to Cloudflare on pushes to `main`. Configure `SUPABASE_URL`,
`SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.

A pre-commit hook (husky + lint-staged) runs `eslint --fix` on `*.{ts,tsx,astro}` and
`prettier --write` on `*.{json,css,md}`.

## Documentation

The app was built from its written foundation, not the other way round:

- [`context/foundation/prd.md`](context/foundation/prd.md) — problem, personas, user stories, requirements
- [`context/foundation/roadmap.md`](context/foundation/roadmap.md) — the vertical slices, in build order
- [`context/foundation/test-plan.md`](context/foundation/test-plan.md) — risk map and phased test rollout
- [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md) — stack decisions
- [`context/changes/`](context/changes/) — per-change plans and reviews
- [`AGENTS.md`](AGENTS.md) — conventions for AI coding agents working in this repo

## License

MIT
