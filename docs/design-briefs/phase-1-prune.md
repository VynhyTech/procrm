# Design Brief: Phase 1 — Prune & Config Stubs

## Approach

Remove all code paths with zero real UI/route call sites (confirmed via grep in the earlier audit — not a guess), and replace the framework's `extends`-based config files with inline standalone equivalents. This phase does **not** touch auth, DB queries, or tenancy — it's purely subtractive plus config, so it's the lowest-risk phase to go first and de-risks every later phase (nothing downstream can accidentally depend on dead code once it's gone).

**Why safe**: everything deleted here was already confirmed non-functional or unreferenced in the prior audit (`agentLLM.ts` literally throws "not implemented"; the 9 dropped routers have no `trpc.*` call sites anywhere in `src/web`). Nothing here changes runtime behavior of the CRM features — it only removes code that can't run anyway (`@synthetiq/app-framework` doesn't resolve).

## What gets deleted

- `src/server/lib/agentLLM.ts`, `src/server/lib/appSystemPrompt.ts`, `src/server/workflows/`, `schedules.json`
- From `src/server/router.ts`: `adminRouter`, `docsRouter`, `aiAgentRouter`, `servicesRouter`, `oauthAdminRouter`, `oauthAppsRouter`, `workflowAdminRouter`, `logsRouter`, `metricsRouter` mounts
- From `src/server/init.ts`: `initAiAgent`/`initDocs`/`initMcp`/`initOAuthScopes` calls and `src/server/generated/*` manifest imports
- `package.json`: all `@synthetiq/*` deps, all `synthetiq-app`-backed scripts (`validate*`, `generate:*`, `sync:scopes`, `seed:publisher`, `register:schedules`)

## What gets added

- `src/APP_ID.ts` → `export const APP_ID: string`
- `src/constants.ts` → `export const APP_ID`, `export const BASE_PATH`, `export const API_BASE`
- `tsconfig.json` / `tsconfig.server.json` — inlined compiler options (strict, ES2020+, jsx: react-jsx, moduleResolution: bundler) instead of `extends`-ing the missing framework package
- `.gitignore` — un-ignore `src/APP_ID.ts`, `src/constants.ts`, `src/server/generated/`

## Interface/contract exposed to the rest of the app

- `APP_ID`, `BASE_PATH`, `API_BASE` exports must match exactly what `App.tsx`/`trpc.ts` destructure in later phases.
- `appRouter` in `router.ts` keeps the same shape minus the 9 deleted framework-router keys (`admin`, `docs`, `ai`, `services`, `oauthAdmin`, `oauthApps`, `workflowAdmin`, `logs`, `metrics`). No CRM router keys change.

## Failure modes / risks

- If any deleted router *is* referenced somewhere not caught by static grep (e.g. a dynamic string lookup), `npm run typecheck` fails loudly and immediately — cheap to catch, not a silent-corruption risk.
- Inlining tsconfig options wrong could cause type-check false negatives/positives — mitigated by running `typecheck` right after and comparing error count against a fresh baseline.
- No security-relevant risk in this phase — no auth/data-access code is touched.

## Verification plan

```bash
grep -rn "@synthetiq" src/ package.json   # should return nothing except the 19 route files' scopedProcedure imports (fixed in Phase 6)
npm run typecheck                          # baseline error count, expect only Phase-6-pending import errors
```

## Status

**Awaiting approval** — no code written yet.
