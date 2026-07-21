import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { requireActiveOrg } from "../lib/auditHelper";
import { ENTITY_FIELDS, buildWhereFromFilters, executeEntityQuery, computeGroupByChartData } from "../lib/reportQuery";

const reportConfigSchema = z.object({
  fields: z.array(z.string()),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(["equals", "contains", "gt", "lt", "between", "in"]),
    value: z.string(),
  })),
  chartType: z.enum(["table", "bar", "line", "pie", "doughnut"]),
  groupBy: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  aggregation: z.enum(["count", "sum", "avg"]).optional(),
});

export const reportsRouter = router({
  getEntityFields: scopedProcedure([])
    .meta({ description: "Get available fields for a report entity type" })
    .input(z.object({ entityType: z.string() }))
    .query(({ input }) => {
      const fields = ENTITY_FIELDS[input.entityType];
      if (!fields) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid entity type" });
      return { entityType: input.entityType, fields };
    }),

  list: scopedProcedure([])
    .meta({ description: "List saved reports" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      return ctx.db.reportDefinition.findMany({
        where: {
          orgId: orgId,
          OR: [{ creatorId: ctx.userId }, { isShared: true }],
        },
        include: { creator: { select: { id: true, name: true, email: true } } },
        orderBy: { updatedAt: "desc" },
      });
    }),

  getById: scopedProcedure([])
    .meta({ description: "Get a report definition by ID" })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.db.reportDefinition.findUnique({
        where: { id: input.id },
        include: { creator: { select: { id: true, name: true, email: true } } },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      return report;
    }),

  create: scopedProcedure(["reports:edit"])
    .meta({ description: "Create a new report definition" })
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      entityType: z.string(),
      config: reportConfigSchema,
      isShared: z.boolean().default(false),
      folderId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.reportDefinition.create({
        data: {
          orgId: orgId,
          creatorId: ctx.userId,
          name: input.name,
          description: input.description || null,
          entityType: input.entityType,
          config: JSON.stringify(input.config),
          isShared: input.isShared,
          folderId: input.folderId || null,
        },
      });
    }),

  update: scopedProcedure(["reports:edit"])
    .meta({ description: "Update a report definition" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      config: reportConfigSchema.optional(),
      isShared: z.boolean().optional(),
      folderId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, config, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (config) data.config = JSON.stringify(config);
      return ctx.db.reportDefinition.update({ where: { id }, data });
    }),

  delete: scopedProcedure(["reports:edit"])
    .meta({ description: "Delete a report definition" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.reportDefinition.delete({ where: { id: input.id } });
      return { success: true };
    }),

  listFolders: scopedProcedure([])
    .meta({ description: "List report folders" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      const myTeamIds = (await ctx.db.teamMember.findMany({
        where: { userId: ctx.userId },
        select: { teamId: true },
      })).map((t) => t.teamId);

      const folders = await ctx.db.reportFolder.findMany({
        where: {
          orgId,
          OR: [
            { creatorId: ctx.userId },
            { isShared: true },
            { shares: { some: { targetType: "user", targetId: ctx.userId } } },
            ...(myTeamIds.length ? [{ shares: { some: { targetType: "team" as const, targetId: { in: myTeamIds } } } }] : []),
          ],
        },
        include: { _count: { select: { reports: true, children: true } }, shares: true },
        orderBy: { name: "asc" },
      });

      const userIds = folders.flatMap((f) => f.shares.filter((s) => s.targetType === "user").map((s) => s.targetId));
      const teamIds = folders.flatMap((f) => f.shares.filter((s) => s.targetType === "team").map((s) => s.targetId));
      const [users, teams] = await Promise.all([
        ctx.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
        ctx.db.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
      ]);
      const userNames = new Map<string, string>(users.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]));
      const teamNames = new Map<string, string>(teams.map((t) => [t.id, t.name]));

      return folders.map((f) => ({
        ...f,
        shares: f.shares.map((s) => ({
          targetType: s.targetType,
          targetId: s.targetId,
          name: (s.targetType === "user" ? userNames.get(s.targetId) : teamNames.get(s.targetId)) ?? "Unknown",
        })),
      }));
    }),

  createFolder: scopedProcedure(["reports:edit"])
    .meta({ description: "Create a report folder" })
    .input(z.object({
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
      isShared: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);

      return ctx.db.reportFolder.create({
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
    .meta({ description: "Rename, move, or reshare a report folder" })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      isShared: z.boolean().optional(),
      parentId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.db.reportFolder.update({ where: { id }, data: rest });
    }),

  deleteFolder: scopedProcedure(["reports:edit"])
    .meta({ description: "Delete an empty report folder" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [reportCount, childCount] = await Promise.all([
        ctx.db.reportDefinition.count({ where: { folderId: input.id } }),
        ctx.db.reportFolder.count({ where: { parentId: input.id } }),
      ]);
      if (reportCount > 0 || childCount > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Folder is not empty" });
      }
      await ctx.db.reportFolderShare.deleteMany({ where: { folderId: input.id } });
      await ctx.db.reportFolder.delete({ where: { id: input.id } });
      return { success: true };
    }),

  shareFolder: scopedProcedure(["reports:edit"])
    .meta({ description: "Share a report folder with a specific person or team" })
    .input(z.object({
      folderId: z.string(),
      targetType: z.enum(["user", "team"]),
      targetId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.reportFolderShare.create({ data: input });
    }),

  unshareFolder: scopedProcedure(["reports:edit"])
    .meta({ description: "Remove a specific person or team's access to a report folder" })
    .input(z.object({
      folderId: z.string(),
      targetType: z.enum(["user", "team"]),
      targetId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.reportFolderShare.delete({
        where: { folderId_targetType_targetId: input },
      });
      return { success: true };
    }),

  execute: scopedProcedure([])
    .meta({ description: "Execute a report and return data" })
    .input(z.object({
      entityType: z.string(),
      config: reportConfigSchema,
    }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const { entityType, config } = input;

      const where = buildWhereFromFilters(orgId, config.filters);

      const orderBy: Record<string, string> = {};
      if (config.sortBy) {
        orderBy[config.sortBy] = config.sortOrder ?? "desc";
      } else {
        orderBy.createdAt = "desc";
      }

      const rows = await executeEntityQuery(ctx.db, entityType, where, orderBy);

      const chartData = config.groupBy ? computeGroupByChartData(rows, config.groupBy, config.aggregation) : null;

      return { rows, total: rows.length, chartData };
    }),
});
