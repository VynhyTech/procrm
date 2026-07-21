# Design Brief: Phase 9 — Build/Dev Tooling, Scopes Seeding, npm Scripts

## Approach

This is the phase that makes `npm run dev` and `npm run build` real commands for the first time — right now `package.json` only has `typecheck`/`lint`/`db:*`, and there's no `webpack.config.js` at all (deleted in Phase 1 along with the framework preset it depended on, never replaced since nothing needed to actually build until now). Checked the repo's own `tests/test-build.sh` (a pre-existing script, currently broken on the deleted `validate:*`/`pnpm` commands) to confirm the expected shape: `dist/server`, `dist/web`, and `favicon.svg`/`index.html` at the root — so this phase's output layout isn't a new decision, it's matching what was already assumed elsewhere in the repo.

**One dead-weight find while scoping this**: `media/synthetiq-logo-black.png`, `synthetiq-logo-white.png`, and `mockup.png` are never referenced anywhere in `src/web` (confirmed via grep) — leftover Synthetiq branding assets. The build only needs to copy `favicon.svg` (actually referenced in `index.html` and `Layout.tsx`), not the whole `media/` directory.

## Interface / contract

**New dependencies**: `webpack-dev-server` (missing entirely — needed for `webpack serve`), `concurrently` (run the API server + webpack dev server together), `@fastify/static` (production static-file serving, added to `serve.ts`).

