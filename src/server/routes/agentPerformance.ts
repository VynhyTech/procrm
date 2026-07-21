import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
// Reads only — no requireActiveOrg needed

export const agentPerformanceRouter = router({
  getLeaderboard: scopedProcedure([])
    .meta({ description: "Get agent performance leaderboard for the organization" })
    .query(async ({ ctx }) => {
      const orgId = ctx.currentOrgId ?? "";

      const members = await ctx.db.organizationMember.findMany({
        where: { orgId },
        include: { user: { select: { id: true, name: true, email: true, picture: true } } },
      });

      if (members.length === 0) {
        return { agents: [], summary: { totalAgents: 0, activeAgents: 0, totalLeads: 0, totalRevenue: 0, totalPipeline: 0, avgConversion: 0 } };
      }

      // Bulk fetch all data in a few queries instead of per-agent
      const [allLeads, allOpportunities, allTasks, allMessages] = await Promise.all([
        ctx.db.lead.findMany({ where: { orgId }, select: { ownerUserId: true, status: true } }),
        ctx.db.opportunity.findMany({ where: { orgId }, select: { ownerUserId: true, stage: true, amount: true } }),
        ctx.db.crmTask.findMany({ where: { orgId, status: { in: ["Open", "InProgress"] } }, select: { ownerUserId: true, dueDate: true } }),
        ctx.db.communicationMessage.findMany({ where: { orgId }, select: { senderUserId: true } }),
      ]);

      const today = new Date().toISOString().split("T")[0];

      const agentMetrics = members.map((member) => {
        const userId = member.userId;
        const leads = allLeads.filter((l) => l.ownerUserId === userId);
        const opps = allOpportunities.filter((o) => o.ownerUserId === userId);
        const tasks = allTasks.filter((t) => t.ownerUserId === userId);
        const msgs = allMessages.filter((m) => m.senderUserId === userId);

        const totalLeads = leads.length;
        const newLeads = leads.filter((l) => l.status === "New").length;
        const qualifiedLeads = leads.filter((l) => l.status === "Qualified").length;
        const convertedLeads = leads.filter((l) => l.status === "Converted").length;
        const disqualifiedLeads = leads.filter((l) => l.status === "Disqualified").length;

        const openOpportunities = opps.filter((o) => !["ClosedWon", "ClosedLost"].includes(o.stage)).length;
        const closedWon = opps.filter((o) => o.stage === "ClosedWon").length;
        const closedLost = opps.filter((o) => o.stage === "ClosedLost").length;
        const revenue = opps.filter((o) => o.stage === "ClosedWon").reduce((s, o) => s + (o.amount ?? 0), 0);
        const pipelineValue = opps.filter((o) => !["ClosedWon", "ClosedLost"].includes(o.stage)).reduce((s, o) => s + (o.amount ?? 0), 0);

        const openTasks = tasks.length;
        const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < today).length;
        const messagesSent = msgs.length;

        const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
        const winRate = (closedWon + closedLost) > 0 ? Math.round((closedWon / (closedWon + closedLost)) * 100) : 0;

        return {
          user: member.user,
          totalLeads, newLeads, qualifiedLeads, convertedLeads, disqualifiedLeads,
          conversionRate, openOpportunities, closedWon, closedLost, winRate,
          revenue, pipelineValue, recentActivities: 0, openTasks, overdueTasks, messagesSent,
        };
      });

      const activeAgents = agentMetrics.filter((a) => a.totalLeads > 0 || a.openOpportunities > 0);
      const totalLeads = agentMetrics.reduce((s, a) => s + a.totalLeads, 0);
      const totalRevenue = agentMetrics.reduce((s, a) => s + a.revenue, 0);
      const totalPipeline = agentMetrics.reduce((s, a) => s + a.pipelineValue, 0);
      const avgConversion = activeAgents.length > 0 ? Math.round(activeAgents.reduce((s, a) => s + a.conversionRate, 0) / activeAgents.length) : 0;

      return {
        agents: agentMetrics.sort((a, b) => b.conversionRate - a.conversionRate),
        summary: { totalAgents: members.length, activeAgents: activeAgents.length, totalLeads, totalRevenue, totalPipeline, avgConversion },
      };
    }),

  getAgentDetail: scopedProcedure([])
    .meta({ description: "Get detailed performance breakdown for a specific agent" })
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.currentOrgId ?? "";

      const [leads, opps, recentActivities, recentMessages] = await Promise.all([
        ctx.db.lead.findMany({ where: { ownerUserId: input.userId, orgId }, select: { status: true } }),
        ctx.db.opportunity.findMany({ where: { ownerUserId: input.userId, orgId }, select: { stage: true } }),
        ctx.db.crmActivity.findMany({ where: { userId: input.userId, orgId }, orderBy: { createdAt: "desc" }, take: 10, select: { activityType: true, notes: true, createdAt: true, relatedObjectType: true } }),
        ctx.db.communicationMessage.findMany({ where: { senderUserId: input.userId, orgId }, orderBy: { createdAt: "desc" }, take: 10, select: { channel: true, status: true, createdAt: true, recipientAddress: true } }),
      ]);

      const leadsByStatus = ["New", "Working", "Qualified", "Disqualified", "Converted"].map((status) => ({
        status, count: leads.filter((l) => l.status === status).length,
      }));

      const oppsByStage = ["LeadQualified", "InitialDiscussion", "PropertyShared", "SiteVisitScheduled", "SiteVisitCompleted", "Interested", "Negotiation", "BookingIntent", "AgreementDrafted", "AgreementSigned", "ClosedWon", "ClosedLost"]
        .map((stage) => ({ stage, count: opps.filter((o) => o.stage === stage).length }))
        .filter((s) => s.count > 0);

      return { leadsByStatus, opportunitiesByStage: oppsByStage, recentActivities, recentMessages };
    }),
});
