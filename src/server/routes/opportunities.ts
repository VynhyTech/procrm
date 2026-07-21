import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { logAudit, requireActiveOrg } from "../lib/auditHelper";
import { resolveUserIds, userDisplay } from "../lib/resolveUsers";

const STAGES = [
  "LeadQualified", "InitialDiscussion", "PropertyShared", "SiteVisitScheduled",
  "SiteVisitCompleted", "Interested", "Negotiation", "BookingIntent",
  "AgreementDrafted", "AgreementSigned", "ClosedWon", "ClosedLost",
] as const;

const opportunityFilterSchema = z.object({
  stage: z.string().optional(),
  search: z.string().optional(),
  teamId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export const opportunitiesRouter = router({
  getMyOpportunities: scopedProcedure([])
    .meta({ description: "Get opportunities owned by the current user" })
    .input(opportunityFilterSchema)
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { ownerUserId: ctx.userId };
      if (input.stage) where.stage = input.stage;
      if (input.search) where.name = { contains: input.search };

      const [opportunities, total] = await Promise.all([
        ctx.db.opportunity.findMany({
          where,
          include: {
            owner: { select: { id: true, name: true, email: true, picture: true } },
          },
          omit: { customFields: true },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.db.opportunity.count({ where }),
      ]);

      const userMap = await resolveUserIds(ctx.db, opportunities.flatMap((o) => [o.createdBy, o.updatedBy]));
      return { opportunities: opportunities.map((o) => ({ ...o, createdByName: userDisplay(userMap, o.createdBy), updatedByName: userDisplay(userMap, o.updatedBy) })), total };
    }),

  getTeamOpportunities: scopedProcedure(["opportunities:viewTeam"])
    .meta({ description: "Get opportunities for teams the current user belongs to" })
    .input(opportunityFilterSchema)
    .query(async ({ ctx, input }) => {
      const memberships = await ctx.db.teamMember.findMany({
        where: { userId: ctx.userId },
        select: { teamId: true },
      });
      const teamIds = memberships.map((m) => m.teamId);

      const where: Record<string, unknown> = { teamId: { in: teamIds } };
      if (input.stage) where.stage = input.stage;
      if (input.search) where.name = { contains: input.search };
      if (input.teamId && teamIds.includes(input.teamId)) where.teamId = input.teamId;

      const [opportunities, total] = await Promise.all([
        ctx.db.opportunity.findMany({
          where,
          include: {
            owner: { select: { id: true, name: true, email: true, picture: true } },
          },
          omit: { customFields: true },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.db.opportunity.count({ where }),
      ]);

      const userMap = await resolveUserIds(ctx.db, opportunities.flatMap((o) => [o.createdBy, o.updatedBy]));
      return { opportunities: opportunities.map((o) => ({ ...o, createdByName: userDisplay(userMap, o.createdBy), updatedByName: userDisplay(userMap, o.updatedBy) })), total };
    }),

  getAllOpportunities: scopedProcedure(["opportunities:viewAll"])
    .meta({ description: "Get all opportunities in the organization" })
    .input(opportunityFilterSchema)
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";

      const where: Record<string, unknown> = { orgId: orgId };
      if (input.stage) where.stage = input.stage;
      if (input.search) where.name = { contains: input.search };
      if (input.teamId) where.teamId = input.teamId;

      const [opportunities, total] = await Promise.all([
        ctx.db.opportunity.findMany({
          where,
          include: {
            owner: { select: { id: true, name: true, email: true, picture: true } },
          },
          omit: { customFields: true },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.db.opportunity.count({ where }),
      ]);

      const userMap = await resolveUserIds(ctx.db, opportunities.flatMap((o) => [o.createdBy, o.updatedBy]));
      return { opportunities: opportunities.map((o) => ({ ...o, createdByName: userDisplay(userMap, o.createdBy), updatedByName: userDisplay(userMap, o.updatedBy) })), total };
    }),

  getPipelineView: scopedProcedure(["opportunities:viewAll"])
    .meta({ description: "Get pipeline view of opportunities grouped by stage" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      const opportunities = await ctx.db.opportunity.findMany({
        where: { orgId: orgId },
        include: {
          owner: { select: { id: true, name: true, picture: true } },
        },
        omit: { customFields: true },
        orderBy: { updatedAt: "desc" },
      });

      const pipeline = STAGES.map((stage) => {
        const stageOpps = opportunities.filter((o) => o.stage === stage);
        return {
          stage,
          count: stageOpps.length,
          totalAmount: stageOpps.reduce((sum, o) => sum + (o.amount ?? 0), 0),
          opportunities: stageOpps,
        };
      });

      return { pipeline };
    }),

  getById: scopedProcedure([])
    .meta({ description: "Get an opportunity by ID with all related data" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const opportunity = await ctx.db.opportunity.findUnique({
        where: { id: input.id },
        include: {
          owner: { select: { id: true, name: true, email: true, picture: true } },
          contactRoles: {
            include: { contact: { omit: { customFields: true } } },
          },
          team: { select: { id: true, name: true } },
          businessUnit: { select: { id: true, name: true } },
        },
      });
      if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      // Fetch linked interest if present
      const linkedInterest = opportunity.interestId
        ? await ctx.db.interest.findUnique({ where: { id: opportunity.interestId }, select: { id: true, propertyType: true, budgetMin: true, budgetMax: true, locationArea: true, bedrooms: true, bathrooms: true, furnishingPreference: true, moveInTimeline: true, otherDetail: true, status: true, source: true } })
        : null;
      return { ...opportunity, linkedInterest, customFields: opportunity.customFields as Record<string, unknown> | null };
    }),

  create: scopedProcedure(["opportunities:edit"])
    .meta({ description: "Create a new opportunity" })
    .input(z.object({
      name: z.string().min(1),
      stage: z.string().default("LeadQualified"),
      amount: z.number().optional(),
      probability: z.number().min(0).max(100).optional(),
      closeDate: z.string().optional(),
      source: z.string().optional(),
      ownerUserId: z.string().optional(),
      teamId: z.string().optional(),
      businessUnitId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const opportunity = await ctx.db.opportunity.create({
        data: {
          orgId: orgId,
          ownerUserId: input.ownerUserId ?? ctx.userId,
          name: input.name,
          stage: input.stage,
          amount: input.amount,
          probability: input.probability,
          closeDate: input.closeDate || null,
          source: input.source || null,
          teamId: input.teamId || null,
          businessUnitId: input.businessUnitId || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      await logAudit(ctx.db, { orgId: orgId, userId: ctx.userId, entityType: "Opportunity", entityId: opportunity.id, action: "create" });

      await ctx.db.crmActivity.create({
        data: {
          orgId: orgId,
          userId: ctx.userId,
          relatedObjectType: "Opportunity",
          relatedObjectId: opportunity.id,
          activityType: "StageChange",
          notes: `Opportunity created at stage: ${input.stage}`,
        },
      });

      return opportunity;
    }),

  update: scopedProcedure(["opportunities:edit"])
    .meta({ description: "Update an opportunity" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      amount: z.number().optional().nullable(),
      probability: z.number().min(0).max(100).optional().nullable(),
      closeDate: z.string().optional().nullable(),
      campaignName: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.opportunity.update({ where: { id }, data });
    }),

  updateCustomField: scopedProcedure(["opportunities:edit"])
    .meta({ description: "Set a single custom field value on an opportunity" })
    .input(z.object({ id: z.string(), key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.opportunity.findUnique({ where: { id: input.id }, select: { customFields: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      const current = (existing.customFields as Record<string, unknown>) ?? {};
      const updated = { ...current, [input.key]: input.value } as Prisma.InputJsonValue;
      await ctx.db.opportunity.update({ where: { id: input.id }, data: { customFields: updated, updatedBy: ctx.userId } });
      return { success: true };
    }),

  updateStage: scopedProcedure(["opportunities:edit"])
    .meta({ description: "Update the stage of an opportunity" })
    .input(z.object({ id: z.string(), stage: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.opportunity.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });

      const updated = await ctx.db.opportunity.update({
        where: { id: input.id },
        data: { stage: input.stage },
      });

      await ctx.db.crmActivity.create({
        data: {
          orgId: existing.orgId,
          userId: ctx.userId,
          relatedObjectType: "Opportunity",
          relatedObjectId: input.id,
          activityType: "StageChange",
          notes: `Stage changed from ${existing.stage} to ${input.stage}`,
        },
      });

      return updated;
    }),

  addContactRole: scopedProcedure(["opportunities:edit"])
    .meta({ description: "Add a contact role to an opportunity" })
    .input(z.object({
      opportunityId: z.string(),
      contactId: z.string(),
      roleName: z.string().default("PrimaryBuyer"),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.opportunityContactRole.create({ data: input });
    }),

  removeContactRole: scopedProcedure(["opportunities:edit"])
    .meta({ description: "Remove a contact role from an opportunity" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.opportunityContactRole.delete({ where: { id: input.id } });
      return { success: true };
    }),

  delete: scopedProcedure(["opportunities:delete"])
    .meta({ description: "Delete an opportunity" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.opportunity.delete({ where: { id: input.id } });
      return { success: true };
    }),

  bulkDelete: scopedProcedure(["opportunities:delete"])
    .meta({ description: "Delete multiple opportunities at once" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.opportunity.deleteMany({ where: { id: { in: input.ids } } });
      return { deleted: result.count };
    }),

  bulkUpdateStage: scopedProcedure(["opportunities:edit"])
    .meta({ description: "Update stage of multiple opportunities at once" })
    .input(z.object({
      ids: z.array(z.string()).min(1).max(100),
      stage: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.opportunity.updateMany({
        where: { id: { in: input.ids } },
        data: { stage: input.stage },
      });
      return { updated: result.count };
    }),
});
