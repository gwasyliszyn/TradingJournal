---
project: Trading Discipline System
researched_at: 2026-05-27
recommended_platform: Cloudflare Workers + Pages
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: workerd (Cloudflare Workers)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

The tech stack was built for Cloudflare — `@astrojs/cloudflare` adapter, `deployment_target: cloudflare-pages`, workerd runtime. Cloudflare scored Pass on all five agent-friendly criteria: full CLI coverage via `wrangler`, zero-cold-start serverless isolates, best-in-class `llms.txt` and markdown docs, deterministic deploy/rollback API, and 13+ GA MCP servers. The free tier (100k requests/day) covers this single-user MVP with headroom to spare. External providers (Supabase for DB) are the intended data model, and Cloudflare's edge-first architecture matches the stateless request/response pattern confirmed in the developer interview.

## Platform Comparison

| Criterion | Weight | Cloudflare Workers + Pages | Fly.io |
|---|---|---|---|
| CLI-first maintenance | Critical | **Pass** — `wrangler deploy/rollback/tail/versions`, structured output, no interactive prompts | **Partial** — `flyctl` solid for deploy/logs, but rollback is a workaround (redeploy old image); images may be pruned |
| Managed / serverless | Critical | **Pass** — V8 isolates, zero cold starts, no OS/network config, TLS/routing/scaling automatic | **Partial** — Firecracker micro-VMs are managed but require Dockerfile authoring and maintenance; more operational surface |
| Agent-readable docs | Medium | **Pass** — publishes `llms.txt` per product, `Accept: text/markdown` content negotiation, GitHub source at `cloudflare/cloudflare-docs` | **Partial** — docs source is markdown on GitHub (`superfly/*`) but no `llms.txt`, no content negotiation on docs site |
| Stable deploy API | Critical | **Pass** — `wrangler deploy` returns URL, `wrangler rollback [VERSION_ID]` with `--yes` flag, deterministic exit codes | **Partial** — `fly deploy` is deterministic, but rollback requires knowing old image tag; old images may be pruned from Fly registry |
| MCP / first-class integration | Light (tie-break) | **Pass** — 13+ managed remote MCP servers (docs, Workers bindings, DNS, R2, etc.), Claude Code plugin, all GA | **Partial** — `fly mcp server` exists but is experimental; `--claude` flag for auto-config |

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Native fit for the Astro 6 stack — the `@astrojs/cloudflare` adapter targets workerd directly, eliminating the need for Docker or a Node.js server process. The free tier (100k requests/day, 10ms CPU/invocation) is more than sufficient for a single-user MVP. Zero cold starts via V8 isolate pre-warming. `wrangler` provides the complete operational loop: deploy, rollback, tail logs, list versions — all scriptable with structured output. Cloudflare's `llms.txt` and markdown content negotiation make it the most agent-readable platform available. 13+ GA MCP servers provide structured tool access for advanced agent workflows. Co-located services (Hyperdrive for Supabase connection pooling, R2, KV) are available if needed but not required for MVP.

#### 2. Fly.io

A capable container-based PaaS with full Node.js compatibility and native WebSocket/persistent process support — its key differentiator. However, deploying this stack on Fly.io means switching from `@astrojs/cloudflare` to `@astrojs/node`, writing and maintaining a Dockerfile, and accepting cold starts on scale-to-zero (1-3s for Node.js app startup). No free tier (discontinued October 2024; MVP would cost ~$3-7/mo). Docs are on GitHub as markdown but lack `llms.txt`. MCP support is experimental. Rollback requires manually tracking and redeploying old container images. For a stack already built for Cloudflare, Fly.io adds friction without proportional benefit at MVP scale.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **workerd is not Node.js.** Despite `nodejs_compat`, CommonJS dependencies silently break builds. Any npm package using `require()` fails — many popular packages still ship CJS-only or mixed builds. Debugging "module not found" errors in workerd is harder than in Node.
2. **3 MB script size limit on free tier.** An Astro 6 SSR bundle with React 19, shadcn/ui, and Supabase client can approach this limit. One page with heavy dependencies could push past it, requiring upgrade to the $5/mo paid plan (10 MB limit).
3. **50 subrequest limit on free tier.** If an SSR page makes multiple parallel Supabase queries (e.g., dashboard loading sessions + trades + check-ins), the 50-fetch cap per invocation applies. Paid plan raises this to 10,000.
4. **10ms CPU time on free tier.** Complex SSR rendering (React 19 server components, data fetching, score calculations) may exceed 10ms of actual CPU. Network wait is free, but CPU is tightly metered.
5. **Pages vs Workers positioning shift.** Cloudflare now recommends Workers over Pages for SSR projects. The `@astrojs/cloudflare` adapter straddles both — potential for confusing deploy targets (`wrangler pages deploy` vs `wrangler deploy`) and documentation drift.

### Pre-Mortem — How This Could Fail

Six months after deploying the Trading Discipline System on Cloudflare Workers, the project hit a wall. The free tier's 10ms CPU limit caused intermittent 1015 errors on the session history page, which server-renders a list of past sessions with computed scores — the React SSR pass took 12-15ms of CPU on larger datasets. The team upgraded to the $5/mo paid plan, solving that. But then a Supabase SDK update shipped a dependency that used `require()` internally, breaking the production build with a cryptic "Dynamic require of X is not supported" error. Debugging took two days because the error only surfaced in the workerd runtime, not in local Node.js development. The `wrangler dev` local environment caught it, but the developer had been using `npm run dev` (Astro's Vite dev server) which runs on Node.js and masks workerd incompatibilities. Meanwhile, the ASSETS binding name conflict forced a migration from Pages deployment to Workers deployment, requiring `wrangler.toml` restructuring and new deploy scripts. The assumption that "Cloudflare Pages = simple static-like deploy" proved wrong for a full SSR app — Workers was the right target all along, but the migration cost a weekend.

