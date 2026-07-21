import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { requireActiveOrg } from "../lib/auditHelper";

export const campaignsRouter = router({
  list: scopedProcedure([])
    .meta({ description: "List campaigns for the organization" })
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const [campaigns, total] = await Promise.all([
        ctx.db.campaign.findMany({
          where: { orgId },
          include: {
            creator: { select: { id: true, name: true, email: true } },
            updater: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        ctx.db.campaign.count({ where: { orgId } }),
      ]);
      return { campaigns, total };
    }),

  getById: scopedProcedure([])
    .meta({ description: "Get a campaign by ID" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.campaign.findUnique({ where: { id: input.id } });
    }),

  create: scopedProcedure(["campaigns:edit"])
    .meta({ description: "Create a new campaign" })
    .input(z.object({
      name: z.string().min(1),
      type: z.string().optional(),
      status: z.string().default("Active"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      return ctx.db.campaign.create({ data: { orgId, ...input, createdBy: ctx.userId, updatedBy: ctx.userId } });
    }),

  update: scopedProcedure(["campaigns:edit"])
    .meta({ description: "Update a campaign" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      type: z.string().optional().nullable(),
      status: z.string().optional(),
      startDate: z.string().optional().nullable(),
      endDate: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.campaign.update({ where: { id }, data: { ...data, updatedBy: ctx.userId } });
    }),

  delete: scopedProcedure(["campaigns:edit"])
    .meta({ description: "Delete a campaign" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.campaign.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
