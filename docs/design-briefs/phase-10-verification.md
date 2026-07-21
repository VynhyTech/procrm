# Design Brief: Phase 10 — Final Verification

## Approach

This phase has no new runtime app code — it's the capstone check plus fixing the repo's own test artifacts, which are still shaped for the old framework. Read both existing scripts fully before planning changes rather than assuming from their names:

- **`tests/test-api.sh`** relies entirely on framework conventions that don't exist anymore: a `/api` discovery endpoint that lists all procedures, a `utils.healthCheck` procedure, a `/apps/app--daily-team-activities` base-path pattern, and `accounts.*` endpoints for an entity that was removed from the schema before this migration even started. None of this is salvageable — full rewrite, reusing its existing `run_test`/PASS-FAIL harness pattern (worth keeping, it's a fine shape) against endpoints that actually exist.
- **`tests/test-manual-checklist.md`** is mostly still accurate (Contacts, Opportunities, Tasks, Team Chat, AI Features, Reports, Agent Performance, Settings, Audit Log, Compliance, Tenant Management, Responsive, Dark Mode sections describe real current functionality) — only Section 1 (Auth: "Login with Synthetiq account") and Section 2/5 (reference an "Account" entity already removed from the schema, predating this migration) need fixing. Rewriting the whole 177-line document would be scope creep into general product QA; fixing the two migration-relevant sections plus adding coverage for the new invite/claim flow (which has zero checklist coverage today) is the right size.
- **`tests/test-build.sh`** isn't named in the original plan but is now silently broken (`pnpm run validate:*` — commands deleted in Phase 1) — worth fixing alongside the other two since it's the same category of "repo's own sanity check is stale," and leaving it broken undermines the point of a verification phase.

**The one genuinely new kind of check this phase does**: every prior phase's verification was curl/tsx-script based, hitting the API directly. **No phase has ever rendered the actual React UI in a real browser** — Phase 5/7's checks were typecheck plus an isolated SSR smoke test of just `AuthProvider`/`ProtectedRoute`, not a real page like `DashboardPage` or `LeadListPage` actually mounting in a DOM. A component-level bug (a bad import, a null-ref on first render, a broken chart) would be invisible to every check run so far. This phase closes that gap with a real `npm run dev` + browser walkthrough.

## What gets updated

**`tests/test-api.sh`** (rewritten): same PASS/FAIL harness shape, targeting `http://localhost:4000` directly (no more `/apps/...` prefix). Covers: unauthenticated requests to protected endpoints return `401` (not the old discovery-based procedure count), a full signup → cookie → `auth.me` round trip, and spot-checks a few real CRM endpoints post-auth (`leads.getLeadStats`, `orgSettings.getOrgMembers`).

**`tests/test-manual-checklist.md`** (targeted edit, not full rewrite): Section 1 rewritten for email/password signup/login/logout instead of "Login with Synthetiq account"; a new section added for the invite/claim-link flow (invite a teammate → get claim link → claim it in an incognito window → confirm they land in the right org); the Account-entity references in Section 2's lead-conversion step and the standalone Section 5 removed (leads convert directly to a Contact, optionally with an Opportunity — confirmed against `leads.ts`'s actual `convert` procedure back in Phase 6, not guessed).

**`tests/test-build.sh`** (mechanical fix): `pnpm run` → `npm run`, drop the deleted `validate:*` test cases, keep everything else (build, typecheck, lint, schema-integrity checks) since those concepts still apply.

## Failure modes / risks

