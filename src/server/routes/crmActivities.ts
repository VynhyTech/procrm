import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { requireActiveOrg } from "../lib/auditHelper";

export const crmActivitiesRouter = router({
  getForObject: scopedProcedure([])
    .meta({ description: "Get activity timeline for a CRM object" })
    .input(z.object({
      objectType: z.string(),
      objectId: z.string(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.crmActivity.findMany({
        where: {
          relatedObjectType: input.objectType,
          relatedObjectId: input.objectId,
        },
        include: { user: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  // Unified timeline: activities + communication messages merged by date
  getUnifiedTimeline: scopedProcedure([])
    .meta({ description: "Get unified timeline combining activities and communications for a record" })
    .input(z.object({ objectType: z.string(), objectId: z.string(), limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const [activities, messages, tasks] = await Promise.all([
        // Status changes are tracked in audit history, not the activity timeline
        ctx.db.crmActivity.findMany({
          where: { relatedObjectType: input.objectType, relatedObjectId: input.objectId, activityType: { not: "StatusChange" } },
          include: { user: { select: { id: true, name: true, email: true, picture: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
        // For leads, also fetch communication messages
        input.objectType === "Lead" ? ctx.db.communicationMessage.findMany({
          where: { leadId: input.objectId },
          include: { sender: { select: { id: true, name: true, email: true, picture: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }) : Promise.resolve([]),
        ctx.db.crmTask.findMany({
          where: { relatedObjectType: input.objectType, relatedObjectId: input.objectId },
          include: { owner: { select: { id: true, name: true, email: true, picture: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);

      // Merge into unified timeline
      const timeline: Array<{ id: string; type: string; subType: string; description: string; user: { id: string; name: string | null; email: string | null; picture: string | null }; createdAt: Date | string }> = [];

      for (const a of activities) {
        timeline.push({ id: a.id, type: "activity", subType: a.activityType, description: a.notes ?? a.activityType, user: a.user, createdAt: a.createdAt });
      }

      for (const m of messages) {
        const desc = `${m.channel} ${m.direction}: ${m.subject ? m.subject + " — " : ""}${m.body.slice(0, 80)}${m.body.length > 80 ? "..." : ""}`;
        timeline.push({ id: m.id, type: "message", subType: m.channel, description: desc, user: m.sender, createdAt: m.createdAt });
      }

      for (const t of tasks) {
        const due = t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : "";
        timeline.push({ id: t.id, type: "task", subType: "Task", description: `Task created: ${t.subject}${due}`, user: t.owner, createdAt: t.createdAt });
      }

      // Sort by date descending
      timeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return timeline.slice(0, input.limit);
    }),

  create: scopedProcedure([])
    .meta({ description: "Log a manual activity (note, call, email, meeting)" })
    .input(z.object({
      relatedObjectType: z.string(),
      relatedObjectId: z.string(),
      activityType: z.enum(["Note", "Call", "Email", "Meeting"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.crmActivity.create({
        data: {
          orgId: orgId,
          userId: ctx.userId,
          relatedObjectType: input.relatedObjectType,
          relatedObjectId: input.relatedObjectId,
          activityType: input.activityType,
          notes: input.notes || null,
        },
      });
    }),
});
