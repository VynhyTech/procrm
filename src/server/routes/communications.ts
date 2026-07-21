import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { logAudit, requireActiveOrg } from "../lib/auditHelper";

export const communicationsRouter = router({
  sendMessage: scopedProcedure(["communications:send"])
    .meta({ description: "Send an SMS, Email, or Chat message to a lead" })
    .input(z.object({
      leadId: z.string(),
      channel: z.enum(["SMS", "Email", "Chat"]),
      recipientAddress: z.string().min(1),
      subject: z.string().optional(),
      body: z.string().min(1),
      templateId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      const lead = await ctx.db.lead.findUnique({ where: { id: input.leadId } });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

      const message = await ctx.db.communicationMessage.create({
        data: {
          orgId: orgId,
          leadId: input.leadId,
          senderUserId: ctx.userId,
          channel: input.channel,
          direction: "outbound",
          recipientAddress: input.recipientAddress,
          subject: input.subject || null,
          body: input.body,
          status: "queued",
          templateId: input.templateId || null,
        },
      });

      // Log as activity on the lead
      await ctx.db.crmActivity.create({
        data: {
          orgId: orgId,
          userId: ctx.userId,
          relatedObjectType: "Lead",
          relatedObjectId: input.leadId,
          activityType: input.channel === "Email" ? "Email" : input.channel === "SMS" ? "SMS" : "Note",
          notes: `${input.channel} sent: ${input.subject ? input.subject + " — " : ""}${input.body.slice(0, 100)}`,
        },
      });

      await logAudit(ctx.db, {
        orgId: orgId,
        userId: ctx.userId,
        entityType: "CommunicationMessage",
        entityId: message.id,
        action: "create",
        changes: [{ field: "channel", oldValue: null, newValue: input.channel }],
      });

      return message;
    }),

  getMessages: scopedProcedure([])
    .meta({ description: "Get message history for a lead" })
    .input(z.object({
      leadId: z.string(),
      channel: z.enum(["SMS", "Email", "Chat", "All"]).default("All"),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { leadId: input.leadId };
      if (input.channel !== "All") where.channel = input.channel;

      return ctx.db.communicationMessage.findMany({
        where,
        include: { sender: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  getMessageStats: scopedProcedure([])
    .meta({ description: "Get message counts per channel for a lead" })
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [sms, email, chat, total] = await Promise.all([
        ctx.db.communicationMessage.count({ where: { leadId: input.leadId, channel: "SMS" } }),
        ctx.db.communicationMessage.count({ where: { leadId: input.leadId, channel: "Email" } }),
        ctx.db.communicationMessage.count({ where: { leadId: input.leadId, channel: "Chat" } }),
        ctx.db.communicationMessage.count({ where: { leadId: input.leadId } }),
      ]);
      return { sms, email, chat, total };
    }),

  // ===== Templates =====

  getTemplates: scopedProcedure([])
    .meta({ description: "List message templates for the organization" })
    .input(z.object({
      channel: z.enum(["SMS", "Email"]).optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";

      const where: Record<string, unknown> = { orgId, isActive: true };
      if (input.channel) where.channel = input.channel;
      if (input.category) where.category = input.category;

      return ctx.db.messageTemplate.findMany({
        where,
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });
    }),

  createTemplate: scopedProcedure(["communications:templates"])
    .meta({ description: "Create a new message template" })
    .input(z.object({
      name: z.string().min(1),
      channel: z.enum(["SMS", "Email"]),
      subject: z.string().optional(),
      body: z.string().min(1),
      category: z.string().default("General"),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.messageTemplate.create({
        data: {
          orgId: orgId,
          name: input.name,
          channel: input.channel,
          subject: input.subject || null,
          body: input.body,
          category: input.category,
        },
      });
    }),

  updateTemplate: scopedProcedure(["communications:templates"])
    .meta({ description: "Update a message template" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      subject: z.string().optional().nullable(),
      body: z.string().min(1).optional(),
      category: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.messageTemplate.update({ where: { id }, data });
    }),

  deleteTemplate: scopedProcedure(["communications:templates"])
    .meta({ description: "Delete a message template" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.messageTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
