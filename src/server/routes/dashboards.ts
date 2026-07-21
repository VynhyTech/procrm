import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { requireActiveOrg } from "../lib/auditHelper";
import { buildWhereFromFilters, executeEntityQuery, computeGroupByChartData } from "../lib/reportQuery";

const dashboardFilterSchema = z.object({
  entityType: z.string(),
  field: z.string(),
  operator: z.enum(["equals", "contains", "gt", "lt", "between", "in"]),
  value: z.string(),
});

export const dashboardsRouter = router({
  // ===== Dashboards =====

  list: scopedProcedure([])
    .meta({ description: "List saved dashboards" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      return ctx.db.dashboard.findMany({
        where: { orgId, OR: [{ creatorId: ctx.userId }, { isShared: true }] },
        include: { creator: { select: { id: true, name: true, email: true } }, _count: { select: { widgets: true } } },
        orderBy: { updatedAt: "desc" },
      });
    }),

  getById: scopedProcedure([])
    .meta({ description: "Get a dashboard by ID, including its widgets" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const dashboard = await ctx.db.dashboard.findUnique({
        where: { id: input.id },
        include: {
          creator: { select: { id: true, name: true, email: true } },
          widgets: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!dashboard) throw new TRPCError({ code: "NOT_FOUND", message: "Dashboard not found" });
      return dashboard;
    }),

  create: scopedProcedure(["reports:edit"])
    .meta({ description: "Create a new dashboard" })
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      isShared: z.boolean().default(false),
      folderId: z.string().nullable().optional(),
      filters: z.array(dashboardFilterSchema).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.dashboard.create({
        data: {
          orgId,
          creatorId: ctx.userId,
          name: input.name,
          description: input.description || null,
          isShared: input.isShared,
          folderId: input.folderId || null,
          filters: JSON.stringify(input.filters),
        },
      });
    }),

  update: scopedProcedure(["reports:edit"])
    .meta({ description: "Update a dashboard" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      isShared: z.boolean().optional(),
      folderId: z.string().nullable().optional(),
      filters: z.array(dashboardFilterSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, filters, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (filters) data.filters = JSON.stringify(filters);
      return ctx.db.dashboard.update({ where: { id }, data });
    }),

  delete: scopedProcedure(["reports:edit"])
    .meta({ description: "Delete a dashboard" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.dashboardWidget.deleteMany({ where: { dashboardId: input.id } });
      await ctx.db.dashboard.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ===== Widgets =====

  addWidget: scopedProcedure(["reports:edit"])
    .meta({ description: "Add a widget to a dashboard" })
    .input(z.object({
      dashboardId: z.string(),
      entityType: z.string(),
      chartType: z.enum(["table", "bar", "line", "pie", "doughnut"]),
      groupBy: z.string().optional(),
      aggregation: z.enum(["count", "sum", "avg"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.db.dashboardWidget.count({ where: { dashboardId: input.dashboardId } });
      return ctx.db.dashboardWidget.create({
        data: { ...input, sortOrder: count },
      });
    }),

  removeWidget: scopedProcedure(["reports:edit"])
    .meta({ description: "Remove a widget from a dashboard" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.dashboardWidget.delete({ where: { id: input.id } });
      return { success: true };
    }),

  executeWidget: scopedProcedure([])
    .meta({ description: "Execute a dashboard widget's query, applying any matching dashboard-level filters" })
    .input(z.object({
      entityType: z.string(),
      groupBy: z.string().optional(),
      aggregation: z.enum(["count", "sum", "avg"]).optional(),
      dashboardFilters: z.array(dashboardFilterSchema).default([]),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const matchingFilters = input.dashboardFilters
        .filter((f) => f.entityType === input.entityType)
        .map((f) => ({ field: f.field, operator: f.operator, value: f.value }));

      const where = buildWhereFromFilters(orgId, matchingFilters);
      const rows = await executeEntityQuery(ctx.db, input.entityType, where, { createdAt: "desc" });
      const chartData = input.groupBy ? computeGroupByChartData(rows, input.groupBy, input.aggregation) : null;

      return { rows, total: rows.length, chartData };
    }),

  // ===== Folders =====

  listFolders: scopedProcedure([])
    .meta({ description: "List dashboard folders" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      return ctx.db.dashboardFolder.findMany({
        where: { orgId, OR: [{ creatorId: ctx.userId }, { isShared: true }] },
        include: { _count: { select: { dashboards: true, children: true } } },
        orderBy: { name: "asc" },
      });
    }),

  createFolder: scopedProcedure(["reports:edit"])
    .meta({ description: "Create a dashboard folder" })
    .input(z.object({
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
      isShared: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.dashboardFolder.create({
        data: {
          orgId,
          creatorId: ctx.userId,
          name: input.name,
          parentId: input.parentId || null,
          isShared: input.isShared,
        },
      });
    }),

  updateFolder: scopedProcedure(["reports:edit"])
    .meta({ description: "Rename, move, or reshare a dashboard folder" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      isShared: z.boolean().optional(),
      parentId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.db.dashboardFolder.update({ where: { id }, data: rest });
    }),

  deleteFolder: scopedProcedure(["reports:edit"])
    .meta({ description: "Delete an empty dashboard folder" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [dashboardCount, childCount] = await Promise.all([
        ctx.db.dashboard.count({ where: { folderId: input.id } }),
        ctx.db.dashboardFolder.count({ where: { parentId: input.id } }),
      ]);
      if (dashboardCount > 0 || childCount > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Folder is not empty" });
      }
      await ctx.db.dashboardFolder.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
