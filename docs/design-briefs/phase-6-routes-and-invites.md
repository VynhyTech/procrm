# Design Brief: Phase 6 — Route File Swap + Invite/Claim Flow

## Approach

**This is the phase that finally lets the whole server boot.** Every one of the 19 remaining route files has the exact same single line: `import { router, scopedProcedure } from "@synthetiq/app-framework/server";` (confirmed via fresh grep — dashboard.ts on line 1, the other 18 on line 2, byte-for-byte identical text otherwise). Swapping it to `from "../trpc"` is the entire mechanical part of this phase — `Ctx`'s shape (`db`, `userId`, `currentOrgId`, `jwtScopes`, `scopes`) already matches every usage across all 19 files exactly (re-confirmed against `orgSettings.ts` and `tenants.ts`'s `ctx.jwtScopes?.includes(...)` pattern), so no route logic changes.

**The real work is the invite flow** — confirmed gap: nothing lets an org admin add someone to their org. `orgSettings.ts` has `getOrgMembers` but no way to grow that list. Adding `inviteMember` there, next to the other org-membership management it already does.

**Security improvement over the original plan**: the earlier roadmap described the claim link as just `/signup?email=<email>` (pre-filling the field) — but Phase 4's signup logic attaches a credential to any credential-less `User` row matching an email, with nothing checking that the person completing signup actually owns that invite. A plain email-prefill link is UX convenience only, not a security boundary — anyone who *guesses or knows* the invited email could race the real invitee and claim their seat in the org before they do. Closing this is cheap (one random token, matching the exact pattern already used for sessions), so this brief builds the token-gated version rather than the weaker one, even though it's slightly more than the original plan called for.

## Interface / contract

