# Design Brief: Phase 3 — tRPC Core (`createContext`, `scopedProcedure`) + HTTP Server

## Approach

This is the first phase that writes genuinely new, security-relevant code (everything before this was deletion/config). Three new files, each with a narrow job:

1. **`src/server/db.ts`** — one Prisma Client singleton for the whole process, built with the `@prisma/adapter-pg` driver adapter (required by Prisma 7, confirmed while implementing Phase 2). No business logic here.
2. **`src/server/trpc.ts`** — replaces everything the route files previously imported from `@synthetiq/app-framework/server`: `router`, `publicProcedure`, `scopedProcedure`, `createContext`. This is where "is this request authenticated, and does it have the right scope" gets decided, once, in one place, instead of scattered across 19 route files.
3. **`src/server/serve.ts`** — the HTTP server entry point. Genuinely new; no equivalent existed before (the framework's CLI owned this).

**Why this is the safe way to do it**: `scopedProcedure` is a single tRPC middleware every mutation/query in the app runs through. Putting the auth/scope check in exactly one place (rather than each route file rolling its own check) means there's one function to audit for correctness, and every route automatically inherits a fix if a bug is found here later. Fail-closed by design: no session → `UNAUTHORIZED`; session but missing scope → `FORBIDDEN`; nothing in this phase can accidentally let an unauthenticated request through, because the default path in `scopedProcedure` throws unless it positively confirms both.

**Important scope boundary**: this phase builds the *read* side only — given an incoming request, resolve who's making it and what they're allowed to do. It does **not** create sessions (no login/signup exists yet — that's Phase 4, next). Until Phase 4 lands, every request will simply resolve to `userId: null` (no cookie exists yet to read), so `scopedProcedure` will correctly reject everything. That's expected and correct, not a bug — there's no way to authenticate yet, so nothing should be let through.

## Interface / contract

```ts
// src/server/db.ts
export const prisma: PrismaClient;   // singleton, built with PrismaPg(process.env.DATABASE_URL)

// src/server/lib/session.ts
export const SESSION_COOKIE_NAME = "session";
export function hashToken(rawToken: string): string;                      // sha256 hex digest
export async function readSession(db, rawToken: string | undefined):      // null if no cookie, not found, or expired
  Promise<{ userId: string; activeOrgId: string | null } | null>;

// src/server/lib/scopes.ts
export async function getPlatformScopes(db, userId: string): Promise<string[]>;               // from roles where orgId === null
export async function getEffectiveScopes(db, userId: string, orgId: string | null): Promise<string[]>; // platform scopes ∪ org-role scopes for orgId

// src/server/trpc.ts
export interface Ctx {
  db: PrismaClient;
  userId: string | null;
  currentOrgId: string | null;
  jwtScopes: string[];   // org-independent — e.g. tenants.ts's platform-admin checks read this
  scopes: string[];      // effective — jwtScopes ∪ org-role scopes for currentOrgId
}
export function createContext(opts: CreateFastifyContextOptions): Promise<Ctx>;
export const router = t.router;
export const publicProcedure = t.procedure;                 // no auth required — used by future auth.signup/login/me
export const scopedProcedure: (requiredScopes: string[]) => <procedure builder>;
  // throws UNAUTHORIZED if ctx.userId is null
  // throws FORBIDDEN if requiredScopes.length > 0 AND none of requiredScopes are in ctx.scopes (OR match, confirmed from Layout.tsx's existing hasScope logic)

// src/server/serve.ts — new Fastify app
// - @fastify/cookie registered (reads/parses cookies onto req.cookies)
// - @trpc/server/adapters/fastify's fastifyTRPCPlugin mounted at prefix "/api/trpc" with { router: appRouter, createContext }
// - listens on process.env.PORT ?? 4000
// - static file serving for the production frontend build is added later in Phase 9 (dev mode uses webpack-dev-server instead)
```

This `Ctx` shape is deliberately identical to what every existing route file already assumes (`ctx.db`, `ctx.userId`, `ctx.currentOrgId`, `ctx.jwtScopes`) — confirmed against actual usage in `leads.ts`, `contacts.ts`, `tenants.ts`, `orgSettings.ts` during the earlier audit. No route file logic needs to change when Phase 6 flips their imports.

## New dependencies

`fastify`, `@fastify/cookie` (both currently absent). `@trpc/server`'s Fastify adapter is already available at `@trpc/server/adapters/fastify` (bundled in the version already installed, confirmed). `@prisma/adapter-pg` is already a dependency from Phase 2.

## Failure modes / security risks

- **No session-creation path exists yet** (by design — see scope boundary above). Nothing to exploit: `createContext` can only ever produce `userId: null` until Phase 4 adds `auth.login`/`auth.signup`. Flagging so it's not mistaken for a bug when nothing is reachable behind auth yet.
- **Scope-check bypass risk**: the only way `scopedProcedure([...])` incorrectly lets a request through is if `ctx.scopes` is computed wrong. Mitigated by keeping the scope computation in one small, unit-testable function (`getEffectiveScopes`) rather than inlined per-route, and by the verification plan below directly inspecting the computed scopes for a known role setup.
- **`jwtScopes` vs `scopes` confusion**: `jwtScopes` (org-independent, platform roles only) exists specifically because `tenants.ts` needs to check platform-admin access regardless of which org is currently active (confirmed from the original audit — `ctx.jwtScopes?.includes("tenants:manage")`). Mixing these up would either wrongly grant platform access based on an org-scoped role, or wrongly deny a platform admin who hasn't selected an org yet. The two functions are named distinctly and never merged silently.
- **Cookie is read-only in this phase** — no `Set-Cookie` logic exists yet (that's Phase 4's job when a session is actually created). So there's nothing to get wrong about cookie flags (`httpOnly`/`secure`/`sameSite`) in this phase specifically; that risk surfaces in Phase 4's brief instead.
- **Fastify JSON body parsing**: tRPC's Fastify adapter needs raw string bodies (it removes and re-adds JSON content-type parsing itself, confirmed in the adapter source) — a misconfigured global body parser elsewhere in `serve.ts` could break this silently. Verification below includes an actual HTTP round-trip, not just a type-check, specifically to catch this class of issue.

## Verification plan

```bash
npm run typecheck
# expect: only Phase-4/5/6/8-deferred @synthetiq import errors remain — zero errors from db.ts/trpc.ts/serve.ts

# start the server standalone (no auth yet, so every call should be UNAUTHORIZED — that's correct):
node --require ts-node/register src/server/serve.ts &
curl -s -X POST http://localhost:4000/api/trpc/leads.getLeadStats -H "content-type: application/json" -d '{}'
# expect: {"error":{"message":"UNAUTHORIZED", ...}} — NOT a 404, NOT a connection refused, NOT an unhandled exception

# confirm scope computation directly against the DB once Phase 2's schema is pushed to Supabase:
# (after manually inserting a test User + Role + Scope + UserRole row)
npx tsx -e "
import { prisma } from './src/server/db';
import { getEffectiveScopes } from './src/server/lib/scopes';
getEffectiveScopes(prisma, '<test-user-id>', '<test-org-id>').then(console.log);
"
# expect: an array containing exactly the scopes granted via that user's roles — nothing extra, nothing missing
```

## Implementation notes (what actually happened)

- Created `src/server/db.ts` (Prisma singleton via `PrismaPg` adapter), `src/server/lib/session.ts` (`hashToken`, `readSession`), `src/server/lib/scopes.ts` (`getPlatformScopes`, `getEffectiveScopes`), `src/server/trpc.ts` (`Ctx`, `createContext`, `router`, `publicProcedure`, `scopedProcedure`), `src/server/serve.ts` (Fastify entry point). Rewired `src/server/index.ts` to re-export `createContext`/`createCallerFactory` from `./trpc`.
- One addition beyond the original brief: `router.ts`'s top-level `router` import also had to move to `./trpc` now that it exists — leaving it on the framework would build the router tree from two different `initTRPC` instances, breaking `AppRouter`'s type inference. `userRouter`/`utilsRouter` stay on the framework import until Phase 4.
- Prisma 7 requires an explicit `prisma generate` build step before `PrismaClient` exists as a real export — added a `postinstall` script so this happens automatically for anyone setting the repo up fresh, rather than hitting a confusing "no exported member 'PrismaClient'" error.
- **The brief's original "start the server, curl it" verification doesn't actually run yet.** `serve.ts` → `router.ts` transitively imports `userRouter`/`utilsRouter` (Phase 4) and all 19 route files (Phase 6), which still reference the nonexistent `@synthetiq/app-framework/server` package. That's a Node `MODULE_NOT_FOUND` at runtime, not a type error — confirmed by actually attempting to boot it. The full HTTP round-trip test is deferred until Phase 6 unblocks module loading.
- Verified the actual Phase 3 deliverable directly instead: called `readSession`/`scopedProcedure`/`createCallerFactory` in isolation (bypassing `router.ts` and the DB entirely) against a throwaway test router. All 5 cases passed: no-cookie session resolves to `null`, no-session → `UNAUTHORIZED`, session-but-wrong-scope → `FORBIDDEN`, session-with-matching-scope → succeeds, and empty `requiredScopes` array correctly means "any authenticated user."
- Typecheck: 45 errors before and after, identical file set — the 5 new files introduced zero errors.

## Status

**Implemented and verified** (core logic verified in isolation; full end-to-end HTTP verification deferred to Phase 6 since the route files it depends on aren't loadable until then).
