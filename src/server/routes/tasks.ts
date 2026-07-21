import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { requireActiveOrg } from "../lib/auditHelper";
import { resolveUserIds, userDisplay } from "../lib/resolveUsers";

export const tasksRouter = router({
  getMyTasks: scopedProcedure([])
    .meta({ description: "Get tasks assigned to the current user" })
    .input(z.object({
      status: z.string().optional(),
      priority: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { ownerUserId: ctx.userId };
      if (input.status) where.status = input.status;
      if (input.priority) where.priority = input.priority;

      const [tasks, total] = await Promise.all([
        ctx.db.crmTask.findMany({
          where,
          include: { owner: { select: { id: true, name: true, email: true, picture: true } } },
          orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
          take: input.limit,
          skip: input.offset,
        }),
        ctx.db.crmTask.count({ where }),
      ]);

      const userMap = await resolveUserIds(ctx.db, tasks.flatMap((t) => [t.createdBy, t.updatedBy]));
      return { tasks: tasks.map((t) => ({ ...t, createdByName: userDisplay(userMap, t.createdBy) })), total };
    }),

  getAllTasks: scopedProcedure(["tasks:viewAll"])
    .meta({ description: "Get all tasks in the organization" })
    .input(z.object({
      status: z.string().optional(),
      priority: z.string().optional(),
      ownerUserId: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";

      const where: Record<string, unknown> = { orgId };
      if (input.status) where.status = input.status;
      if (input.priority) where.priority = input.priority;
      if (input.ownerUserId) where.ownerUserId = input.ownerUserId;

      const [tasks, total] = await Promise.all([
        ctx.db.crmTask.findMany({
          where,
          include: { owner: { select: { id: true, name: true, email: true, picture: true } } },
          orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
          take: input.limit,
          skip: input.offset,
        }),
        ctx.db.crmTask.count({ where }),
      ]);

      const userMap = await resolveUserIds(ctx.db, tasks.flatMap((t) => [t.createdBy, t.updatedBy]));
      return { tasks: tasks.map((t) => ({ ...t, createdByName: userDisplay(userMap, t.createdBy) })), total };
    }),

  getForObject: scopedProcedure([])
    .meta({ description: "Get tasks related to a specific CRM object" })
    .input(z.object({
      objectType: z.string(),
      objectId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.crmTask.findMany({
        where: {
          relatedObjectType: input.objectType,
          relatedObjectId: input.objectId,
        },
        include: { owner: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      });
    }),

  create: scopedProcedure(["tasks:edit"])
    .meta({ description: "Create a new task" })
    .input(z.object({
      relatedObjectType: z.string(),
      relatedObjectId: z.string(),
      subject: z.string().min(1),
      description: z.string().optional(),
      dueDate: z.string().optional(),
      priority: z.string().default("Medium"),
      ownerUserId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.crmTask.create({
        data: {
          orgId: orgId,
          ownerUserId: input.ownerUserId ?? ctx.userId,
          relatedObjectType: input.relatedObjectType,
          relatedObjectId: input.relatedObjectId,
          subject: input.subject,
          description: input.description || null,
          dueDate: input.dueDate || null,
          priority: input.priority,
          status: "Open",
        },
      });
    }),

  update: scopedProcedure(["tasks:edit"])
    .meta({ description: "Update a task" })
    .input(z.object({
      id: z.string(),
      subject: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      dueDate: z.string().optional().nullable(),
      priority: z.string().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.crmTask.update({ where: { id }, data });
    }),

  delete: scopedProcedure(["tasks:edit"])
    .meta({ description: "Delete a task" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.crmTask.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