**Schema addition** (small, additive — like Phase 2/4's pattern):
```prisma
model User {
  // ...existing fields...
  inviteToken          String?   @unique
  inviteTokenExpiresAt DateTime?
}
```
Cleared (`null`) the moment a credential is attached — a claimed invite token can never be reused.

**`orgSettings.ts` — new `inviteMember`**:
```ts
inviteMember: scopedProcedure(["orgs:manageOrgMembers"])
  .input(z.object({ email: z.string().email(), roleId: z.string().optional() }))
  .mutation(async ({ ctx, input }) => {
    const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);   // derived from ctx, never from client input
    const email = input.email.trim().toLowerCase();
    // ... see behavior below ...
  })
```
Behavior:
- **Existing user with a real account** (`credential` set): if already a member of this org, `CONFLICT`. Otherwise, add `OrganizationMember` (+ the given `roleId`, or the org's `isDefault` role if found, or no role at all if neither exists — degrades gracefully rather than blocking the invite) directly. No token needed — they already own a verified login.
- **No user, or a pending (credential-less) user**: create-or-reuse the `User` row (`isExplicitInvite: true`), generate `inviteToken` (`randomBytes(32).base64url`, same pattern as session tokens) with a 7-day `inviteTokenExpiresAt`, create the `OrganizationMember` + role, and return `{ claimUrl: "/signup?email=...&inviteToken=..." }` for the admin to share manually (no SMTP, per your earlier call).

**Extends Phase 4's `signup`** (`src/server/routes/auth.ts`): input gains an optional `inviteToken`. When `signup` finds an existing credential-less `User` by email (the branch Phase 4 already built for exactly this), it now **requires** `input.inviteToken` to match that user's stored `inviteToken` and not be expired — `FORBIDDEN` otherwise. On success, `inviteToken`/`inviteTokenExpiresAt` are cleared in the same write that creates the `Credential`.

**Extends Phase 5's `SignupPage.tsx`**: reads `email`/`inviteToken` from the URL query string (`useSearchParams`), pre-fills and locks the email field when both are present (changing the email would just make the token stop matching), and passes `inviteToken` through to the `signup` mutation.

## Failure modes / security risks

- **Existing users are added to a new org without any accept/reject step** — they'll only discover it next time they log in and see the new org in their switcher. No notification system exists yet (consistent with Phase 4's already-accepted "no email flow for v1"). Acceptable for now, same tier of limitation as everything else deferred pending real email delivery.
- **`inviteMember` derives `orgId` from `ctx.currentOrgId`, never from client input** — deliberately, so an admin with `orgs:manageOrgMembers` on Org A can't be tricked into inviting someone into Org B by a crafted request; the org is always "whichever one this admin is currently acting in," matching every other org-scoped mutation in this codebase.
- **Token comparison** uses Prisma's `findUnique`/equality check (DB index lookup), not a manual string compare — no timing side-channel to worry about here the way there was for password login, since token guessing isn't defended by response-time uniformity but by the token's 256-bit search space.
- **7-day expiry is a judgment call**, not derived from anything — long enough that a slow-to-respond invitee doesn't get locked out, short enough that a stale, unclaimed invite doesn't stay exploitable indefinitely. Easy to tune later.

## Verification plan

This is the first phase where a **real, full end-to-end HTTP verification** is actually possible — no more isolated-caller workarounds.

```bash
npm run typecheck
# expect: zero @synthetiq/app-framework/server errors anywhere. Only Phase 8's
# aiFeatures.ts (services-claude-api-client) and the 2 pre-existing unrelated issues remain.

npx prisma db push   # push the inviteToken/inviteTokenExpiresAt columns to Supabase

npx tsx src/server/serve.ts &
# expect: actually starts and stays up — first time in this app's history.

curl -sc /tmp/c1.txt -X POST http://localhost:4000/api/trpc/auth.signup -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"correct-horse-battery-staple","name":"Admin"}'
curl -sb /tmp/c1.txt http://localhost:4000/api/trpc/leads.getLeadStats
# expect: no longer UNAUTHORIZED/crash — a real (empty) stats response, proving the full
# auth -> scopedProcedure -> CRM-route chain works end to end for the first time.

# Invite flow, with real org/role setup:
curl -sb /tmp/c1.txt -X POST http://localhost:4000/api/trpc/orgSettings.inviteMember \
  -H "content-type: application/json" -d '{"email":"teammate@example.com"}'
# expect: { claimUrl: "/signup?email=teammate@example.com&inviteToken=..." }

# Wrong/missing token rejected:
curl -X POST http://localhost:4000/api/trpc/auth.signup -H "content-type: application/json" \
  -d '{"email":"teammate@example.com","password":"whatever12","inviteToken":"wrong-token"}'
# expect: FORBIDDEN

# Correct token succeeds and can't be reused:
curl -X POST http://localhost:4000/api/trpc/auth.signup -H "content-type: application/json" \
  -d '{"email":"teammate@example.com","password":"whatever12","inviteToken":"<real token from claimUrl>"}'
# expect: success, then repeating the same request expect FORBIDDEN (token cleared after claim)
```

## Implementation notes (what actually happened)

- **Hashed the invite token, not stored plaintext.** The original design in this brief stored `inviteToken` directly on `User`. Before writing code, reconsidered against the same bar this migration has held for every other bearer secret (password hashes, session tokens): an invite token is just as much a bearer credential as a session token — whoever has it can become that account. Renamed to `inviteTokenHash`, storing `hashToken(rawToken)` (reusing Phase 4's session-token hashing function) and returning the raw token only once, in the `claimUrl`. Required one extra `prisma db push`.
- Added `inviteMember` to `orgSettings.ts` exactly as designed: org derived from `ctx.currentOrgId` via `requireActiveOrg` (never client input), existing-verified-user gets added directly, no-account-or-pending-invite gets a fresh hashed token + 7-day expiry.
- Extended `auth.signup` (Phase 4) to validate `inviteToken` via hash comparison when claiming a credential-less `User`, and to land the claiming user directly in the invited org (mirroring `login`'s existing membership lookup) — a small UX improvement beyond the original brief.
- Extended `SignupPage.tsx` (Phase 5) to read `email`/`inviteToken` from the URL, lock the email field when present.
- **Found and fixed a real bug in my own Phase 3 code, not the CRM business logic.** After the mechanical import swap, typecheck jumped from 3 errors to 64. Root cause: `scopedProcedure`'s null-check on `ctx.userId` never actually narrowed the type for downstream procedures — it forwarded the original `ctx` object via `next({ ctx })` instead of re-stating the now-known-non-null `userId` in a new object literal, so all 19 route files saw `ctx.userId: string | null` and every Prisma write using it as a plain `string` field mismatched. Fixed with the standard tRPC narrowing idiom (`next({ ctx: { ...ctx, userId: ctx.userId } })`), which alone resolved 57 of the 61 new errors.
- The remaining 4 traced to one genuine pre-existing bug, self-labeled `// Bug 7` in the original code: `let opportunity = null;` with no type annotation, later assigned a real object — TypeScript inferred the variable's type as the literal `null` forever. This was invisible before because the entire file's `ctx`/reẗurn types were `any` (framework import unresolved). Fixed with an explicit type annotation; this also resolved two downstream errors in `LeadListPage.tsx` whose types are inferred from `AppRouter`.
- **Full end-to-end HTTP verification actually ran**, for the first time in this app's existence. `aiFeatures.ts`'s separate Phase 8 dependency (`@synthetiq/services-claude-api-client`) still blocks a full boot, so per your call, temporarily commented out its two lines in `router.ts`, ran the complete suite against a live Fastify server + Supabase, then reverted (confirmed via `git diff` showing zero changes to `router.ts` afterward):
  - Signup → real user created, cookie set.
  - `leads.getLeadStats` (a real CRM endpoint) → real response, not `UNAUTHORIZED` — the full `auth → scopedProcedure → Prisma → Supabase` chain confirmed live.
  - `switchOrg` → `scopes` correctly recomputed post-switch (`orgs:manageOrgMembers` appeared after joining the test org's role).
  - `inviteMember` → real claim URL with a real token.
  - Wrong token → `FORBIDDEN`.
  - Correct token → account created, and landed directly in the invited org with correct scopes.
  - Reuse attempt → blocked (now via the ordinary "account already exists" check, since the credential is set).
  - All verification test data (users, org, role, scope, sessions) cleaned up afterward.
- `npm run typecheck`: 3 errors remain, all previously attributed (Phase 8's 2 `aiFeatures.ts` imports, `ContactListPage.tsx`'s pre-existing array-inference quirk from Phase 2's audit) — the cleanest result of the entire migration so far.

## Status

**Implemented and verified end-to-end against a live server and live database** — the first phase where that's been fully possible.
