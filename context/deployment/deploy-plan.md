# Deploy Trading Discipline System to Cloudflare Workers

## Context

The Astro 6 + React 19 SSR app is fully configured for Cloudflare Workers (`wrangler.jsonc`, `@astrojs/cloudflare` adapter, CI pipeline) but has never been deployed. Supabase auth is wired up for local dev only — production secrets, redirect URLs, and Site URL all need configuration. The CI deploy job exists in `.github/workflows/ci.yml` but requires four GitHub repository secrets. This plan covers the full path from local verification to automated CI/CD deployment.

**Key constraint:** Use `wrangler deploy` (Workers), never `wrangler pages deploy` (Pages). The project targets Workers via the `main` field in `wrangler.jsonc`.

---

## Phase 0: Supabase Setup

> Goal: Ensure the hosted Supabase project is ready and local development can connect to it.

### 0A. Hosted Supabase Project

- [ ] **0A.1 (manual/browser)** Create a Supabase account at [supabase.com/dashboard](https://supabase.com/dashboard) if you don't have one
- [ ] **0A.2 (manual/browser)** Create a new project:
  - Click **New Project**
  - Name: `trading-discipline-system` (or your preference)
  - Database password: generate a strong password and store it in your password manager
  - Region: pick the closest to your primary location (this cannot be changed later)
  - Plan: Free tier is sufficient for single-user MVP
- [ ] **0A.3 (manual/browser)** Wait for project provisioning (~2 minutes). Once ready, go to **Settings > API** and copy:
  - **Project URL** — e.g. `https://tershtaofsynqiuifeiy.supabase.co` (this is your `SUPABASE_URL`)
  - **anon public key** — the `anon` key under "Project API keys" (this is your `SUPABASE_KEY`)
  - **Do NOT use the `service_role` key** — it bypasses RLS. The app only needs the `anon` key.
- [ ] **0A.4 (manual/browser)** Verify the project is healthy:
  - Go to **Table Editor** — should show an empty `public` schema
  - Go to **Authentication > Users** — should be empty
  - Go to **SQL Editor** — run `SELECT NOW();` to confirm DB connectivity

> **Note:** The `.dev.vars.example` already references `tershtaofsynqiuifeiy.supabase.co`. If you already created this project, skip 0A.1–0A.2 and just verify you have the URL and anon key.

### 0B. Database Schema

The project currently has **no migrations** (`supabase/migrations/` is empty, `schema_paths = []` in config.toml). The auth tables are created automatically by Supabase's auth service — no manual schema setup is needed for authentication.

- [ ] **0B.1 (info)** Confirm the app only uses Supabase Auth at this stage — no custom tables needed for MVP sign-in/sign-up/sign-out flow
- [ ] **0B.2 (for later)** When domain tables are added (sessions, trades, check-ins), create migrations in `supabase/migrations/` with format `YYYYMMDDHHmmss_short_description.sql` and always enable RLS on new tables

### 0C. Local Supabase Development (Optional — for offline/local testing)

The `supabase/config.toml` configures a full local Supabase stack. This is optional — you can develop against the hosted project directly using `.dev.vars`.

- [ ] **0C.1 (auto)** Install Supabase CLI: `npm install -g supabase` (or use `npx supabase`)
- [ ] **0C.2 (auto)** Start local Supabase: `npx supabase start`
  - Requires Docker running
  - First run pulls images (~5 minutes)
  - Outputs local credentials (API URL, anon key, service role key, Studio URL)
  - Local services: API on `:54321`, DB on `:54322`, Studio on `:54323`, Inbucket (email) on `:54324`
- [ ] **0C.3 (manual)** If using local Supabase, update `.dev.vars` with the local credentials:
  ```
  SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_KEY=<local-anon-key-from-supabase-start-output>
  ```
- [ ] **0C.4 (auto)** Stop local Supabase when done: `npx supabase stop`

> **Recommendation for MVP:** Develop against the hosted project (simpler, no Docker needed). Use `.dev.vars` with the hosted credentials from step 0A.3. Local Supabase is valuable later when you have migrations to test.

### 0D. Wire `.dev.vars` for Development

- [ ] **0D.1 (manual)** Copy `.dev.vars.example` to `.dev.vars` in the project root
- [ ] **0D.2 (manual)** Verify the values point to your Supabase project:
  ```
  SUPABASE_URL=https://<your-project-ref>.supabase.co
  SUPABASE_KEY=<your-anon-key>
  ```
- [ ] **0D.3 (info)** `.dev.vars` is gitignored — safe for real credentials. Wrangler reads it automatically during `wrangler dev`. Astro's `astro dev` reads env vars from the process environment, so for `npm run dev` you'll need to set them via your shell or use a `.env` file.

### Troubleshooting: Supabase Project Issues
1. **"Invalid API key"** — you're using the wrong key. Go to Settings > API and copy the `anon` key, not the `service_role` key.
2. **"Project not found"** — check the URL includes the correct project ref (the subdomain before `.supabase.co`).
3. **Local Supabase won't start** — ensure Docker Desktop is running and has at least 4 GB RAM allocated. Run `docker ps` to check for port conflicts on 54321–54327.
4. **Auth tables missing** — they're in the `auth` schema, not `public`. You won't see them in Table Editor by default. Go to SQL Editor and run `SELECT * FROM auth.users;` to verify.

---

## Phase 1: Pre-Flight Checks (Local Build on workerd)

> Goal: Confirm the build produces a valid Workers artifact and `wrangler dev` serves it without runtime errors.

- [ ] **1.1** Confirm `.dev.vars` exists with valid Supabase credentials (see Phase 0D)
- [ ] **1.2 (auto)** `npm run build` — clean build, check exit code 0
- [ ] **1.3 (auto)** Measure server bundle: `du -sh dist/_worker.js/` — must be under 3 MB (expect ~1.9 MB)
- [ ] **1.4 (auto)** `npx wrangler dev` — start on workerd runtime (NOT Node.js like `astro dev`)
- [ ] **1.5 (manual)** Smoke-test all routes on `http://127.0.0.1:8787`:
  - `/` — landing page renders
  - `/auth/signin` — React form hydrates
  - `/auth/signup` — React form hydrates
  - `/dashboard` — redirects to `/auth/signin` (unauthenticated)
  - Sign in with valid creds, visit `/dashboard`, sign out
- [ ] **1.6 (manual)** Check `wrangler dev` terminal for workerd warnings or module errors

### Troubleshooting: Bundle > 3 MB
1. Check `dist/_worker.js/chunks/` for unexpectedly large files
2. Add `export const prerender = true` to static pages (landing, confirm-email)
3. Verify no barrel imports from shadcn/ui
4. Last resort: upgrade to $5/mo paid plan (10 MB limit)

### Troubleshooting: workerd Incompatibilities
1. Error will name the offending module (e.g., "Dynamic require of X is not supported")
2. Verify `nodejs_compat` flag is present in `wrangler.jsonc` (it is)
3. Pin Supabase SDK versions — remove `^` from `@supabase/ssr` (0.10.3) and `@supabase/supabase-js` (2.99.1)
4. Try `vite.ssr.external: ['problematic-package']` in `astro.config.mjs`
5. Check `@astrojs/cloudflare` GitHub issues for the specific package

### Troubleshooting: Auth/Cookies Fail on wrangler dev
1. `wrangler dev` serves HTTP, not HTTPS — `Secure` cookies are rejected by browsers over HTTP. Check DevTools > Application > Cookies.
2. Verify `SameSite` attribute — `SameSite=None` requires `Secure=true`. `Lax` works over HTTP.
3. Check domain: `wrangler dev` serves from `127.0.0.1` — if Supabase restricts redirect URLs, local auth may fail. Add `http://127.0.0.1:8787` to Supabase redirect URLs if needed.

---

## Phase 2: Cloudflare Account & Authentication

> Goal: Create account, generate a scoped API token, authenticate wrangler.

- [ ] **2.1 (manual/browser)** Create Cloudflare account at `dash.cloudflare.com/sign-up`, verify email
- [ ] **2.2 (manual/browser)** Copy Account ID from Workers & Pages overview (32-char hex string in right sidebar or URL)
- [ ] **2.3 (manual/browser)** Create scoped API token:
  - My Profile > API Tokens > Create Token
  - Use **"Edit Cloudflare Workers"** template
  - Scope to your account
  - Copy token immediately (shown only once)
  - Verify: `curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" -H "Authorization: Bearer TOKEN"` should return `"status": "active"`
- [ ] **2.4 (interactive)** `npx wrangler login` — opens browser for OAuth approval
- [ ] **2.5 (auto)** Verify: `npx wrangler whoami` — shows account name and ID

---

## Phase 3: First Deploy

> Goal: Deploy to Workers and confirm the app renders. Auth will NOT work yet (no secrets).

- [ ] **3.1 (auto)** `npm run deploy` (runs `astro build && wrangler deploy`)
  - First deploy creates the Worker project `trading-discipline-system`
  - Note the output URL: `https://trading-discipline-system.<subdomain>.workers.dev`
- [ ] **3.2 (manual/browser)** Open the Workers URL — landing page renders with CSS/images
- [ ] **3.3 (manual/browser)** Visit `/dashboard` — redirects to `/auth/signin` (middleware works, Supabase client returns null gracefully per `src/lib/supabase.ts:6-8` and `src/middleware.ts:14-16`)
- [ ] **3.4 (manual/browser)** Check Cloudflare dashboard: Workers & Pages > `trading-discipline-system` — deployment visible, observability enabled

---

## Phase 4: Worker Secrets

> Goal: Set Supabase credentials as encrypted Worker secrets.

- [ ] **4.1 (interactive)** `npx wrangler secret put SUPABASE_URL` — paste `https://tershtaofsynqiuifeiy.supabase.co`
- [ ] **4.2 (interactive)** `npx wrangler secret put SUPABASE_KEY` — paste the anon key from `.dev.vars.example`
- [ ] **4.3 (auto)** Verify: `npx wrangler secret list` — both names appear (values hidden)
- [ ] **4.4 (manual/browser)** Visit `/auth/signin` on Workers URL, attempt sign-in — expect auth redirect/config error (NOT a network/connection error). This confirms secrets reach the runtime.

**Important:** Secrets go in `wrangler secret`, never in `wrangler.jsonc` `[vars]` (that's committed to git).

---

## Phase 5: Supabase Production Configuration

> Goal: Update hosted Supabase auth settings for the production domain. The `supabase/config.toml` only governs local CLI — hosted settings are separate.

- [ ] **5.1 (manual/browser)** Supabase Dashboard > Authentication > URL Configuration:
  - **Site URL**: change to `https://trading-discipline-system.<subdomain>.workers.dev`
  - (This is the default redirect target for email confirmation, password reset, OAuth)
- [ ] **5.2 (manual/browser)** Same page > Redirect URLs > Add:
  ```
  https://trading-discipline-system.<subdomain>.workers.dev/**
  ```
  - Keep existing `http://127.0.0.1:3000` entries for local dev
- [ ] **5.3 (manual/browser - decision)** Email confirmation behavior:
  - **For single-user MVP (recommended):** Disable — Authentication > Providers > Email > turn OFF "Confirm email"
  - **If you want confirmation:** Keep enabled, but verify the Site URL (5.1) is correct first — confirmation links use it
- [ ] **5.4 (manual/browser)** Check email templates (Authentication > Email Templates) — ensure no hardcoded `127.0.0.1` URLs. The `{{ .ConfirmationURL }}` variable auto-uses Site URL.
- [ ] **5.5 (manual/browser)** Verify JWT expiry matches expectations (local config uses 3600s / 1 hour)

### Troubleshooting: Auth Redirects Don't Work
1. Site URL must exactly match Workers URL including `https://` — no trailing slash mismatch
2. Redirect URL wildcard must be `https://your-domain/**`
3. Check Supabase Dashboard > Authentication > Logs for redirect errors
4. Run `npx wrangler tail` while reproducing — look for 400/403 from Supabase

---

## Phase 6: End-to-End Auth Verification

> Goal: Full auth lifecycle on the live Workers URL.

- [ ] **6.1 (manual/incognito)** Sign up at `/auth/signup` with test email + password
  - If confirmation disabled: should be able to sign in immediately
  - If confirmation enabled: check email, click link (should go to Workers URL, not localhost)
- [ ] **6.2 (manual)** Sign in at `/auth/signin` — redirects to `/`
- [ ] **6.3 (manual)** Visit `/dashboard` — page renders with user info (protected route accessible)
- [ ] **6.4 (manual)** Sign out — redirects to `/`
- [ ] **6.5 (manual)** Visit `/dashboard` again — redirects to `/auth/signin`
- [ ] **6.6 (manual)** Check cookies in DevTools > Application > Cookies:
  - Look for `sb-<project-ref>-auth-token`
  - Verify: `Secure=true`, `SameSite=Lax`, `HttpOnly=true`, `Path=/`

### Troubleshooting: Cookies Don't Persist on Workers
1. Workers URL is HTTPS, so `Secure` cookies work. If they don't appear, check Supabase SSR cookie config in `src/lib/supabase.ts`.
2. If `SameSite=None` is set, it requires `Secure=true` — `Lax` is correct for same-site navigation.
3. Verify the Supabase client is created fresh per request (it is — `middleware.ts:7` creates it each time).

---

## Phase 7: GitHub Actions CI/CD

> Goal: Configure repository secrets so CI auto-deploys on merge to `main`.

- [ ] **7.1 (manual/browser)** Add GitHub repository secrets at `github.com/<owner>/TradingJournal/settings/secrets/actions`:
  - `CLOUDFLARE_API_TOKEN` — from Phase 2.3
  - `CLOUDFLARE_ACCOUNT_ID` — from Phase 2.2
  - `SUPABASE_URL` — `https://tershtaofsynqiuifeiy.supabase.co`
  - `SUPABASE_KEY` — anon key from `.dev.vars.example`
- [ ] **7.2 (auto)** Add `npx astro sync` to the deploy job (it's in `ci` job but missing from `deploy`)
  - Edit `.github/workflows/ci.yml` — add `- run: npx astro sync` before the build step in the `deploy` job
- [ ] **7.3 (auto)** Trigger test: `git push origin main` (or merge a PR)
- [ ] **7.4 (manual/browser)** Monitor at `github.com/<owner>/TradingJournal/actions`:
  - `ci` job: lint + build passes
  - `deploy` job: build + `wrangler deploy` passes
- [ ] **7.5 (manual/browser)** Verify the deployed app works (same checks as Phase 6)

### Troubleshooting: CI Deploy Fails
| Error | Fix |
|---|---|
| "Authentication error" from wrangler | Re-create API token with "Edit Cloudflare Workers" template; check secret name is exact |
| "Could not find account" | Double-check `CLOUDFLARE_ACCOUNT_ID`; token must be scoped to same account |
| Build fails but works locally | Ensure `SUPABASE_URL` + `SUPABASE_KEY` GitHub secrets are set; the build step references them |
| "Script too large" | Bundle > 3 MB — see Phase 1 troubleshooting |

---

## Phase 8: Post-Deploy Hardening & Documentation

> Goal: Verify observability, test rollback capability, write deploy-plan.md artifact.

- [ ] **8.1 (auto)** `npx wrangler tail` — stream live logs, make a few requests, confirm logs appear
- [ ] **8.2 (auto)** `npx wrangler versions list` — confirm multiple versions exist; note version IDs
  - Rollback command (for emergencies): `npx wrangler rollback <VERSION_ID> --yes`
  - **Caveat:** DB migrations don't roll back — code rollback + DB forward migration may cause schema mismatch
- [ ] **8.3 (manual/browser)** Check Cloudflare dashboard observability: request count, CPU time, error rate graphs
- [ ] **8.4 (manual/browser)** Verify free-tier headroom: requests/day, CPU/invocation, script size
- [ ] **8.5 (auto)** Update this file with:
  - Worker project name, URL, Supabase project ref
  - Secret names (Workers + GitHub Actions)
  - CLI commands: deploy, rollback, logs, secret management
  - CI/CD: auto-deploy on merge to main
  - Known limits and risk mitigations

---

## Critical Files Modified

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Add `npx astro sync` to deploy job (Phase 7.2) |
| `context/deployment/deploy-plan.md` | New — deployment documentation artifact (this file) |

All other changes are external (Cloudflare dashboard, Supabase dashboard, GitHub secrets) — no code modifications needed beyond the two above.

---

## Verification Summary

| Phase | What's verified |
|---|---|
| 1 | Build succeeds, bundle < 3 MB, `wrangler dev` serves routes, auth works on workerd |
| 2 | Cloudflare account exists, API token active, wrangler authenticated |
| 3 | App deployed and rendering at Workers URL, middleware runs correctly |
| 4 | Secrets set, Worker reaches Supabase |
| 5 | Supabase auth settings point to production domain |
| 6 | Full sign-up > sign-in > protected route > sign-out cycle on live URL |
| 7 | CI pipeline builds and deploys automatically on merge |
| 8 | Logs stream, rollback available, deployment documented |
