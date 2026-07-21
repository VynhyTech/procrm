import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, scopedProcedure } from "../trpc";
import { requireActiveOrg } from "../lib/auditHelper";
import { generateApiKey } from "../lib/apiKey";

// Matches the org-admin scope gate already used for Settings/Homepage (ADMIN_SCOPES elsewhere).
const ADMIN_SCOPES = ["businessUnits:manage", "teams:manage"];

export const apiKeysRouter = router({
  list: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "List the org's API keys (never returns the raw secret)" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";
      return ctx.db.apiKey.findMany({
        where: { orgId },
        select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "Generate a new API key for external lead intake — the raw key is only ever returned once" })
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const { rawKey, keyHash, keyPrefix } = generateApiKey();
      const key = await ctx.db.apiKey.create({
        data: { orgId, name: input.name, keyHash, keyPrefix, createdBy: ctx.userId as string },
      });
      return { id: key.id, name: key.name, keyPrefix: key.keyPrefix, createdAt: key.createdAt, rawKey };
    }),

  revoke: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "Revoke an API key" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const key = await ctx.db.apiKey.findFirst({ where: { id: input.id, orgId } });
      if (!key) throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });
      await ctx.db.apiKey.update({ where: { id: input.id }, data: { revokedAt: new Date() } });
      return { success: true };
    }),

  listRequestLogs: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "List recent lead-intake webhook requests for debugging" })
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      return ctx.db.webhookRequestLog.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
});