### Unknown Unknowns

- **`wrangler dev` vs `astro dev` divergence.** Astro 6's Vite dev server runs on Node.js, not workerd. Code that works in `npm run dev` can fail in production. Periodic testing with `wrangler dev` is needed to catch runtime mismatches, but this isn't the default workflow.
- **Supabase connection model on edge.** Supabase's JS client uses `fetch()` for REST. On Workers, each SSR request creates a fresh Supabase client (no connection pooling by default). Cloudflare Hyperdrive can pool Postgres wire-protocol connections but not Supabase's REST API.
- **Preview deploys are public by default.** Branch preview URLs on Pages expose auth-protected routes without authentication unless Cloudflare Access is configured (free tier available but requires setup).
- **Environment-specific builds.** Astro 6 + Cloudflare adapter determines environment at build time. You cannot build once and deploy to staging + production — each environment needs its own build.
- **Vendor lock-in depth.** The `@astrojs/cloudflare` adapter ties SSR to workerd APIs. Migrating later means switching adapters, retesting all SSR pages, and replacing any Cloudflare-specific APIs (KV, R2, D1) adopted along the way.

## Operational Story

- **Preview deploys**: Cloudflare Pages creates a preview URL for each push to a non-production branch (e.g., `https://<commit-hash>.<project>.pages.dev`). Fork PRs may not trigger previews by default. Preview URLs are publicly accessible — configure Cloudflare Access (free tier) if auth-protected routes need shielding.
- **Secrets**: Environment variables and tokens are stored in Cloudflare Workers Secrets (`wrangler secret put <KEY>`). Secrets are encrypted at rest, scoped per project, and accessible only at runtime via `env.<KEY>`. Rotation: `wrangler secret put <KEY>` overwrites the existing value; no versioning. `SUPABASE_URL` and `SUPABASE_KEY` go here — never in `wrangler.toml` or committed code.
- **Rollback**: `wrangler rollback [VERSION_ID]` shifts 100% of traffic to a previous deployment instantly. Typical time-to-revert: seconds. Caveat: database migrations (Supabase) do not roll back automatically — code rollback + DB forward migration may leave schema mismatches.
- **Approval**: Human-only actions: publish custom domain DNS changes, rotate Supabase service-role key, delete the Workers project, modify billing. Agent-safe actions: `wrangler deploy`, `wrangler rollback`, `wrangler tail`, `wrangler secret put` (with scoped API token).
- **Logs**: `wrangler tail` streams live request logs (headers, status codes, exceptions, console output). `wrangler tail --format json` for structured output. For historical logs, Cloudflare Logpush (paid) or the Workers Analytics Engine (free tier available). MCP servers can also query deployment and log state via structured tools.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| CJS dependency breaks production build | Devil's advocate | Medium | High | Pin Supabase SDK versions; test builds with `wrangler dev` before deploying; use `@astrojs/cloudflare` compatibility flags |
| Free-tier CPU limit (10ms) causes 1015 errors on complex SSR pages | Pre-mortem | Medium | Medium | Monitor CPU usage via `wrangler tail`; upgrade to $5/mo paid plan if any page consistently exceeds 10ms |
| Free-tier script size limit (3 MB) exceeded by React 19 + shadcn bundle | Devil's advocate | Low | Medium | Tree-shake aggressively; prerender static pages; upgrade to paid plan (10 MB limit) if needed |
| Subrequest limit (50/invocation on free tier) hit by parallel Supabase queries | Devil's advocate | Low | Medium | Batch Supabase queries where possible; upgrade to paid plan (10,000 limit) if dashboard pages need many parallel fetches |
| `astro dev` masks workerd incompatibilities — bugs surface only in production | Unknown unknowns | Medium | High | Add `wrangler dev` smoke test to pre-deploy checklist; consider CI step that builds and runs with wrangler |
| Preview deploy URLs expose auth-protected routes | Unknown unknowns | Medium | Medium | Configure Cloudflare Access on preview subdomain (free tier); or accept risk for single-user MVP |
| Pages-to-Workers migration needed if ASSETS binding conflict hits | Pre-mortem | Low | Medium | Start with Workers deployment target (`wrangler deploy`) rather than Pages (`wrangler pages deploy`) — follow Cloudflare's current recommendation for SSR |
| Environment-specific builds prevent single-build-multi-deploy | Unknown unknowns | Low | Low | Accept separate builds per environment; keep build fast by limiting SSR page count at MVP |
| Vendor lock-in via `@astrojs/cloudflare` adapter | Unknown unknowns | Low | Low | Acceptable for MVP; migration path exists via `@astrojs/node` adapter if needed later |
| Supabase REST API not poolable via Hyperdrive | Research finding | Low | Low | Not an issue at MVP scale (single user); revisit if concurrent users grow significantly |

## Getting Started

1. **Install Wrangler globally**: `npm install -g wrangler` (or use project-local via `npx wrangler`).
2. **Authenticate**: `wrangler login` — opens browser for OAuth, stores token locally. Scope the API token to Pages/Workers for this project only.
3. **Verify local build works on workerd**: Run `npm run build` to produce the Cloudflare-compatible build, then `wrangler dev` to test locally against the workerd runtime (not just `npm run dev` which uses Node.js).
4. **Set secrets**: `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY` — enter values when prompted. These are encrypted and available at runtime.
5. **Deploy**: `wrangler deploy` — deploys the SSR app to Cloudflare Workers. Returns the live URL. First deploy creates the project; subsequent deploys update it.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions auto-deploy-on-merge is noted in tech stack but not configured here)
- Production-scale architecture (multi-region, HA, DR)
