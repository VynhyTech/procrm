import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, scopedProcedure } from "../trpc";
import { requireActiveOrg } from "../lib/auditHelper";

// Matches the org-admin scope gate already used for Settings (src/web/App.tsx's ADMIN_SCOPES).
const ADMIN_SCOPES = ["businessUnits:manage", "teams:manage"];

const LIST_VIEW_ENTITIES = ["Lead", "Contact", "Opportunity"];

async function resolveRelatedNames(db: PrismaClient, records: Array<{ relatedObjectType: string; relatedObjectId: string }>): Promise<Map<string, string>> {
  const leadIds = records.filter((r) => r.relatedObjectType === "Lead").map((r) => r.relatedObjectId);
  const contactIds = records.filter((r) => r.relatedObjectType === "Contact").map((r) => r.relatedObjectId);
  const opportunityIds = records.filter((r) => r.relatedObjectType === "Opportunity").map((r) => r.relatedObjectId);
  const map = new Map<string, string>();

  if (leadIds.length > 0) {
    const leads = await db.lead.findMany({ where: { id: { in: [...new Set(leadIds)] } }, select: { id: true, firstName: true, lastName: true } });
    leads.forEach((l: { id: string; firstName: string; lastName: string }) => map.set(l.id, `${l.firstName} ${l.lastName}`));
  }
  if (contactIds.length > 0) {
    const contacts = await db.contact.findMany({ where: { id: { in: [...new Set(contactIds)] } }, select: { id: true, firstName: true, lastName: true } });
    contacts.forEach((c: { id: string; firstName: string; lastName: string }) => map.set(c.id, `${c.firstName} ${c.lastName}`));
  }
  if (opportunityIds.length > 0) {
    const opportunities = await db.opportunity.findMany({ where: { id: { in: [...new Set(opportunityIds)] } }, select: { id: true, name: true } });
    opportunities.forEach((o: { id: string; name: string }) => map.set(o.id, o.name));
  }
  return map;
}

export const homepageRouter = router({
  getLayout: scopedProcedure([])
    .meta({ description: "Get the org's shared Homepage layout — every user in the org sees the same blocks" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";
      const blocks = await ctx.db.homepageBlock.findMany({ where: { orgId }, orderBy: { sortOrder: "asc" } });

      const reportIds = [...new Set(blocks.filter((b) => b.reportId).map((b) => b.reportId as string))];
      const dashboardIds = [...new Set(blocks.filter((b) => b.dashboardId).map((b) => b.dashboardId as string))];

      const [reports, dashboards] = await Promise.all([
        reportIds.length > 0
          ? ctx.db.reportDefinition.findMany({ where: { id: { in: reportIds } }, select: { id: true, name: true, entityType: true, config: true } })
          : Promise.resolve([] as Array<{ id: string; name: string; entityType: string; config: string }>),
        dashboardIds.length > 0
          ? ctx.db.dashboard.findMany({ where: { id: { in: dashboardIds } }, select: { id: true, name: true } })
          : Promise.resolve([] as Array<{ id: string; name: string }>),
      ]);
      const reportMap = new Map(reports.map((r) => [r.id, r] as const));
      const dashboardMap = new Map(dashboards.map((d) => [d.id, d] as const));

      return blocks.map((b) => ({
        ...b,
        report: b.reportId ? reportMap.get(b.reportId) ?? null : null,
        dashboard: b.dashboardId ? dashboardMap.get(b.dashboardId) ?? null : null,
      }));
    }),

  addBlock: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "Add a block to the org's shared Homepage" })
    .input(z.object({
      type: z.enum(["report", "dashboard", "listView", "myTasks", "recentActivity"]),
      title: z.string().optional(),
      reportId: z.string().optional(),
      dashboardId: z.string().optional(),
      entityType: z.enum(LIST_VIEW_ENTITIES as [string, ...string[]]).optional(),
      size: z.enum(["small", "medium", "large"]).default("medium"),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await requireActiveOrg(ctx.db, ctx.currentOrgId);
      if (input.type === "report" && !input.reportId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a report" });
      if (input.type === "dashboard" && !input.dashboardId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a dashboard" });
      if (input.type === "listView" && !input.entityType) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an entity type" });

      const count = await ctx.db.homepageBlock.count({ where: { orgId } });
      return ctx.db.homepageBlock.create({
        data: {
          orgId,
          type: input.type,
          title: input.title || null,
          reportId: input.reportId ?? null,
          dashboardId: input.dashboardId ?? null,
          entityType: input.entityType ?? null,
          size: input.size,
          sortOrder: count,
          createdBy: ctx.userId as string,
        },
      });
    }),

  updateBlockSize: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "Change how much width a Homepage block takes up" })
    .input(z.object({ id: z.string(), size: z.enum(["small", "medium", "large"]) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      await ctx.db.homepageBlock.updateMany({ where: { id: input.id, orgId }, data: { size: input.size } });
      return { success: true };
    }),

  removeBlock: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "Remove a block from the org's shared Homepage" })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      await ctx.db.homepageBlock.deleteMany({ where: { id: input.id, orgId } });
      return { success: true };
    }),

  reorderBlocks: scopedProcedure(ADMIN_SCOPES)
    .meta({ description: "Persist a new block order for the org's shared Homepage" })
    .input(z.object({ orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      await ctx.db.$transaction(
        input.orderedIds.map((id, i) => ctx.db.homepageBlock.updateMany({ where: { id, orgId }, data: { sortOrder: i } })),
      );
      return { success: true };
    }),

  listViewData: scopedProcedure([])
    .meta({ description: "Get a compact recent-records preview for a Homepage list-view block" })
    .input(z.object({ entityType: z.enum(LIST_VIEW_ENTITIES as [string, ...string[]]) }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";
      const where = { orgId };
      const orderBy = { createdAt: "desc" as const };
      if (input.entityType === "Lead") {
        return ctx.db.lead.findMany({ where, orderBy, take: 8, select: { id: true, firstName: true, lastName: true, status: true, source: true } });
      }
      if (input.entityType === "Contact") {
        return ctx.db.contact.findMany({ where, orderBy, take: 8, select: { id: true, firstName: true, lastName: true, lifecycleStage: true, engagementStatus: true } });
      }
      return ctx.db.opportunity.findMany({ where, orderBy, take: 8, select: { id: true, name: true, stage: true, amount: true } });
    }),

  todaysTasks: scopedProcedure([])
    .meta({ description: "Get the current user's tasks due today plus their total open task count" })
    .query(async ({ ctx }) => {
      const userId = ctx.userId as string;
      const today = new Date().toISOString().split("T")[0];
      const [tasks, totalOpen] = await Promise.all([
        ctx.db.crmTask.findMany({
          where: { ownerUserId: userId, dueDate: today },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          take: 8,
        }),
        ctx.db.crmTask.count({ where: { ownerUserId: userId, status: { in: ["Open", "InProgress"] } } }),
      ]);
      const incomplete = tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
      const completed = tasks.filter((t) => t.status === "Completed" || t.status === "Cancelled");
      return { tasks: [...incomplete, ...completed], totalOpen };
    }),

  recentActivityData: scopedProcedure([])
    .meta({ description: "Get the current user's recent activity for the homepage" })
    .query(async ({ ctx }) => {
      const activities = await ctx.db.crmActivity.findMany({
        where: { userId: ctx.userId as string },
        orderBy: { createdAt: "desc" },
        take: 8,
      });
      const nameMap = await resolveRelatedNames(ctx.db, activities);
      return activities.map((a) => ({ ...a, relatedName: nameMap.get(a.relatedObjectId) ?? null }));
    }),
});
