import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { logAudit, requireActiveOrg } from "../lib/auditHelper";
import { resolveUserIds, userDisplay } from "../lib/resolveUsers";
import { normalizeEmail, normalizePhone, isValidEmail } from "../lib/dataCleaner";

export const contactsRouter = router({
  getAll: scopedProcedure(["contacts:viewAll"])
    .meta({ description: "Get all contacts in the organization" })
    .input(z.object({
      search: z.string().optional(),
      lifecycleStage: z.string().optional(),
      engagementStatus: z.string().optional(),
      contactType: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const where: Record<string, unknown> = { orgId };
      if (input.lifecycleStage) where.lifecycleStage = input.lifecycleStage;
      if (input.engagementStatus) where.engagementStatus = input.engagementStatus;
      if (input.contactType) where.contactType = input.contactType;
      if (input.search) {
        where.OR = [
          { firstName: { contains: input.search } },
          { lastName: { contains: input.search } },
          { email: { contains: input.search } },
        ];
      }

      const [contacts, total] = await Promise.all([
        ctx.db.contact.findMany({
          where,
          include: { owner: { select: { id: true, name: true, email: true, picture: true } } },
          omit: { customFields: true },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.db.contact.count({ where }),
      ]);

      const userMap = await resolveUserIds(ctx.db, contacts.flatMap((c) => [c.createdBy, c.updatedBy]));
      return {
        contacts: contacts.map((c) => ({ ...c, createdByName: userDisplay(userMap, c.createdBy), updatedByName: userDisplay(userMap, c.updatedBy) })),
        total,
      };
    }),

  getById: scopedProcedure([])
    .meta({ description: "Get a contact by ID with opportunity roles and activities" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const contact = await ctx.db.contact.findUnique({
        where: { id: input.id },
        include: {
          owner: { select: { id: true, name: true, email: true, picture: true } },
          opportunityRoles: {
            include: { opportunity: { select: { id: true, name: true, stage: true, amount: true } } },
          },
        },
      });
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });

      // Resolve createdBy
      let createdByUser: { name: string | null; email: string | null } | null = null;
      if (contact.createdBy) {
        createdByUser = await ctx.db.user.findUnique({ where: { id: contact.createdBy }, select: { name: true, email: true } });
      }

      return { ...contact, createdByUser, customFields: contact.customFields as Record<string, unknown> | null };
    }),

  create: scopedProcedure(["contacts:edit"])
    .meta({ description: "Create a new contact with duplicate check" })
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().optional(),
      phone: z.string().optional(),
      secondaryEmail: z.string().optional(),
      secondaryPhone: z.string().optional(),
      preferredContactMethod: z.string().optional(),
      lifecycleStage: z.string().default("Prospect"),
      engagementStatus: z.string().default("Active"),
      contactType: z.string().default("Individual"),
      streetAddress: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      source: z.string().optional(),
      campaignName: z.string().optional(),
      importantDates: z.string().optional(),
      householdContext: z.string().optional(),
      notes: z.string().optional(),
      marketingConsent: z.string().optional(),
      title: z.string().optional(),
      department: z.string().optional(),
      ownerUserId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      // Validate email format if provided
      if (input.email && !isValidEmail(input.email)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must include @ and domain (e.g. name@example.com)" });
      }
      if (input.secondaryEmail && !isValidEmail(input.secondaryEmail)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must include @ and domain (e.g. name@example.com)" });
      }

      // Validate: need email or phone
      if (!input.email && !input.phone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Email or phone is required" });
      }

      const emailNorm = normalizeEmail(input.email);
      const phoneNorm = normalizePhone(input.phone);

      // Duplicate check against existing contacts
      if (emailNorm || phoneNorm) {
        const orConditions: Array<Record<string, unknown>> = [];
        if (emailNorm) orConditions.push({ emailNormalized: emailNorm });
        if (phoneNorm) orConditions.push({ phoneNormalized: phoneNorm });

        const existingContact = await ctx.db.contact.findFirst({
          where: { orgId, OR: orConditions },
          select: { id: true, firstName: true, lastName: true },
        });

        if (existingContact) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A contact with matching email or phone already exists: ${existingContact.firstName} ${existingContact.lastName} (${existingContact.id})`,
          });
        }
      }

      const contact = await ctx.db.contact.create({
        data: {
          orgId,
          ownerUserId: input.ownerUserId ?? ctx.userId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          secondaryEmail: input.secondaryEmail || null,
          secondaryPhone: input.secondaryPhone || null,
          emailNormalized: emailNorm,
          phoneNormalized: phoneNorm,
          preferredContactMethod: input.preferredContactMethod || null,
          lifecycleStage: input.lifecycleStage,
          engagementStatus: input.engagementStatus,
          contactType: input.contactType,
          streetAddress: input.streetAddress || null,
          city: input.city || null,
          state: input.state || null,
          postalCode: input.postalCode || null,
          source: input.source || null,
          campaignName: input.campaignName || null,
          importantDates: input.importantDates || null,
          householdContext: input.householdContext || null,
          notes: input.notes || null,
          marketingConsent: input.marketingConsent || null,
          title: input.title || null,
          department: input.department || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Contact", entityId: contact.id, action: "create" });
      return contact;
    }),

  clone: scopedProcedure(["contacts:edit"])
    .meta({ description: "Clone a contact into a new contact, optionally overriding some fields" })
    .input(z.object({
      id: z.string(),
      overrides: z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        secondaryEmail: z.string().optional().nullable(),
        secondaryPhone: z.string().optional().nullable(),
        preferredContactMethod: z.string().optional().nullable(),
        lifecycleStage: z.string().optional(),
        engagementStatus: z.string().optional(),
        contactType: z.string().optional(),
        streetAddress: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        postalCode: z.string().optional().nullable(),
        source: z.string().optional().nullable(),
        campaignName: z.string().optional().nullable(),
        importantDates: z.string().optional().nullable(),
        householdContext: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        marketingConsent: z.string().optional().nullable(),
        title: z.string().optional().nullable(),
        department: z.string().optional().nullable(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.contact.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const o = input.overrides;
      const email = o?.email !== undefined ? o.email : existing.email;
      const phone = o?.phone !== undefined ? o.phone : existing.phone;
      const pick = <K extends keyof NonNullable<typeof o>>(key: K) => (o?.[key] !== undefined ? o[key] : existing[key]);

      const contact = await ctx.db.contact.create({
        data: {
          orgId,
          ownerUserId: existing.ownerUserId,
          firstName: o?.firstName ?? existing.firstName,
          lastName: o?.lastName ?? existing.lastName,
          email,
          phone,
          secondaryEmail: pick("secondaryEmail"),
          secondaryPhone: pick("secondaryPhone"),
          emailNormalized: o?.email !== undefined ? normalizeEmail(email) : existing.emailNormalized,
          phoneNormalized: o?.phone !== undefined ? normalizePhone(phone) : existing.phoneNormalized,
          preferredContactMethod: pick("preferredContactMethod"),
          lifecycleStage: pick("lifecycleStage"),
          engagementStatus: pick("engagementStatus"),
          contactType: pick("contactType"),
          streetAddress: pick("streetAddress"),
          city: pick("city"),
          state: pick("state"),
          postalCode: pick("postalCode"),
          source: pick("source"),
          campaignName: pick("campaignName"),
          importantDates: pick("importantDates"),
          householdContext: pick("householdContext"),
          notes: pick("notes"),
          marketingConsent: pick("marketingConsent"),
          title: pick("title"),
          department: pick("department"),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      await logAudit(ctx.db, { orgId, userId: ctx.userId, entityType: "Contact", entityId: contact.id, action: "create", changes: [{ field: "clonedFrom", oldValue: null, newValue: input.id }] });
      return contact;
    }),

  update: scopedProcedure(["contacts:edit"])
    .meta({ description: "Update a contact" })
    .input(z.object({
      id: z.string(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      secondaryEmail: z.string().optional().nullable(),
      secondaryPhone: z.string().optional().nullable(),
      preferredContactMethod: z.string().optional().nullable(),
      lifecycleStage: z.string().optional(),
      engagementStatus: z.string().optional(),
      contactType: z.string().optional(),
      streetAddress: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      postalCode: z.string().optional().nullable(),
      source: z.string().optional().nullable(),
      campaignName: z.string().optional().nullable(),
      importantDates: z.string().optional().nullable(),
      householdContext: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      marketingConsent: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      department: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.contact.findUnique({ where: { id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Track high-value changes for audit
      const auditFields = ["engagementStatus", "ownerUserId", "lifecycleStage", "email", "phone"];
      const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
      for (const field of auditFields) {
        const newVal = (data as Record<string, unknown>)[field];
        if (newVal !== undefined) {
          const oldVal = (existing as Record<string, unknown>)[field];
          if (String(newVal) !== String(oldVal)) {
            changes.push({ field, oldValue: oldVal ? String(oldVal) : null, newValue: newVal ? String(newVal) : null });
          }
        }
      }

      // Validate email format on update
      if (input.email && !isValidEmail(input.email)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must include @ and domain (e.g. name@example.com)" });
      }
      if (input.secondaryEmail && !isValidEmail(input.secondaryEmail)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must include @ and domain (e.g. name@example.com)" });
      }

      const updates: Record<string, unknown> = { ...data, updatedBy: ctx.userId };
      if (input.email !== undefined) updates.emailNormalized = normalizeEmail(input.email);
      if (input.phone !== undefined) updates.phoneNormalized = normalizePhone(input.phone);

      const contact = await ctx.db.contact.update({ where: { id }, data: updates });

      if (changes.length > 0) {
        await logAudit(ctx.db, { orgId: contact.orgId, userId: ctx.userId, entityType: "Contact", entityId: id, action: "update", changes });
      }

      return contact;
    }),

  updateCustomField: scopedProcedure(["contacts:edit"])
    .meta({ description: "Set a single custom field value on a contact" })
    .input(z.object({ id: z.string(), key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.contact.findUnique({ where: { id: input.id }, select: { customFields: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      const current = (existing.customFields as Record<string, unknown>) ?? {};
      const updated = { ...current, [input.key]: input.value } as Prisma.InputJsonValue;
      await ctx.db.contact.update({ where: { id: input.id }, data: { customFields: updated, updatedBy: ctx.userId } });
      return { success: true };
    }),

  assign: scopedProcedure(["leads:assign"])
    .meta({ description: "Reassign a contact to another agent" })
    .input(z.object({ contactId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.db.contact.findUnique({ where: { id: input.contactId } });
      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });

      const targetUser = await ctx.db.user.findUnique({ where: { id: input.userId }, select: { name: true, email: true } });
      const targetName = targetUser?.name ?? targetUser?.email ?? input.userId;

      const updated = await ctx.db.contact.update({
        where: { id: input.contactId },
        data: { ownerUserId: input.userId, updatedBy: ctx.userId },
      });

      await ctx.db.crmActivity.create({
        data: { orgId: contact.orgId, userId: ctx.userId, relatedObjectType: "Contact", relatedObjectId: input.contactId, activityType: "Assignment", notes: `Contact reassigned to ${targetName}` },
      });

      await logAudit(ctx.db, { orgId: contact.orgId, userId: ctx.userId, entityType: "Contact", entityId: input.contactId, action: "update",
        changes: [{ field: "ownerUserId", oldValue: contact.ownerUserId, newValue: input.userId }] });

      return updated;
    }),

  delete: scopedProcedure(["contacts:delete"])
    .meta({ description: "Delete a contact" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.contact.delete({ where: { id: input.id } });
      return { success: true };
    }),

  bulkDelete: scopedProcedure(["contacts:delete"])
    .meta({ description: "Delete multiple contacts at once" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.contact.deleteMany({ where: { id: { in: input.ids } } });
      return { deleted: result.count };
    }),
});
