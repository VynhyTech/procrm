import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { logAudit, diffChanges, requireActiveOrg } from "../lib/auditHelper";
import { normalizeEmail, normalizePhone, normalizeName, isValidEmail } from "../lib/dataCleaner";

const TERMINAL_STATUSES = ["Converted", "Disqualified", "Merged"];

const leadFilterSchema = z.object({
  status: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  teamId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

// ====== Duplicate detection helper ======
async function detectDuplicates(
  db: Parameters<typeof logAudit>[0],
  orgId: string,
  emailNorm: string | null,
  phoneNorm: string | null,
  firstName: string,
  lastName: string,
  excludeLeadId?: string,
): Promise<{ matchedLeadId: string | null; matchStrength: string | null }> {
  if (!emailNorm && !phoneNorm) return { matchedLeadId: null, matchStrength: null };

  const orConditions: Array<Record<string, unknown>> = [];
  if (emailNorm) orConditions.push({ emailNormalized: emailNorm });
  if (phoneNorm) orConditions.push({ phoneNormalized: phoneNorm });

  const candidates = await db.lead.findMany({
    where: {
      orgId,
      status: { notIn: TERMINAL_STATUSES },
      ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      OR: orConditions,
    },
    select: { id: true, firstName: true, lastName: true, emailNormalized: true, phoneNormalized: true },
    take: 10,
  });

  for (const c of candidates) {
    const nameMatch = c.firstName.toLowerCase() === firstName.toLowerCase() && c.lastName.toLowerCase() === lastName.toLowerCase();
    const emailMatch = emailNorm && c.emailNormalized === emailNorm;
    const phoneMatch = phoneNorm && c.phoneNormalized === phoneNorm;

    if (nameMatch && (emailMatch || phoneMatch)) {
      // Bug 8 fix: check exclusion on BOTH sides of the pair
      const excluded = await db.duplicateExclusion.findFirst({
        where: {
          OR: [
            { leadIdA: c.id, leadIdB: excludeLeadId ?? "" },
            { leadIdB: c.id, leadIdA: excludeLeadId ?? "" },
            { leadIdA: c.id },
            { leadIdB: c.id },
          ],
        },
      });
      if (!excluded) return { matchedLeadId: c.id, matchStrength: "strong" };
    } else if (nameMatch) {
      return { matchedLeadId: c.id, matchStrength: "weak" };
    }
  }

  return { matchedLeadId: null, matchStrength: null };
}

// ====== Contact re-inquiry detection (Design Doc Part D) ======
async function detectContactMatch(
  db: Parameters<typeof logAudit>[0],
  orgId: string,
  emailNorm: string | null,
  phoneNorm: string | null,
  firstName: string,
  lastName: string,
): Promise<{ contactId: string; ownerUserId: string } | null> {
  if (!emailNorm && !phoneNorm) return null;

  // Bug 6 fix: use normalized fields for matching (not raw phone)
  const orConditions: Array<Record<string, unknown>> = [];
  if (emailNorm) orConditions.push({ emailNormalized: emailNorm });
  if (phoneNorm) orConditions.push({ phoneNormalized: phoneNorm });

  const contacts = await db.contact.findMany({
    where: { orgId, OR: orConditions },
    select: { id: true, firstName: true, lastName: true, emailNormalized: true, phoneNormalized: true, ownerUserId: true },
    take: 5,
  });

  for (const c of contacts) {
    const nameMatch = c.firstName.toLowerCase() === firstName.toLowerCase() && c.lastName.toLowerCase() === lastName.toLowerCase();
    const emailMatch = emailNorm && c.emailNormalized === emailNorm;
    const phoneMatch = phoneNorm && c.phoneNormalized === phoneNorm;
    // Strong match only: name + (email or phone)
    if (nameMatch && (emailMatch || phoneMatch)) {
      return { contactId: c.id, ownerUserId: c.ownerUserId };
    }
  }

  return null;
}

// ====== Shared lead-creation core (used by both the leads.create tRPC procedure and the
// external lead-intake webhook route — one dedup/re-inquiry implementation, not two) ======
export interface CreateLeadCoreInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  preferredContactMethod?: string;
  notes?: string;
  source?: string;
  intakeMode: string;
  campaignId?: string; // client-supplied — only honored when intakeMode is manual
  campaignName?: string;
  teamId?: string;
  businessUnitId?: string;
  // Server-resolved campaign for trusted non-manual intake (e.g. webhook, where the campaign
  // comes from an org-scoped API key, not arbitrary client input). Never set from tRPC input.
  trustedCampaignId?: string | null;
}

export async function createLeadCore(
  db: PrismaClient,
  orgId: string,
  actorUserId: string,
  input: CreateLeadCoreInput,
) {
  // Clean data
  const cleanFirst = normalizeName(input.firstName);
  const cleanLast = normalizeName(input.lastName);
  const emailNorm = normalizeEmail(input.email);
  const phoneNorm = normalizePhone(input.phone);

  // Validate email format if provided
  if (input.email && input.email.trim() && !isValidEmail(input.email)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Must include @ and domain (e.g. name@example.com)" });
  }

  // Validate: need email or phone
  if (!emailNorm && !phoneNorm) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Email or phone is required" });
  }

  // Feature 5: Contact re-inquiry detection (Design Doc Part D)
  const contactMatch = await detectContactMatch(db, orgId, emailNorm, phoneNorm, cleanFirst, cleanLast);
  if (contactMatch) {
    // Attach interest + activity to existing contact instead of creating a lead
    const reInquirySource = input.source || input.intakeMode || "Manual";
    const interest = await db.interest.create({
      data: {
        orgId,
        parentType: "Contact",
        parentId: contactMatch.contactId,
        name: `Re-inquiry via ${reInquirySource}`,
        source: reInquirySource,
        campaignId: input.campaignId || input.trustedCampaignId || null,
        status: "Active",
      },
    });

    await db.crmActivity.create({
      data: {
        orgId,
        userId: contactMatch.ownerUserId,
        relatedObjectType: "Contact",
        relatedObjectId: contactMatch.contactId,
        activityType: "Note",
        notes: `Re-inquiry from ${cleanFirst} ${cleanLast} via ${reInquirySource}. New interest created.`,
      },
    });

    return {
      type: "contact_reinquiry" as const,
      contactId: contactMatch.contactId,
      interestId: interest.id,
      ownerUserId: contactMatch.ownerUserId,
    };
  }

  // Detect duplicates against existing open leads
  const dupResult = await detectDuplicates(db, orgId, emailNorm, phoneNorm, cleanFirst, cleanLast);

  // Manual leads start as "New" with owner; inbound → pool (New, no owner)
  const isManual = input.intakeMode === "manual" || input.intakeMode === "pool_manual";
  const status = "New";
  const ownerUserId = input.intakeMode === "manual" ? actorUserId : null;

  // Source: optional for manual (defaults to "Manual" if blank), required for inbound (stamped by system)
  const source = input.source || (isManual ? "Manual" : input.intakeMode);

  // Campaign: for inbound, backend-resolved only (ignore client-supplied campaignId) — except
  // trustedCampaignId, which only trusted server-side callers (the webhook route) can set.
  const campaignId = isManual ? (input.campaignId || null) : (input.trustedCampaignId ?? null);
  let campaignName: string | null = null;
  if (campaignId) {
    campaignName = input.campaignName || (await db.campaign.findUnique({ where: { id: campaignId }, select: { name: true } }))?.name || null;
  }

  const lead = await db.lead.create({
    data: {
      orgId,
      firstName: cleanFirst,
      lastName: cleanLast,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      emailNormalized: emailNorm,
      phoneNormalized: phoneNorm,
      preferredContactMethod: input.preferredContactMethod || null,
      notes: input.notes || null,
      source,
      intakeMode: input.intakeMode ?? "manual",
      campaignId,
      campaignName,
      status,
      ownerUserId,
      matchedLeadId: dupResult.matchedLeadId,
      matchStrength: dupResult.matchStrength,
      teamId: input.teamId || null,
      businessUnitId: input.businessUnitId || null,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    },
  });

  await db.crmActivity.create({
    data: {
      orgId, userId: actorUserId, relatedObjectType: "Lead", relatedObjectId: lead.id,
      activityType: "StatusChange", notes: `Lead created (New${ownerUserId ? ", owned" : ", in pool"})${dupResult.matchStrength ? ` — ${dupResult.matchStrength} duplicate match detected` : ""}`,
    },
  });

  await logAudit(db, { orgId, userId: actorUserId, entityType: "Lead", entityId: lead.id, action: "create" });

  return { type: "lead_created" as const, ...lead };
}