- **A real browser walkthrough can fail in ways curl never would** — a component throwing on mount, a missing import surfacing only at runtime (not typecheck, if it's an untyped dynamic import path), a CSS token from Phase 7 that doesn't actually look right despite compiling correctly. This is exactly why this phase exists rather than declaring victory off the API-level checks alone.
- **The manual checklist edit is intentionally narrow.** Rewriting all 19 sections against current functionality would require verifying every feature end-to-end myself first — real work, but a different and much larger task than "finish decoupling from Synthetiq." Scoping to the auth/invite/Account sections keeps this phase honest about what it actually checked versus what it's assuming still works from before.
- **`aiFeatures.ts` (Phase 8) still blocks a full server boot.** The browser walkthrough and `test-api.sh` both need the real `appRouter`, not the temporarily-trimmed one used for isolated testing in Phases 6/9 — so this phase's walkthrough will hit the same boot failure until Phase 8 is resolved, unless it's run with the same temporary-exclusion technique one more time. Flagging this now rather than discovering it mid-verification.

## Verification plan (this phase's actual deliverable)

```bash
# Final sanity sweep
grep -rln "synthetiq" -i . --include="*.ts" --include="*.tsx" --include="*.json" 2>/dev/null | grep -v node_modules
# expect: only src/server/routes/aiFeatures.ts (Phase 8, deferred) and package.json/package-lock.json's
# leftover "@synthetiq" substring inside unrelated dependency names, if any — nothing else

npm run typecheck   # expect: still exactly 3 known errors

# Real browser walkthrough (via the `run` skill) — the new kind of check this phase adds:
npm run dev
# 1. Sign up a new account
# 2. Onboard: create an organization
# 3. Land on Dashboard — confirm it renders (first-ever real render of this page)
# 4. Create a Lead, view its detail page, convert it (confirm no Account-entity references)
# 5. Invite a teammate via Settings/Org Members — copy the claim link
# 6. Open the claim link in an incognito window, complete signup, confirm landing in the right org
# 7. Switch orgs via UserMenu, confirm scopes/nav update
# 8. Log out, log back in
# Watch the browser console throughout for any runtime error Phase 5/7's typecheck-only
# verification couldn't have caught.

bash tests/test-api.sh    # rewritten version
bash tests/test-build.sh  # rewritten version
```

## Implementation notes (what actually happened)

The browser walkthrough earned its keep: it surfaced three real, pre-existing bugs that no prior curl/typecheck-based phase could have caught, plus one broken tool. Each got its own follow-up brief:

- **Phase 10b** (`phase-10b-onboarding-scopes-fix.md`): `onboarding.register` looked up a global `"Admin"` role that nothing in the codebase ever seeds, so every brand-new self-service signup ended up with zero scopes — Dashboard rendered (no scope requirement) but every real CRM action showed "You don't have access to this page." Root-caused in two parts (the missing role grant, then a second bug once that was fixed: the session's `activeOrgId` was never activated either) and fixed by extracting `orgSettings.seedCrmRoles`'s role/scope definitions into a shared `seedCrmRolesForOrg` helper that `onboarding.register` now also calls, plus mirroring `switchOrg`'s own session-activation pattern.
- **Phase 10c** (`phase-10c-batch-url-length.md`): Fastify's router (`find-my-way`) has a default 100-character cap on the batched-procedure-names URL segment. Lead Detail's normal batch of queries crosses that easily, and once it does, the whole batch 414s — silently breaking every query in it, not just the long-named ones. First attempted fix (`httpBatchLink`'s `maxURLLength`) was diagnosed wrong and didn't work (it caps *total* URL length, not this specific per-parameter limit); corrected to raising Fastify's own `maxParamLength` at construction, which verifiably fixed it.
- **Phase 10d** (`phase-10d-eslint-config.md`): `eslint.config.mjs` itself still imported `@synthetiq/app-framework` — linting had been completely broken since Phase 1 and nothing had ever run it until this phase's `test-build.sh`. Replaced with a standalone flat config; dropped `eslint-plugin-tailwindcss` after its own dependency threw an unrelated, pre-existing resolution bug, rather than debugging a third-party plugin's internals.

Two script bugs of my own were also found and fixed along the way, not app bugs: `tests/test-api.sh`'s `opportunities.getAll` referenced a procedure that doesn't exist (it's `getAllOpportunities`), and its logout call was missing a `content-type`/body, so Fastify 415'd it before the mutation ever ran, and the "logout doesn't invalidate the session" failure it produced was actually testing nothing.

Final verification results:
```
grep -rln "synthetiq" -i . --include="*.ts" --include="*.tsx" --include="*.json" --include="*.mjs" | grep -v node_modules
# -> src/server/router.ts (comment explaining the Phase 8 deferral), src/server/routes/aiFeatures.ts (deferred file itself)
# both expected; router.ts's mount comment was reworded from "TEMP... restoring before commit" to
# accurately reflect that this is a deliberate, open-ended deferral, not a walkthrough-only hack.

npm run typecheck   # same known baseline: aiFeatures.ts's 2 module-not-found errors (Phase 8) +
                     # ContactListPage.tsx/LeadDetailPage.tsx's pre-existing, unrelated errors

Browser walkthrough (Playwright, real chromium, 3 concurrent user sessions): 16/16 checks passed —
signup -> onboarding -> dashboard -> lead create -> qualify -> convert -> second org signup ->
cross-org invite (existing user, added directly) -> new-user invite+claim (fresh incognito context,
lands in the correct org) -> UserMenu shows both orgs -> org switch reflected server-side ->
logout -> re-login. One non-blocking residual: intermittent "Failed to fetch" console noise on an
idle background tab during heavy concurrent activity on other tabs — reproduced inconsistently,
traced to the local dev environment (webpack-dev-server/Chromium connection handling under 3
simultaneous browser contexts on one machine), not to application code; the same signup/invite/
claim logic was independently verified correct via direct curl and isolated single-context tests.

bash tests/test-api.sh     # 14/14 passed
bash tests/test-build.sh   # 14/16 passed — the 2 failures are both aiFeatures.ts's Phase 8
                            # module-not-found error (typecheck, build:server); expected, not new
```

## Status

**Implemented and verified.** Migration verification is complete modulo the explicitly deferred Phase 8 (AI features / Anthropic SDK swap). No invite-trigger UI exists anywhere in the frontend (`orgSettings.inviteMember` has zero call sites in `src/web`) and `/admin/users`/`/admin/organizations` are dead nav links with no matching route — both pre-existing gaps, documented in `tests/test-manual-checklist.md`, not caused by this migration.