**`webpack.config.js`** (new): `esbuild-loader` for `.ts`/`.tsx` (already a devDependency), `html-webpack-plugin` against `index.html`, the `css-loader`/`postcss-loader`/`style-loader` chain for Tailwind, `copy-webpack-plugin` for `favicon.svg` only, output to `dist/web`. `devServer`: `historyApiFallback: true` (so refreshing `/leads/123` doesn't 404 in dev) plus a proxy rule forwarding `/api/trpc` to the Fastify server (`http://localhost:4000`, matching `serve.ts`'s default port) — `credentials: "include"` on the client means the session cookie only round-trips correctly if the proxy forwards it transparently, which is the default behavior for `http-proxy-middleware` (what `webpack-dev-server`'s `proxy` option uses under the hood) but gets explicitly verified below rather than assumed, per the concern raised earlier in this migration.

**`serve.ts`** (extends Phase 3): adds `@fastify/static` registered against `dist/web`, plus a `setNotFoundHandler` that serves `index.html` for any unmatched GET request **except** ones under `API_BASE` (which should 404 normally, not silently return HTML) — this is the SPA-fallback Phase 3's brief flagged as deferred ("Serving the built frontend ... is added in Phase 9").

**New `src/server/lib/seedScopes.ts`**: exports `seedScopes(db)` — reads `scopes.json`'s `scopes` array (resolved via `process.cwd()`, not `__dirname`, so it works regardless of how deep the compiled output ends up nested) and `upsert`s each into the `Scope` table (`where: { name }`, idempotent). Called from two places: `scripts/seed-scopes.ts` (standalone CLI, `npm run db:seed`) and once at the top of `serve.ts`'s boot sequence (so `npm run dev` never needs a manual seed step). Seeds every scope listed in `scopes.json` as-is, including the handful (`oauth:apps`, `oauth:admin`, `workflows:*`, `logs:view`, `services:manage`) that reference framework features deleted back in Phase 2 — they're inert metadata rows now (nothing checks them, since the routes that would have are gone), cheap to leave rather than worth hand-curating out.

**`package.json` scripts**:
```json
"dev": "concurrently \"tsx watch src/server/serve.ts\" \"webpack serve\"",
"build": "npm run build:web && npm run build:server",
"build:web": "webpack --mode production",
"build:server": "tsc -p tsconfig.server.json",
"start": "node dist/server/<compiled-path>/serve.js",
"db:seed": "tsx scripts/seed-scopes.ts"
```
`db:generate`/`db:push`/`db:migrate` stay as-is.

## Failure modes / risks

- **`<compiled-path>` above is deliberately a placeholder, not a guess.** `tsconfig.server.json` includes both `src/server/**/*` and the two root-level `src/APP_ID.ts`/`src/constants.ts` files, so TypeScript infers the common root as `src/` — meaning `tsc`'s actual output is likely `dist/server/server/serve.js` (a doubled `server/server` segment), not the more intuitive `dist/server/serve.js`. Guessing wrong here means `npm start` fails with a module-not-found error in production. Verification below runs the actual build and inspects the real output tree before finalizing the `start` script, rather than assuming a path.
- **Cookie forwarding through the dev proxy is verified, not assumed** — this was flagged as a concern earlier in this migration (Phase 6's design-brief review), and the answer then was "should be fine by default, will confirm in Phase 9." This is that confirmation: verification below does a real signup + `auth.me` round trip through the webpack-dev-server proxy, not just through Fastify directly.
- **SPA fallback must not shadow the API.** If `setNotFoundHandler` served `index.html` for a genuinely missing `/api/trpc/*` route, a typo'd procedure name would silently return an HTML page instead of a clear 404 — the handler explicitly checks the `API_BASE` prefix first and returns real 404 JSON for those.
- **`db:seed` running at every `serve.ts` boot** is a cheap idempotent upsert (one query per scope, keyed on unique `name`), not a heavy migration — safe to run on every dev restart without a manual "did I remember to seed" step, matching the original plan's intent.

## Verification plan

```bash
npm install   # pulls in webpack-dev-server, concurrently, @fastify/static

npm run build:server
find dist/server -name "serve.js"   # confirms the ACTUAL compiled path — fixes the `start` script's placeholder above

npm run build:web
ls dist/web   # expect index.html, a JS bundle, favicon.svg — NOT synthetiq-logo-*.png or mockup.png

npm run db:seed
# then check via Prisma Studio or a quick query that Scope rows exist matching scopes.json's list

npm run dev &
# expect: Fastify listening AND webpack-dev-server listening, no port conflict

# Real proxy + cookie round-trip test (the thing being verified, not assumed):
curl -sc /tmp/proxy-cookies.txt -X POST http://localhost:3000/api/trpc/auth.signup \
  -H "content-type: application/json" -d '{"email":"proxytest@example.com","password":"correct-horse-battery-staple"}'
curl -sb /tmp/proxy-cookies.txt http://localhost:3000/api/trpc/auth.me
# expect: the second call returns the same user — proves the dev-server proxy forwards the
# session cookie transparently, not just that both servers independently respond

# Production boot, end to end:
npm run build && npm start &
curl -s http://localhost:4000/   # expect the built index.html, served by Fastify + @fastify/static
curl -s http://localhost:4000/leads   # expect the SAME index.html (SPA fallback), not a 404
curl -s http://localhost:4000/api/trpc/does.not.exist   # expect a real 404, not index.html
```

## Implementation notes (what actually happened)

- **Found a pre-existing `webpack.config.js` and `tsconfig.scripts.json` before writing anything** — checking the directory listing first (rather than assuming the brief's file inventory was complete) turned up a `webpack.config.js` still calling the deleted `@synthetiq/app-framework/configs/webpack-base` (missed by every prior phase's audit — nothing had touched it because nothing needed to build until now), and a `tsconfig.scripts.json` clearly meant for one-off scripts (`include: ["src/scripts/**/*", ...]`, `outDir: "./dist/scripts"`). Replaced the former; honored the latter's existing convention by putting the scopes-seed script at `src/scripts/seed-scopes.ts` instead of inventing a new `scripts/` directory at the repo root.
- **`@fastify/static` registration is gated behind `NODE_ENV === "production"`** — a gap in the original brief's wording ("adds `@fastify/static`... this only matters for the production build" described the *intent* but the first draft registered it unconditionally). `dist/web` doesn't exist during `npm run dev`, so an unconditional registration would have crashed `tsx watch` on every dev boot. Caught before it became a real bug by tracing through what actually runs in dev vs. prod.
- **Compiled server path verified, not guessed**: `tsc -p tsconfig.server.json` produces `dist/server/server/serve.js` (a doubled `server/server` segment, from TypeScript inferring `src/` as the common root across `src/server/**/*` and the two root-level `src/APP_ID.ts`/`src/constants.ts` includes) — exactly the failure mode the brief flagged as a guessing risk. `start` script uses the real path.
- **Found and fixed a strictness inconsistency**: building the server surfaced 2 "new" errors (`agentPerformance.ts` possibly-undefined, `aiFeatures.ts` implicit-any) that don't show up in `npm run typecheck`. Cause: `tsconfig.server.json` never received the `noImplicitAny: false` / dropped-`noUncheckedIndexedAccess` relaxation that `tsconfig.json` got back in Phase 2 — same pre-existing-code decision, just inconsistently applied across the two configs. Aligned `tsconfig.server.json` to match rather than treating these as new issues needing separate fixes.
- **The `changeOrigin`/`cookieDomainRewrite` question — answered empirically, not just reasoned about.** Ran a real signup + `auth.me` round trip through the webpack-dev-server proxy with neither setting configured. It worked: the cookie jar showed a host-only cookie (domain `localhost`, no explicit `Domain` attribute, matching how `setSessionCookie` was written), and cookies are scoped by domain, not port — so `localhost:3000` (dev server) and `localhost:4000` (API target) share the same cookie scope with nothing to rewrite. `changeOrigin` wasn't needed either since Fastify does no Host-header-based routing. Neither setting was added.
- **Full end-to-end verification of the exact scenario the brief specified**: `npm run build` produced `dist/web` (favicon + bundles, confirmed zero Synthetiq/mockup assets copied) and the compiled server; `npm start` served the built `index.html` at `/`, served the **same** `index.html` at `/leads` (SPA fallback working), and returned a real `404` JSON error (not swallowed HTML) for a bogus `/api/trpc/does.not.exist` path.
- `aiFeatures.ts`'s Phase 8 dependency still blocks a full server boot exactly as before — reused Phase 6's temporary-comment-out-then-revert technique to test everything else in isolation, confirmed via `git diff` showing zero residual changes to `router.ts`.
- `npm run typecheck`: unchanged at 3 known errors.

## Status

**Implemented and verified** — including a live, empirical answer to the proxy cookie-forwarding question rather than an assumption.