// ====== Interest enrichment helper ======
async function enrichLeadsWithInterests(
  db: Parameters<typeof logAudit>[0],
  leads: Array<{ id: string }>,
): Promise<Map<string, { propertyType: string | null; budgetMax: number | null; locationArea: string | null }>> {
  if (leads.length === 0) return new Map();
  const leadIds = leads.map((l) => l.id);
  const interests = await db.interest.findMany({
    where: { parentType: "Lead", parentId: { in: leadIds }, status: "Active" },
    select: { parentId: true, propertyType: true, budgetMax: true, locationArea: true },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, { propertyType: string | null; budgetMax: number | null; locationArea: string | null }>();
  for (const i of interests) {
    if (!map.has(i.parentId)) {
      map.set(i.parentId, { propertyType: i.propertyType, budgetMax: i.budgetMax, locationArea: i.locationArea });
    }
  }
  return map;
}

export const leadsRouter = router({
  // ====== Lead stats for summary bar (single query) ======
  getLeadStats: scopedProcedure([])
    .meta({ description: "Get lead count breakdown by status for the current org" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";
      const groups = await ctx.db.lead.groupBy({
        by: ["status", "ownerUserId"],
        where: { orgId },
        _count: true,
      });
      let pool = 0, working = 0, qualified = 0, total = 0;
      for (const g of groups) {
        total += g._count;
        if (!g.ownerUserId && !TERMINAL_STATUSES.includes(g.status)) pool += g._count;
        if (g.status === "Working") working += g._count;
        if (g.status === "Qualified") qualified += g._count;
      }
      return { pool, working, qualified, total };
    }),

  // ====== Pool view (derived: no owner, non-terminal) ======
  getPool: scopedProcedure([])
    .meta({ description: "Get unclaimed leads in the pool (no owner, non-terminal status)" })
    .input(leadFilterSchema)
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const where: Record<string, unknown> = { orgId, ownerUserId: null, status: { notIn: TERMINAL_STATUSES } };
      if (input.source) where.source = input.source;
      if (input.search) {
        where.OR = [
          { firstName: { contains: input.search } },
          { lastName: { contains: input.search } },
          { email: { contains: input.search } },
        ];
      }

      const [leads, total] = await Promise.all([
        ctx.db.lead.findMany({
          where,
          include: { owner: { select: { id: true, name: true, email: true, picture: true } } },
          omit: { customFields: true },
          orderBy: { createdAt: "asc" }, take: input.limit, skip: input.offset,
        }),
        ctx.db.lead.count({ where }),
      ]);
      const interestMap = leads.length > 0 ? await enrichLeadsWithInterests(ctx.db, leads) : new Map();
      return { leads: leads.map((l) => ({ ...l, interest: interestMap.get(l.id) ?? null })), total };
    }),

  // ====== My leads ======
  getMyLeads: scopedProcedure([])
    .meta({ description: "Get leads owned by the current user" })
    .input(leadFilterSchema)
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { ownerUserId: ctx.userId };
      // Hide converted/disqualified/merged unless explicitly filtered
      if (input.status) where.status = input.status;
      else where.status = { notIn: TERMINAL_STATUSES };
      if (input.source) where.source = input.source;
      if (input.search) {
        where.OR = [
          { firstName: { contains: input.search } },
          { lastName: { contains: input.search } },
          { email: { contains: input.search } },
        ];
      }
      const [leads, total] = await Promise.all([
        ctx.db.lead.findMany({
          where,
          include: { owner: { select: { id: true, name: true, email: true, picture: true } } },
          omit: { customFields: true },
          orderBy: { createdAt: "desc" }, take: input.limit, skip: input.offset,
        }),
        ctx.db.lead.count({ where }),
      ]);
      const interestMap = await enrichLeadsWithInterests(ctx.db, leads);
      return { leads: leads.map((l) => ({ ...l, interest: interestMap.get(l.id) ?? null })), total };
    }),

  // ====== All leads ======
  getAllLeads: scopedProcedure(["leads:viewAll"])
    .meta({ description: "Get all leads in the organization" })
    .input(leadFilterSchema)
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const where: Record<string, unknown> = { orgId };
      // Hide converted/disqualified/merged unless explicitly filtered
      if (input.status) where.status = input.status;
      else where.status = { notIn: TERMINAL_STATUSES };
      if (input.source) where.source = input.source;
      if (input.search) {
        where.OR = [
          { firstName: { contains: input.search } },
          { lastName: { contains: input.search } },
          { email: { contains: input.search } },
        ];
      }
      const [leads, total] = await Promise.all([
        ctx.db.lead.findMany({
          where,
          include: {
            owner: { select: { id: true, name: true, email: true, picture: true } },
            team: { select: { id: true, name: true } },
          },
          omit: { customFields: true },
          orderBy: { createdAt: "desc" }, take: input.limit, skip: input.offset,
        }),
        ctx.db.lead.count({ where }),
      ]);
      const interestMap = await enrichLeadsWithInterests(ctx.db, leads);
      return { leads: leads.map((l) => ({ ...l, interest: interestMap.get(l.id) ?? null })), total };
    }),

  getById: scopedProcedure([])
    .meta({ description: "Get a lead by ID with related data" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findUnique({
        where: { id: input.id },
        include: {
          owner: { select: { id: true, name: true, email: true, picture: true } },
          team: { select: { id: true, name: true } },
          businessUnit: { select: { id: true, name: true } },
        },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
      // Resolve createdBy to user name
      let createdByUser: { name: string | null; email: string | null } | null = null;
      if (lead.createdBy) {
        createdByUser = await ctx.db.user.findUnique({ where: { id: lead.createdBy }, select: { name: true, email: true } });
      }
      return { ...lead, createdByUser, customFields: lead.customFields as Record<string, unknown> | null };
    }),

  // ====== Create (with data cleaning, dedup, and contact re-inquiry detection) ======
  create: scopedProcedure(["leads:edit"])
    .meta({ description: "Create a new lead with data cleaning, duplicate detection, and contact re-inquiry check" })
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().optional().or(z.literal("")),
      phone: z.string().optional().or(z.literal("")),
      preferredContactMethod: z.string().optional(),
      notes: z.string().optional(),
      source: z.string().optional(),
      intakeMode: z.string().default("manual"),
      campaignId: z.string().optional(),
      campaignName: z.string().optional(),
      teamId: z.string().optional(),
      businessUnitId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      return createLeadCore(ctx.db, orgId, ctx.userId as string, input);
    }),

  // ====== Clone ======
  clone: scopedProcedure(["leads:edit"])
    .meta({ description: "Clone a lead into a new lead, optionally overriding some fields" })
    .input(z.object({
      id: z.string(),
      overrides: z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        source: z.string().optional(),
        preferredContactMethod: z.string().optional().nullable(),
        campaignName: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.lead.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const o = input.overrides;
      const email = o?.email !== undefined ? o.email : existing.email;
      const phone = o?.phone !== undefined ? o.phone : existing.phone;

      const lead = await ctx.db.lead.create({
        data: {
          orgId,
          firstName: o?.firstName ?? existing.firstName,
          lastName: o?.lastName ?? existing.lastName,
          email,
          phone,
          emailNormalized: o?.email !== undefined ? normalizeEmail(email) : existing.emailNormalized,
          phoneNormalized: o?.phone !== undefined ? normalizePhone(phone) : existing.phoneNormalized,
          preferredContactMethod: o?.preferredContactMethod !== undefined ? o.preferredContactMethod : existing.preferredContactMethod,
          notes: o?.notes !== undefined ? o.notes : existing.notes,
          source: o?.source !== undefined ? o.source : existing.source,
          intakeMode: "manual",
          campaignId: existing.campaignId,
          campaignName: o?.campaignName !== undefined ? o.campaignName : existing.campaignName,
          status: "New",
          ownerUserId: existing.ownerUserId,
          teamId: existing.teamId,
          businessUnitId: existing.businessUnitId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      await ctx.db.crmActivity.create({
        data: {
          orgId, userId: ctx.userId, relatedObjectType: "Lead", relatedObjectId: lead.id,
          activityType: "StatusChange", notes: `Lead cloned from ${existing.firstName} ${existing.lastName}`,
        },
      });

      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", entityId: lead.id, action: "create", changes: [{ field: "clonedFrom", oldValue: null, newValue: input.id }] });

      return lead;
    }),

  // ====== Bulk import (CSV) ======
  bulkImport: scopedProcedure(["leads:edit"])
    .meta({ description: "Bulk-create leads from parsed CSV rows" })
    .input(z.object({
      rows: z.array(z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        source: z.string().optional(),
        campaignName: z.string().optional(),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      let created = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const r = input.rows[i];
        try {
          if (!r.firstName?.trim() || !r.lastName?.trim()) {
            skipped++; errors.push({ row: i + 1, message: "Missing first or last name" }); continue;
          }
          const emailNorm = normalizeEmail(r.email);
          const phoneNorm = normalizePhone(r.phone);
          if (!emailNorm && !phoneNorm) {
            skipped++; errors.push({ row: i + 1, message: "Missing email or phone" }); continue;
          }
          if (r.email?.trim() && !isValidEmail(r.email)) {
            skipped++; errors.push({ row: i + 1, message: "Invalid email format" }); continue;
          }

          const cleanFirst = normalizeName(r.firstName);
          const cleanLast = normalizeName(r.lastName);
          const dupResult = await detectDuplicates(ctx.db, orgId, emailNorm, phoneNorm, cleanFirst, cleanLast);

          await ctx.db.lead.create({
            data: {
              orgId,
              firstName: cleanFirst,
              lastName: cleanLast,
              email: r.email?.trim() || null,
              phone: r.phone?.trim() || null,
              emailNormalized: emailNorm,
              phoneNormalized: phoneNorm,
              source: r.source?.trim() || "Import",
              intakeMode: "import",
              campaignName: r.campaignName?.trim() || null,
              status: "New",
              ownerUserId: ctx.userId,
              matchedLeadId: dupResult.matchedLeadId,
              matchStrength: dupResult.matchStrength,
              createdBy: ctx.userId,
              updatedBy: ctx.userId,
            },
          });
          created++;
        } catch (err) {
          skipped++;
          errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", action: "bulk_import", changes: [{ field: "created", oldValue: null, newValue: String(created) }, { field: "skipped", oldValue: null, newValue: String(skipped) }] });

      return { created, skipped, errors: errors.slice(0, 20) };
    }),

  // ====== Claim from pool (atomic) — sets owner, keeps status as New ======
  claim: scopedProcedure(["leads:claim"])
    .meta({ description: "Claim a lead from the pool — atomic, first-come wins. Sets owner, keeps current status." })
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      // Atomic: only update if still unclaimed (no owner + non-terminal = in pool)
      const result = await ctx.db.lead.updateMany({
        where: { id: input.leadId, ownerUserId: null, status: { notIn: TERMINAL_STATUSES } },
        data: { ownerUserId: ctx.userId, updatedBy: ctx.userId },
      });

      if (result.count === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This lead has already been claimed by another agent" });
      }

      await ctx.db.crmActivity.create({
        data: {
          orgId, userId: ctx.userId, relatedObjectType: "Lead", relatedObjectId: input.leadId,
          activityType: "Assignment", notes: "Lead claimed from pool",
        },
      });

      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", entityId: input.leadId, action: "claim" });

      return ctx.db.lead.findUnique({ where: { id: input.leadId } });
    }),

  // ====== Merge duplicates ======
  merge: scopedProcedure(["leads:merge"])
    .meta({ description: "Merge two duplicate leads — surviving lead keeps all data" })
    .input(z.object({ survivingLeadId: z.string(), absorbedLeadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const surviving = await ctx.db.lead.findUnique({ where: { id: input.survivingLeadId } });
      const absorbed = await ctx.db.lead.findUnique({ where: { id: input.absorbedLeadId } });
      if (!surviving || !absorbed) throw new TRPCError({ code: "NOT_FOUND" });

      // Re-point all child records from absorbed to surviving
      await ctx.db.interest.updateMany({ where: { parentType: "Lead", parentId: input.absorbedLeadId }, data: { parentId: input.survivingLeadId } });
      await ctx.db.crmActivity.updateMany({ where: { relatedObjectType: "Lead", relatedObjectId: input.absorbedLeadId }, data: { relatedObjectId: input.survivingLeadId } });
      await ctx.db.communicationMessage.updateMany({ where: { leadId: input.absorbedLeadId }, data: { leadId: input.survivingLeadId } });
      await ctx.db.internalComment.updateMany({ where: { relatedObjectType: "Lead", relatedObjectId: input.absorbedLeadId }, data: { relatedObjectId: input.survivingLeadId } });

      // Copy unique info from absorbed if surviving is blank (Bug 4: include campaign/source)
      const updates: Record<string, unknown> = {};
      if (!surviving.email && absorbed.email) { updates.email = absorbed.email; updates.emailNormalized = absorbed.emailNormalized; }
      if (!surviving.phone && absorbed.phone) { updates.phone = absorbed.phone; updates.phoneNormalized = absorbed.phoneNormalized; }
      if (!surviving.notes && absorbed.notes) updates.notes = absorbed.notes;
      if (!surviving.preferredContactMethod && absorbed.preferredContactMethod) updates.preferredContactMethod = absorbed.preferredContactMethod;
      if (Object.keys(updates).length > 0) {
        await ctx.db.lead.update({ where: { id: input.survivingLeadId }, data: updates });
      }

      // Mark absorbed as merged
      await ctx.db.lead.update({ where: { id: input.absorbedLeadId }, data: { status: "Merged", mergedIntoId: input.survivingLeadId } });

      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", entityId: input.survivingLeadId, action: "merge",
        changes: [{ field: "mergedFrom", oldValue: null, newValue: input.absorbedLeadId }] });

      return ctx.db.lead.findUnique({ where: { id: input.survivingLeadId } });
    }),

  // ====== Reject duplicate match ======
  rejectMatch: scopedProcedure(["leads:merge"])
    .meta({ description: "Mark two leads as not the same person — stops future re-flagging" })
    .input(z.object({ leadIdA: z.string(), leadIdB: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      await ctx.db.duplicateExclusion.create({
        data: { orgId, leadIdA: input.leadIdA, leadIdB: input.leadIdB, decidedBy: ctx.userId },
      });

      // Clear match flags on both leads
      await ctx.db.lead.updateMany({ where: { id: { in: [input.leadIdA, input.leadIdB] } }, data: { matchedLeadId: null, matchStrength: null } });

      return { success: true };
    }),

  // ====== Update ======
  update: scopedProcedure(["leads:edit"])
    .meta({ description: "Update a lead" })
    .input(z.object({
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      preferredContactMethod: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      status: z.string().optional(),
      source: z.string().optional(),
      campaignName: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.lead.findUnique({ where: { id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

      // Bug 6 fix: prevent updates on terminal leads
      if (TERMINAL_STATUSES.includes(existing.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot update a lead with terminal status: ${existing.status}` });
      }

      // A lead shouldn't progress past "New" without someone owning it.
      if (input.status !== undefined && input.status !== "New" && !existing.ownerUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lead must be assigned an owner before changing its status" });
      }

      // Validate email format on update
      if (input.email && input.email.trim() && !isValidEmail(input.email)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must include @ and domain (e.g. name@example.com)" });
      }

      // Re-normalize if email/phone changed
      const updates: Record<string, unknown> = { ...data, updatedBy: ctx.userId };
      if (input.email !== undefined) updates.emailNormalized = normalizeEmail(input.email);
      if (input.phone !== undefined) updates.phoneNormalized = normalizePhone(input.phone);
      if (input.firstName) updates.firstName = normalizeName(input.firstName);
      if (input.lastName) updates.lastName = normalizeName(input.lastName);

      const lead = await ctx.db.lead.update({ where: { id }, data: updates });

      const existingRecord: Record<string, unknown> = { ...existing };
      const dataRecord: Record<string, unknown> = { ...data };
      const changes = diffChanges(existingRecord, dataRecord, ["firstName", "lastName", "email", "phone", "status", "source"]);
      if (changes.length > 0) {
        await logAudit(ctx.db, { orgId: existing.orgId, userId: ctx.userId, entityType: "Lead", entityId: id, action: "update", changes });
      }

      return lead;
    }),

  updateCustomField: scopedProcedure(["leads:edit"])
    .meta({ description: "Set a single custom field value on a lead" })
    .input(z.object({ id: z.string(), key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.lead.findUnique({ where: { id: input.id }, select: { customFields: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
      const current = (existing.customFields as Record<string, unknown>) ?? {};
      const updated = { ...current, [input.key]: input.value } as Prisma.InputJsonValue;
      await ctx.db.lead.update({ where: { id: input.id }, data: { customFields: updated, updatedBy: ctx.userId } });
      return { success: true };
    }),

  // ====== Assign (manager force-assign) ======
  assign: scopedProcedure(["leads:assign"])
    .meta({ description: "Assign a lead to a user (manager override)" })
    .input(z.object({ leadId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findUnique({ where: { id: input.leadId } });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      // Assign sets owner but does NOT change status
      const updated = await ctx.db.lead.update({
        where: { id: input.leadId },
        data: { ownerUserId: input.userId, updatedBy: ctx.userId },
      });

      // Bug 7: resolve user name for readable activity log
      const targetUser = await ctx.db.user.findUnique({ where: { id: input.userId }, select: { name: true, email: true } });
      const targetName = targetUser?.name ?? targetUser?.email ?? input.userId;

      await ctx.db.crmActivity.create({
        data: { orgId: lead.orgId, userId: ctx.userId, relatedObjectType: "Lead", relatedObjectId: input.leadId, activityType: "Assignment", notes: `Lead assigned to ${targetName}` },
      });

      return updated;
    }),

  // ====== Send back to pool (remove owner) ======
  sendToPool: scopedProcedure(["leads:assign"])
    .meta({ description: "Send a lead back to the pool by removing its owner" })
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findUnique({ where: { id: input.leadId } });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      if (TERMINAL_STATUSES.includes(lead.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send a terminal lead to the pool" });
      }

      const updated = await ctx.db.lead.update({
        where: { id: input.leadId },
        data: { ownerUserId: null, status: "New", updatedBy: ctx.userId },
      });

      await ctx.db.crmActivity.create({
        data: { orgId: lead.orgId, userId: ctx.userId, relatedObjectType: "Lead", relatedObjectId: input.leadId, activityType: "Assignment", notes: "Lead returned to pool" },
      });

      return updated;
    }),

  // ====== Qualify / Disqualify ======
  qualify: scopedProcedure([])
    .meta({ description: "Qualify a lead — must be in Working status" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.lead.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.status !== "Working") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot qualify a lead in "${existing.status}" status. Move to Working first.` });
      }
      if (!existing.ownerUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lead must be assigned an owner before qualifying" });
      }
      const lead = await ctx.db.lead.update({ where: { id: input.id }, data: { status: "Qualified" } });
      await logAudit(ctx.db, { orgId: lead.orgId, userId: ctx.userId, entityType: "Lead", entityId: input.id, action: "update", changes: [{ field: "status", oldValue: existing.status, newValue: "Qualified" }] });
      return lead;
    }),

  disqualify: scopedProcedure([])
    .meta({ description: "Disqualify a lead with a reason" })
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.lead.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (!existing.ownerUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lead must be assigned an owner before disqualifying" });
      }
      const lead = await ctx.db.lead.update({ where: { id: input.id }, data: { status: "Disqualified", disqualifyReason: input.reason || null } });
      await logAudit(ctx.db, { orgId: lead.orgId, userId: ctx.userId, entityType: "Lead", entityId: input.id, action: "update", changes: [{ field: "status", oldValue: existing.status, newValue: "Disqualified" }, { field: "disqualifyReason", oldValue: existing.disqualifyReason, newValue: input.reason || null }] });
      return lead;
    }),

  // ====== Convert (decoupled from opportunity creation — Feature 4) ======
  convert: scopedProcedure(["leads:convert"])
    .meta({ description: "Convert a lead into a Contact. Opportunity creation is optional." })
    .input(z.object({
      id: z.string(),
      opportunityName: z.string().optional(),
      opportunityAmount: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findUnique({ where: { id: input.id } });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
      if (lead.status === "Converted") throw new TRPCError({ code: "BAD_REQUEST", message: "Already converted" });
      // Bug 8: Must be Qualified before conversion
      if (lead.status !== "Qualified") throw new TRPCError({ code: "BAD_REQUEST", message: `Lead must be Qualified before conversion (current: ${lead.status})` });
      if (!lead.ownerUserId) throw new TRPCError({ code: "BAD_REQUEST", message: "Lead must have an owner before conversion" });

      const ownerUserId = lead.ownerUserId;

      // Bug 6: Wrap in transaction for all-or-nothing conversion
      const result = await ctx.db.$transaction(async (tx) => {
        // Bug 5: Copy preferredContactMethod + normalized fields to contact
        const contact = await tx.contact.create({
          data: {
            orgId: lead.orgId, ownerUserId,
            firstName: lead.firstName, lastName: lead.lastName,
            email: lead.email, phone: lead.phone,
            emailNormalized: lead.emailNormalized, phoneNormalized: lead.phoneNormalized,
            preferredContactMethod: lead.preferredContactMethod,
            campaignName: lead.campaignName,
            source: lead.source,
            // Lifecycle defaults on conversion
            lifecycleStage: "Prospect",
            engagementStatus: "Active",
            contactType: "Individual",
            // Lead origin snapshot
            originalLeadSource: lead.source,
            originalCampaign: lead.campaignName,
            leadCreatedDate: lead.createdAt.toISOString(),
            originalIntakeMode: lead.intakeMode,
            createdBy: ctx.userId, updatedBy: ctx.userId,
          },
        });

        let opportunity: Awaited<ReturnType<typeof tx.opportunity.create>> | null = null;
        if (input.opportunityName) {
          // Bug 7: Find and link the interest, carry campaign
          const firstInterest = await tx.interest.findFirst({
            where: { parentType: "Lead", parentId: input.id, status: "Active" },
            select: { id: true, budgetMax: true, source: true, campaignId: true },
          });

          opportunity = await tx.opportunity.create({
            data: {
              orgId: lead.orgId, leadId: input.id, ownerUserId,
              name: input.opportunityName, stage: "LeadQualified",
              amount: input.opportunityAmount ?? firstInterest?.budgetMax,
              source: lead.source, campaignName: lead.campaignName,
              interestId: firstInterest?.id || null,
              createdBy: ctx.userId, updatedBy: ctx.userId,
            },
          });

          // Mark the interest as Fulfilled
          if (firstInterest) {
            await tx.interest.update({ where: { id: firstInterest.id }, data: { status: "Fulfilled", opportunityId: opportunity.id } });
          }
        }

        // Re-point child records
        await tx.interest.updateMany({ where: { parentType: "Lead", parentId: input.id }, data: { parentType: "Contact", parentId: contact.id } });
        await tx.crmActivity.updateMany({ where: { relatedObjectType: "Lead", relatedObjectId: input.id }, data: { relatedObjectType: "Contact", relatedObjectId: contact.id } });
        await tx.internalComment.updateMany({ where: { relatedObjectType: "Lead", relatedObjectId: input.id }, data: { relatedObjectType: "Contact", relatedObjectId: contact.id } });

        // Bug 3: Link lead to the contact it became
        await tx.lead.update({ where: { id: input.id }, data: { status: "Converted", convertedContactId: contact.id } });
        await tx.crmActivity.create({ data: { orgId: lead.orgId, userId: ctx.userId, relatedObjectType: "Contact", relatedObjectId: contact.id, activityType: "Conversion", notes: `Converted from lead${opportunity ? ` — Opportunity: ${input.opportunityName}` : ""}` } });

        return { contact, opportunity };
      });

      await logAudit(ctx.db, { orgId: lead.orgId, userId: ctx.userId, entityType: "Lead", entityId: input.id, action: "update", changes: [{ field: "status", oldValue: lead.status, newValue: "Converted" }] });

      return result;
    }),

  delete: scopedProcedure(["leads:delete"])
    .meta({ description: "Delete a lead" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.lead.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ====== Bulk operations ======
  bulkDelete: scopedProcedure(["leads:delete"])
    .meta({ description: "Delete multiple leads" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const result = await ctx.db.lead.deleteMany({ where: { id: { in: input.ids } } });
      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", action: "bulk_delete", changes: [{ field: "count", oldValue: null, newValue: String(result.count) }] });
      return { deleted: result.count };
    }),

  // Bug 6 fix: validate status transitions, reject terminal leads
  bulkUpdateStatus: scopedProcedure(["leads:edit"])
    .meta({ description: "Update status of multiple leads (skips terminal and, when moving off New, unowned leads)" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const where: Record<string, unknown> = { id: { in: input.ids }, status: { notIn: TERMINAL_STATUSES } };
      if (input.status !== "New") where.ownerUserId = { not: null };
      const result = await ctx.db.lead.updateMany({
        where,
        data: { status: input.status },
      });
      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", action: "bulk_update", changes: [{ field: "status", oldValue: null, newValue: input.status }] });
      return { updated: result.count };
    }),

  // Feature 3: Bulk qualify
  bulkQualify: scopedProcedure(["leads:edit"])
    .meta({ description: "Qualify multiple leads at once (skips unowned leads)" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const result = await ctx.db.lead.updateMany({
        where: { id: { in: input.ids }, status: { notIn: TERMINAL_STATUSES }, ownerUserId: { not: null } },
        data: { status: "Qualified" },
      });
      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", action: "bulk_qualify", changes: [{ field: "status", oldValue: null, newValue: "Qualified" }] });
      return { qualified: result.count };
    }),

  bulkUpdateSource: scopedProcedure(["leads:edit"])
    .meta({ description: "Update source of multiple leads" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100), source: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const result = await ctx.db.lead.updateMany({ where: { id: { in: input.ids } }, data: { source: input.source, updatedBy: ctx.userId } });
      return { updated: result.count };
    }),

  bulkAssign: scopedProcedure(["leads:assign"])
    .meta({ description: "Assign multiple leads to an agent" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const result = await ctx.db.lead.updateMany({ where: { id: { in: input.ids } }, data: { ownerUserId: input.userId, updatedBy: ctx.userId } });
      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Lead", action: "bulk_assign", changes: [{ field: "ownerUserId", oldValue: null, newValue: input.userId }] });
      return { assigned: result.count };
    }),

  bulkSendMessage: scopedProcedure(["communications:send"])
    .meta({ description: "Send a message to multiple leads" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100), channel: z.enum(["SMS", "Email"]), subject: z.string().optional(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      const leads = await ctx.db.lead.findMany({ where: { id: { in: input.ids } }, select: { id: true, email: true, phone: true, firstName: true } });
      let sent = 0;
      for (const lead of leads) {
        const address = input.channel === "Email" ? lead.email : lead.phone;
        if (!address) continue;
        await ctx.db.communicationMessage.create({ data: { orgId, leadId: lead.id, senderUserId: ctx.userId, channel: input.channel, direction: "outbound", recipientAddress: address, subject: input.subject || null, body: input.body.replace(/\{\{firstName\}\}/g, lead.firstName), status: "queued" } });
        sent++;
      }
      return { sent, skipped: leads.length - sent };
    }),
});
