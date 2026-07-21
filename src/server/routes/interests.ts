import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { requireActiveOrg } from "../lib/auditHelper";

// Resolve parent names for a batch of interests
async function resolveParentNames(
  db: Parameters<typeof requireActiveOrg>[0],
  interests: Array<{ parentType: string; parentId: string }>,
): Promise<Map<string, string>> {
  const leadIds = interests.filter((i) => i.parentType === "Lead").map((i) => i.parentId);
  const contactIds = interests.filter((i) => i.parentType === "Contact").map((i) => i.parentId);
  const map = new Map<string, string>();

  if (leadIds.length > 0) {
    const leads = await db.lead.findMany({ where: { id: { in: [...new Set(leadIds)] } }, select: { id: true, firstName: true, lastName: true } });
    leads.forEach((l: { id: string; firstName: string; lastName: string }) => map.set(l.id, `${l.firstName} ${l.lastName}`));
  }
  if (contactIds.length > 0) {
    const contacts = await db.contact.findMany({ where: { id: { in: [...new Set(contactIds)] } }, select: { id: true, firstName: true, lastName: true } });
    contacts.forEach((c: { id: string; firstName: string; lastName: string }) => map.set(c.id, `${c.firstName} ${c.lastName}`));
  }
  return map;
}

export const interestsRouter = router({
  listAll: scopedProcedure([])
    .meta({ description: "Get all interests for the organization with parent names" })
    .input(z.object({ status: z.string().optional(), limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const where: Record<string, unknown> = { orgId };
      if (input.status) where.status = input.status;
      const [interests, total] = await Promise.all([
        ctx.db.interest.findMany({ where, orderBy: { createdAt: "desc" }, take: input.limit, skip: input.offset }),
        ctx.db.interest.count({ where }),
      ]);
      const parentMap = await resolveParentNames(ctx.db, interests);
      return { interests: interests.map((i) => ({ ...i, parentName: parentMap.get(i.parentId) ?? null })), total };
    }),

  getById: scopedProcedure([])
    .meta({ description: "Get a single interest by ID with parent info" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const interest = await ctx.db.interest.findUnique({ where: { id: input.id } });
      if (!interest) throw new TRPCError({ code: "NOT_FOUND", message: "Interest not found" });

      let parentName: string | null = null;
      if (interest.parentType === "Lead") {
        const lead = await ctx.db.lead.findUnique({ where: { id: interest.parentId }, select: { firstName: true, lastName: true } });
        if (lead) parentName = `${lead.firstName} ${lead.lastName}`;
      } else if (interest.parentType === "Contact") {
        const contact = await ctx.db.contact.findUnique({ where: { id: interest.parentId }, select: { firstName: true, lastName: true } });
        if (contact) parentName = `${contact.firstName} ${contact.lastName}`;
      }

      return { ...interest, parentName };
    }),

  list: scopedProcedure([])
    .meta({ description: "Get interests for a lead or contact" })
    .input(z.object({ parentType: z.enum(["Lead", "Contact"]), parentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.interest.findMany({
        where: { parentType: input.parentType, parentId: input.parentId },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: scopedProcedure(["interests:edit"])
    .meta({ description: "Add an interest to a lead or contact" })
    .input(z.object({
      name: z.string().min(1),
      parentType: z.enum(["Lead", "Contact"]),
      parentId: z.string(),
      propertyType: z.string().optional(),
      budgetMin: z.number().min(0).optional(),
      budgetMax: z.number().min(0).optional(),
      locationArea: z.string().optional(),
      bedrooms: z.number().min(0).optional(),
      bathrooms: z.number().min(0).optional(),
      furnishingPreference: z.string().optional(),
      moveInTimeline: z.string().optional(),
      otherDetail: z.string().optional(),
      campaignId: z.string().optional(),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      return ctx.db.interest.create({
        data: { orgId, ...input, status: "Active" },
      });
    }),

  update: scopedProcedure(["interests:edit"])
    .meta({ description: "Update an interest" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      propertyType: z.string().optional(),
      budgetMin: z.number().min(0).optional().nullable(),
      budgetMax: z.number().min(0).optional().nullable(),
      locationArea: z.string().optional().nullable(),
      bedrooms: z.number().min(0).optional().nullable(),
      bathrooms: z.number().min(0).optional().nullable(),
      furnishingPreference: z.string().optional().nullable(),
      moveInTimeline: z.string().optional().nullable(),
      otherDetail: z.string().optional().nullable(),
      campaignId: z.string().optional().nullable(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.interest.update({ where: { id }, data });
    }),

  clone: scopedProcedure(["interests:edit"])
    .meta({ description: "Clone an interest onto the same parent, optionally overriding some fields" })
    .input(z.object({
      id: z.string(),
      overrides: z.object({
        name: z.string().min(1).optional(),
        propertyType: z.string().optional().nullable(),
        budgetMin: z.number().min(0).optional().nullable(),
        budgetMax: z.number().min(0).optional().nullable(),
        locationArea: z.string().optional().nullable(),
        bedrooms: z.number().min(0).optional().nullable(),
        bathrooms: z.number().min(0).optional().nullable(),
        furnishingPreference: z.string().optional().nullable(),
        moveInTimeline: z.string().optional().nullable(),
        otherDetail: z.string().optional().nullable(),
        campaignId: z.string().optional().nullable(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.interest.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Interest not found" });
      const o = input.overrides;

      return ctx.db.interest.create({
        data: {
          orgId: existing.orgId,
          parentType: existing.parentType,
          parentId: existing.parentId,
          name: o?.name ?? `${existing.name} (Copy)`,
          propertyType: o?.propertyType !== undefined ? o.propertyType : existing.propertyType,
          budgetMin: o?.budgetMin !== undefined ? o.budgetMin : existing.budgetMin,
          budgetMax: o?.budgetMax !== undefined ? o.budgetMax : existing.budgetMax,
          locationArea: o?.locationArea !== undefined ? o.locationArea : existing.locationArea,
          bedrooms: o?.bedrooms !== undefined ? o.bedrooms : existing.bedrooms,
          bathrooms: o?.bathrooms !== undefined ? o.bathrooms : existing.bathrooms,
          furnishingPreference: o?.furnishingPreference !== undefined ? o.furnishingPreference : existing.furnishingPreference,
          moveInTimeline: o?.moveInTimeline !== undefined ? o.moveInTimeline : existing.moveInTimeline,
          otherDetail: o?.otherDetail !== undefined ? o.otherDetail : existing.otherDetail,
          campaignId: o?.campaignId !== undefined ? o.campaignId : existing.campaignId,
          source: existing.source,
          status: "Active",
        },
      });
    }),

  delete: scopedProcedure(["interests:edit"])
    .meta({ description: "Delete an interest" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.interest.delete({ where: { id: input.id } });
      return { success: true };
    }),

  convertToOpportunity: scopedProcedure(["leads:convert"])
    .meta({ description: "Create an opportunity from an interest" })
    .input(z.object({
      interestId: z.string(),
      opportunityName: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const interest = await ctx.db.interest.findUnique({ where: { id: input.interestId } });
      if (!interest) throw new TRPCError({ code: "NOT_FOUND", message: "Interest not found" });
      if (interest.opportunityId) throw new TRPCError({ code: "BAD_REQUEST", message: "Interest already converted to opportunity" });

      let ownerUserId = ctx.userId;
      let leadId: string | null = null;
      if (interest.parentType === "Lead") {
        const lead = await ctx.db.lead.findUnique({ where: { id: interest.parentId }, select: { ownerUserId: true } });
        if (lead?.ownerUserId) ownerUserId = lead.ownerUserId;
        leadId = interest.parentId;
      } else if (interest.parentType === "Contact") {
        const contact = await ctx.db.contact.findUnique({ where: { id: interest.parentId }, select: { ownerUserId: true } });
        if (contact?.ownerUserId) ownerUserId = contact.ownerUserId;
      }

      let campaignName: string | null = null;
      if (interest.campaignId) {
        const campaign = await ctx.db.campaign.findUnique({ where: { id: interest.campaignId }, select: { name: true } });
        campaignName = campaign?.name || null;
      }

      const opportunity = await ctx.db.opportunity.create({
        data: {
          orgId, leadId, ownerUserId,
          name: input.opportunityName,
          stage: "LeadQualified",
          amount: interest.budgetMax,
          source: interest.source,
          campaignName,
          interestId: input.interestId,
          createdBy: ctx.userId, updatedBy: ctx.userId,
        },
      });

      await ctx.db.interest.update({
        where: { id: input.interestId },
        data: { status: "Fulfilled", opportunityId: opportunity.id },
      });

      return opportunity;
    }),
});
