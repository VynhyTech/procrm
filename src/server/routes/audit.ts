import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
// Reads only — no requireActiveOrg needed

export const auditRouter = router({
  getLogs: scopedProcedure(["audit:view"])
    .meta({ description: "Get audit logs with filters" })
    .input(z.object({
      entityType: z.string().optional(),
      action: z.string().optional(),
      userId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";

      const where: Record<string, unknown> = { orgId: orgId };
      if (input.entityType) where.entityType = input.entityType;
      if (input.action) where.action = input.action;
      if (input.userId) where.userId = input.userId;
      if (input.startDate || input.endDate) {
        const dateFilter: Record<string, unknown> = {};
        if (input.startDate) dateFilter.gte = new Date(input.startDate);
        if (input.endDate) dateFilter.lte = new Date(input.endDate + "T23:59:59");
        where.createdAt = dateFilter;
      }

      const [logs, total] = await Promise.all([
        ctx.db.auditLog.findMany({
          where,
          include: { user: { select: { id: true, name: true, email: true, picture: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.db.auditLog.count({ where }),
      ]);

      return { logs, total };
    }),

  getEntityHistory: scopedProcedure([])
    .meta({ description: "Get audit history for a specific entity" })
    .input(z.object({ entityType: z.string(), entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.auditLog.findMany({
        where: { entityType: input.entityType, entityId: input.entityId },
        include: { user: { select: { id: true, name: true, email: true, picture: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),

  getStats: scopedProcedure(["audit:view"])
    .meta({ description: "Get audit log statistics" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      const orgFilter = { orgId: orgId };
      const [totalLogs, recentLogs] = await Promise.all([
        ctx.db.auditLog.count({ where: orgFilter }),
        ctx.db.auditLog.count({
          where: { ...orgFilter, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ]);

      return { totalLogs, recentLogs };
    }),
});
