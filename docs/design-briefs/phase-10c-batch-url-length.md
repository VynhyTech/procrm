# Design Brief: Phase 10c — tRPC batched GET requests can 414 and silently break unrelated queries

## What's broken

Found via the Phase 10 browser walkthrough: the Lead Detail page got stuck on a permanent loading spinner. The console showed:

```
Failed to load resource: the server responded with a status of 414 (URI Too Long)
TRPCClientError: Unable to transform response from server
```

Direct reproduction against Fastify (port 4000), bypassing the browser entirely:

```
$ curl .../api/trpc/leads.getById,interests.list,campaigns.list                                    -> 404 (normal — reaches tRPC, no batch match)
$ curl .../api/trpc/leads.getById,interests.list,campaigns.list,aiFeatures.generateSummary          -> 404
$ curl .../api/trpc/leads.getById,interests.list,campaigns.list,aiFeatures.generateSummary,aiFeatures.getFollowUpRecommendations  -> 414
```

The failure point is exactly where the comma-joined procedure-name path segment crosses **100 characters**. That's `find-my-way` (Fastify's router)'s default `maxParamLength: 100` (confirmed in `node_modules/find-my-way/index.js:98`) — `serve.ts:14` constructs Fastify with `Fastify({ logger: true })`, no override. The tRPC Fastify adapter's batch route captures all batched procedure names in one path parameter; once that parameter exceeds 100 chars, find-my-way rejects the request at the router level, **before tRPC's own handler ever sees it** — so the whole batch 414s as raw (non-JSON) text, which is why the client sees "Unable to transform response from server": it tried to parse an HTML/plaintext 414 error page as tRPC JSON, and every query in that batch — not just the ones with long names — fails together.

**This is not a Phase 8/aiFeatures artifact.** It reproduced with `aiFeatures` excluded and would reproduce identically once it's restored, or on any other page that happens to batch enough procedure names past 100 characters (e.g. Lead Detail's real combination — `leads.getById`, `interests.list`, `campaigns.list`, `audit.getEntityHistory`, `crmActivities.getUnifiedTimeline`, plus AI insights — is already close to or past that line on its own). Every prior phase's verification called one procedure at a time via curl, so this was structurally invisible until a real page fired several concurrent queries in one browser tick and `httpBatchLink` batched them together — exactly what Phase 10 exists to catch.

## Approach

Configure `httpBatchLink` (`src/web/trpc.ts`) with `maxURLLength`. This is tRPC's own built-in mechanism for this exact scenario: once the client estimates a batch would exceed the given URL length, it automatically splits it into multiple smaller batched requests instead of sending one oversized one — no server-side change needed, and it protects against any URL-length limit in the request path (Fastify's router today, but also any future reverse proxy, CDN, or load balancer with its own cap), not just the one we happened to hit.

```ts
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: API_BASE,
      maxURLLength: 2000,
      fetch(url, opts) {
        return fetch(url, { ...opts, credentials: "include" });
      },
    }),
  ],
});
```

`2000` is comfortably under every known real-world limit (find-my-way's 100-char *parameter*, not path, is unusually strict — 2000 total chars keeps well clear of typical 8KB infra limits too) while still batching normally for the vast majority of pages that never approach it.

## Failure modes / risks

- **Splitting changes request count, not behavior.** Each sub-batch is still a normal tRPC batch call; React state updates per-query are unaffected. No procedure-level code changes anywhere.
- **This doesn't remove the underlying router limit** — it just ensures the client never produces a URL long enough to hit it. If a single future procedure name plus one large input alone exceeded 2000 chars, that would need a separate look, but nothing in this codebase is close.
- **Low risk, client-only change** — one file, one added option, no server/schema/auth surface touched.

## Verification plan

```bash
npm run typecheck   # unaffected — no type surface change

# Reproduce the original failure is gone:
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:4000/api/trpc/leads.getById,interests.list,campaigns.list,aiFeatures.generateSummary,aiFeatures.getFollowUpRecommendations"
# still 404 at this length (expected — direct curl bypasses the client's splitting logic,
# this just confirms the route/length math above), the real check is via the browser:

# Re-run the Phase 10 browser walkthrough's Lead Detail step — page should load (no infinite
# spinner), no 414/console error, and the "Converted" status button should be clickable.
```

## Correction — the approved fix didn't work; here's the actual root cause

Implemented `maxURLLength: 2000` on `httpBatchLink` as approved above, re-ran the walkthrough, and the 414 still happened, identically. Checked why against the tRPC client source (`node_modules/@trpc/client/dist/httpBatchLink-*.mjs:169-185`): `maxURLLength` measures the **total** `url.length** against the configured threshold. Our actual failing requests were only ~108–515 characters total — nowhere near 2000 — so the client correctly judged them small enough to send as one batch and never split them. `maxURLLength` guards against a real but different problem (a huge overall URL); it does nothing for find-my-way's much stricter, unusual **per-parameter** 100-char cap on just the comma-joined procedure-names segment, which is what's actually being hit here. Total URL length and this one path parameter's length are not the same measurement — that mismatch was the flaw in the original diagnosis.

**Actual fix**: raise Fastify's own `maxParamLength` at construction time, in `src/server/serve.ts`:
```ts
const server = Fastify({ logger: true, maxParamLength: 500 });
```
Verified directly: the same request that returned `414` before now returns `404` (the normal "batch references a since-removed aiFeatures procedure" response, reaching tRPC's handler instead of dying at the router) — confirmed via curl against Fastify directly, before touching the browser walkthrough.

The `maxURLLength: 2000` client-side change is left in place as harmless defense-in-depth against a genuinely oversized batch (many pages, or a future page with very large inputs), but it is not what fixes this specific, already-reproduced bug — `maxParamLength` is.

## Status

**Implemented and verified** (both the client `maxURLLength` addition and the corrected server-side `maxParamLength` fix). Re-running the full browser walkthrough next to confirm Lead Detail loads end-to-end.
