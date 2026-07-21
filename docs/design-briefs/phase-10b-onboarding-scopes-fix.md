# Design Brief: Phase 10b — Onboarding grants no scopes (found via browser walkthrough)

## What's broken

`onboarding.register` (`src/server/routes/onboarding.ts`) assigns the new org owner a role via:

```ts
let adminRole = await tx.role.findFirst({ where: { name: "Admin", orgId: null, isSystem: true } });
if (!adminRole) {
  adminRole = await tx.role.findFirst({ where: { name: "Admin" } });
}
if (adminRole) {
  await tx.userRole.upsert({ ... });
}
```

No code path in the repo ever creates a global `Role` named `"Admin"` — the only role-creation logic is `orgSettings.seedCrmRoles`, which creates **org-scoped** roles (`"Tenant Admin"`, `"Sales Manager"`, `"Agent"`, `"Viewer"`), and that mutation itself requires `roles:edit` — a scope a brand-new owner doesn't have yet, so they can't even self-serve out of the hole. Both `findFirst` calls always return `null`, the `if (adminRole)` guard fails silently, and the new owner ends up with zero `UserRole` rows → an empty `scopes` array client-side.

**Impact, confirmed live via the Phase 10 browser walkthrough:** a brand-new self-service signup can view the Dashboard (its route requires no scopes) but is blocked from every real CRM action — `/leads/new` requires `leads:edit` and shows "You don't have access to this page." This is a complete dead end for a first-time customer; nothing in the UI can recover it. Pre-existing bug, not introduced by this migration — the original app never exercised this path since accounts came from Synthetiq's system, not self-registration.

## Approach

Extract `seedCrmRoles`'s `ROLE_DEFINITIONS` + create-or-update loop out of `orgSettings.ts` into a shared helper, `src/server/lib/seedCrmRoles.ts`, exporting `seedCrmRolesForOrg(db, orgId): Promise<{ id: string; name: string }[]>` (returns the created/updated roles so callers can find "Tenant Admin"'s id without a second query). Both call sites use the identical scope list from then on — no drift between "what onboarding grants" and "what the reseed button grants."

`orgSettings.seedCrmRoles` becomes a thin wrapper: resolve `orgId`, call the helper, return `{ created: roles.map(r => r.name) }` — same external behavior, same `roles:edit` scope requirement, no change to its existing callers.

`onboarding.register` replaces the dead `Role.findFirst({ name: "Admin" })` block with:
```ts
const roles = await seedCrmRolesForOrg(tx, org.id);
const ownerRole = roles.find((r) => r.name === "Tenant Admin");
if (ownerRole) {
  await tx.userRole.create({ data: { userId: ctx.userId, roleId: ownerRole.id } });
}
```
This runs inside `onboarding.register`'s existing `$transaction`, so org creation and the owner's role grant succeed or fail together — no window where an org exists with an unprivileged owner.

## Interface / contract

- New file `src/server/lib/seedCrmRoles.ts`, one exported function: `seedCrmRolesForOrg(db: PrismaClient | Prisma.TransactionClient, orgId: string): Promise<{ id: string; name: string }[]>`. Takes the same `ROLE_DEFINITIONS` array verbatim from the current `orgSettings.ts` (no scope-list changes) so this is a pure refactor, not a scope-policy change.
- `orgSettings.ts`: `seedCrmRoles` mutation body shrinks to a call-through; `roles:edit` scope requirement unchanged.
- `onboarding.ts`: `register` mutation gains one extra transactional step; its existing input/output shape is unchanged (still returns whatever it already returns on success).

## Failure modes / risks

- **Idempotency**: `seedCrmRolesForOrg` reuses the existing update-in-place logic (`role.findFirst` by `name`+`orgId`, then `deleteMany`+`createMany` on `RoleScope`), so calling it a second time for the same org (e.g. if `seedCrmRoles` is later clicked manually from Settings) is a safe no-op/refresh, not a duplicate-role error — this matches today's behavior for the manual button.
- **Transaction client typing**: the helper must accept `Prisma.TransactionClient` (not just `PrismaClient`) since `onboarding.register` calls it inside `tx.$transaction(...)` — `orgSettings.seedCrmRoles` calls it with the plain `ctx.db`. Both satisfy the same Prisma-generated interface, so one signature covers both call sites.
- **Existing orgs already broken by this bug**: any org created before this fix has an owner with zero scopes and no self-serve way to fix it. Out of scope for this brief (no production orgs exist yet — Supabase DB is dev/test only), but worth a one-line note in the manual checklist so it's not forgotten if this ships before other real orgs exist.
- **Scope drift risk avoided, not introduced**: keeping the scope list in exactly one place (the helper) instead of copy-pasting it into `onboarding.ts` is why this is structured as an extraction rather than a second inline list.

## Verification plan

```bash
npm run typecheck   # clean, same baseline as before this fix

# Re-run the Phase 10 browser walkthrough (same script, from a clean signup):
# 1. Sign up a new account, complete onboarding
# 2. Immediately after landing on Dashboard, confirm scopes are non-empty:
curl -s -b <cookiejar> http://localhost:4000/api/trpc/auth.me | python3 -m json.tool
# 3. Create a Lead from /leads/new — should succeed, no "You don't have access" page
# 4. View lead detail, click "Converted", confirm the modal opens and convert succeeds
```

## Amendment — second root cause, found while verifying the first fix

After implementing the role-grant fix above and re-running the browser walkthrough, the new owner *still* got "You don't have access to this page" on `/leads/new`. Direct API testing (`onboarding.register` then `auth.me`) showed why: `auth.me` returned `"currentOrgId": null` and `"scopes": []` even though the org and the `Tenant Admin` `UserRole` now exist.

Root cause: `ctx.currentOrgId` (`src/server/trpc.ts:28`) comes from `Session.activeOrgId`, and `getEffectiveScopes` (`src/server/lib/scopes.ts:34-44`) only includes an org-scoped role's scopes when that role's `orgId` matches `currentOrgId`. `Session.activeOrgId` is only ever written by `auth.switchOrg` (`src/server/routes/auth.ts:148-151`) — `onboarding.register` creates the org and membership but never activates it for the current session. So even with the role correctly granted, the session never points at the new org, and the effective-scopes query for org-scoped roles always filters on `orgId: null`.

**Fix**: inside `onboarding.register`'s existing transaction, immediately after creating the org, mirror `switchOrg`'s own update:
```ts
await tx.session.update({
  where: { id: ctx.sessionId as string },
  data: { activeOrgId: org.id },
});
```
Same transaction as the org/membership/role creation — so a partial failure never leaves an org whose creator can't act in it. `ctx.sessionId` is already present on `Ctx` for exactly this kind of session-mutation (it's what `switchOrg`/`logout` use today).

This closes the loop: role exists (first fix) + session points at the org holding that role (this fix) = the new owner's scopes actually resolve.

## Status

**Awaiting approval for the amendment** — the role-grant fix (main body above) is implemented; this session-activation fix is not yet applied.
