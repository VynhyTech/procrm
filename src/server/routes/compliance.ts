import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { logAudit, requireActiveOrg } from "../lib/auditHelper";

export const complianceRouter = router({
  // ========= DELETION REQUESTS (GDPR Right to Erasure) =========

  getDeletionRequests: scopedProcedure(["compliance:manage"])
    .meta({ description: "List GDPR deletion requests" })
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      return ctx.db.deletionRequest.findMany({
        where: { orgId: orgId },
        include: { requester: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  createDeletionRequest: scopedProcedure(["compliance:manage"])
    .meta({ description: "Create a GDPR data deletion request" })
    .input(z.object({
      subjectEmail: z.string().email(),
      subjectName: z.string().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const request = await ctx.db.deletionRequest.create({
        data: {
          orgId: orgId,
          requestedBy: ctx.userId,
          subjectEmail: input.subjectEmail,
          subjectName: input.subjectName || null,
          reason: input.reason || null,
          status: "pending",
        },
      });

      await logAudit(ctx.db, {
        orgId: orgId,
        userId: ctx.userId,
        entityType: "DeletionRequest",
        entityId: request.id,
        action: "create",
      });

      return request;
    }),

  previewDeletionImpact: scopedProcedure(["compliance:manage"])
    .meta({ description: "Preview the impact of processing a deletion request before executing" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const request = await ctx.db.deletionRequest.findUnique({ where: { id: input.id } });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });

      const [leads, contacts, messages, activities, comments] = await Promise.all([
        ctx.db.lead.count({ where: { orgId: request.orgId, email: request.subjectEmail } }),
        ctx.db.contact.count({ where: { orgId: request.orgId, email: request.subjectEmail } }),
        ctx.db.communicationMessage.count({
          where: { orgId: request.orgId, lead: { email: request.subjectEmail } },
        }),
        ctx.db.crmActivity.count({
          where: { orgId: request.orgId, relatedObjectType: "Lead", relatedObjectId: { in: (await ctx.db.lead.findMany({ where: { orgId: request.orgId, email: request.subjectEmail }, select: { id: true } })).map((l) => l.id) } },
        }),
        ctx.db.internalComment.count({
          where: { orgId: request.orgId, relatedObjectType: "Lead", relatedObjectId: { in: (await ctx.db.lead.findMany({ where: { orgId: request.orgId, email: request.subjectEmail }, select: { id: true } })).map((l) => l.id) } },
        }),
      ]);

      return { leads, contacts, messages, activities, comments, total: leads + contacts + messages + activities + comments };
    }),

  processDeletionRequest: scopedProcedure(["compliance:manage"])
    .meta({ description: "Process a GDPR deletion request — removes matching data" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.deletionRequest.findUnique({ where: { id: input.id } });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.deletionRequest.update({
        where: { id: input.id },
        data: { status: "processing" },
      });

      // Find matching leads and contacts first
      const matchingLeads = await ctx.db.lead.findMany({
        where: { orgId: request.orgId, email: request.subjectEmail },
        select: { id: true },
      });
      const matchingContacts = await ctx.db.contact.findMany({
        where: { orgId: request.orgId, email: request.subjectEmail },
        select: { id: true },
      });
      const leadIds = matchingLeads.map((l) => l.id);
      const contactIds = matchingContacts.map((c) => c.id);

      // Delete related records first (cascade)
      if (leadIds.length > 0) {
        await ctx.db.communicationMessage.deleteMany({ where: { leadId: { in: leadIds } } });
        await ctx.db.crmActivity.deleteMany({ where: { relatedObjectType: "Lead", relatedObjectId: { in: leadIds } } });
        await ctx.db.crmTask.deleteMany({ where: { relatedObjectType: "Lead", relatedObjectId: { in: leadIds } } });
        await ctx.db.internalComment.deleteMany({ where: { relatedObjectType: "Lead", relatedObjectId: { in: leadIds } } });
      }
      if (contactIds.length > 0) {
        await ctx.db.opportunityContactRole.deleteMany({ where: { contactId: { in: contactIds } } });
        await ctx.db.crmActivity.deleteMany({ where: { relatedObjectType: "Contact", relatedObjectId: { in: contactIds } } });
        await ctx.db.internalComment.deleteMany({ where: { relatedObjectType: "Contact", relatedObjectId: { in: contactIds } } });
      }

      // Delete the leads and contacts
      const deletedLeads = await ctx.db.lead.deleteMany({ where: { id: { in: leadIds } } });
      const deletedContacts = await ctx.db.contact.deleteMany({ where: { id: { in: contactIds } } });

      await ctx.db.deletionRequest.update({
        where: { id: input.id },
        data: { status: "completed", completedAt: new Date() },
      });

      await logAudit(ctx.db, {
        orgId: request.orgId,
        userId: ctx.userId,
        entityType: "DeletionRequest",
        entityId: input.id,
        action: "deletion_request",
        changes: [
          { field: "leadsDeleted", oldValue: null, newValue: String(deletedLeads.count) },
          { field: "contactsDeleted", oldValue: null, newValue: String(deletedContacts.count) },
          { field: "relatedRecordsCleaned", oldValue: null, newValue: "messages,activities,tasks,comments,contactRoles" },
        ],
      });

      return { leadsDeleted: deletedLeads.count, contactsDeleted: deletedContacts.count };
    }),

  rejectDeletionRequest: scopedProcedure(["compliance:manage"])
    .meta({ description: "Reject a GDPR deletion request" })
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.deletionRequest.update({
        where: { id: input.id },
        data: { status: "rejected" },
      });
    }),

  // ========= DATA EXPORT (GDPR Right to Access) =========

  exportUserData: scopedProcedure(["compliance:manage"])
    .meta({ description: "Export all data for a given email (GDPR data access request)" })
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const orgFilter = { orgId: orgId };

      const [leads, contacts, activities] = await Promise.all([
        ctx.db.lead.findMany({ where: { ...orgFilter, email: input.email } }),
        ctx.db.contact.findMany({ where: { ...orgFilter, email: input.email } }),
        ctx.db.crmActivity.findMany({
          where: { ...orgFilter, relatedObjectType: "Lead", relatedObjectId: { in: (await ctx.db.lead.findMany({ where: { ...orgFilter, email: input.email }, select: { id: true } })).map((l) => l.id) } },
        }),
      ]);

      await logAudit(ctx.db, {
        orgId: orgId,
        userId: ctx.userId,
        entityType: "DataExport",
        action: "export",
        changes: [{ field: "email", oldValue: null, newValue: input.email }],
      });

      return { leads, contacts, activities, exportedAt: new Date().toISOString() };
    }),

  // ========= DATA RETENTION POLICIES =========

  getRetentionPolicies: scopedProcedure(["compliance:manage"])
    .meta({ description: "Get data retention policies for the organization" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      return ctx.db.dataRetentionPolicy.findMany({
        where: { orgId: orgId },
        orderBy: { entityType: "asc" },
      });
    }),

  upsertRetentionPolicy: scopedProcedure(["compliance:manage"])
    .meta({ description: "Create or update a data retention policy" })
    .input(z.object({
      entityType: z.string(),
      retentionDays: z.number().min(30).max(3650),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.dataRetentionPolicy.upsert({
        where: { orgId_entityType: { orgId: orgId, entityType: input.entityType } },
        create: {
          orgId: orgId,
          entityType: input.entityType,
          retentionDays: input.retentionDays,
          isActive: input.isActive,
        },
        update: {
          retentionDays: input.retentionDays,
          isActive: input.isActive,
        },
      });
    }),

  enforceRetention: scopedProcedure(["compliance:manage"])
    .meta({ description: "Enforce data retention policies — delete records older than the configured retention period" })
    .mutation(async ({ ctx }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const policies = await ctx.db.dataRetentionPolicy.findMany({
        where: { orgId, isActive: true },
      });

      const results: Array<{ entityType: string; deleted: number }> = [];

      for (const policy of policies) {
        const cutoffDate = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);

        let deleted = 0;
        if (policy.entityType === "Lead") {
          const result = await ctx.db.lead.deleteMany({ where: { orgId, createdAt: { lt: cutoffDate } } });
          deleted = result.count;
        } else if (policy.entityType === "Contact") {
          const result = await ctx.db.contact.deleteMany({ where: { orgId, createdAt: { lt: cutoffDate } } });
          deleted = result.count;
        } else if (policy.entityType === "Opportunity") {
          const result = await ctx.db.opportunity.deleteMany({ where: { orgId, createdAt: { lt: cutoffDate } } });
          deleted = result.count;
        } else if (policy.entityType === "AuditLog") {
          const result = await ctx.db.auditLog.deleteMany({ where: { orgId, createdAt: { lt: cutoffDate } } });
          deleted = result.count;
        }

        if (deleted > 0) {
          results.push({ entityType: policy.entityType, deleted });
          await logAudit(ctx.db, {
            orgId, userId: ctx.userId, entityType: "DataRetentionPolicy", action: "enforce",
            changes: [{ field: policy.entityType, oldValue: null, newValue: `${deleted} records deleted (older than ${policy.retentionDays} days)` }],
          });
        }
      }

      return { enforced: results, policiesChecked: policies.length };
    }),
});
