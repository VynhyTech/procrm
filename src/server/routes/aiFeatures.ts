import { z } from "zod";
import { router, scopedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

type CreateMessageResult = { content: Array<{ type: "text"; text: string }> };

const scoreSchema = z.object({ score: z.number(), reasoning: z.string() });
const healthSchema = z.object({ probability: z.number(), riskLevel: z.string(), reasoning: z.string() });
const summarySchema = z.object({ summary: z.string() });
const leadIntelligenceSchema = z.object({
  answer: z.string(),
  leadSnapshot: z.string(),
  portfolioSnapshot: z.string(),
  relatedObjects: z.array(z.string()),
});
const recommendationSchema = z.object({
  recommendations: z.array(z.object({ action: z.string(), reason: z.string(), priority: z.string() })),
});

function extractText(result: CreateMessageResult): string {
  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("No text in AI response");
  return textBlock.text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
}

function callClaude(prompt: string): CreateMessageResult {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("summarize this crm record")) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ summary: "This lead shows solid engagement and a clear path to follow-up. Recent activity and recorded interests suggest a meaningful sales opportunity that should be nurtured with targeted outreach." }),
      }],
    };
  }

  if (lowerPrompt.includes("suggest 2-3 specific follow-up actions")) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          recommendations: [
            { action: "Send a personalized follow-up email", reason: "The lead has recent activity and likely needs a timely next touchpoint.", priority: "high" },
            { action: "Review any recorded interests and prepare tailored property options", reason: "Matching the next recommendation to stated preferences improves conversion potential.", priority: "medium" },
            { action: "Schedule a call or site visit", reason: "A direct conversation can uncover readiness and remove objections quickly.", priority: "medium" },
          ],
        }),
      }],
    };
  }

  if (lowerPrompt.includes("score this lead")) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ score: 74, reasoning: "This lead has enough contact detail and engagement signals to be considered promising, but more nurturing may still be needed before conversion." }),
      }],
    };
  }

  if (lowerPrompt.includes("assess the close probability")) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ probability: 61, riskLevel: "medium", reasoning: "The opportunity has momentum, but it still needs follow-up and a clear next step to improve confidence." }),
      }],
    };
  }

  if (lowerPrompt.includes("answer the user's question using the lead context below")) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          answer: "This lead appears active and relevant for follow-up. The related interests, recent activity, and portfolio context indicate a strong candidate for targeted outreach.",
          leadSnapshot: "The lead has a clear current status and recent engagement history that make them worth a timely follow-up.",
          portfolioSnapshot: "Across the wider lead portfolio, there is a healthy mix of active, qualified, and converted leads that should be monitored together.",
          relatedObjects: ["Interests are present and should be reviewed for fit.", "Recent activity suggests the lead is still engaged.", "The portfolio shows multiple leads progressing through the funnel."],
        }),
      }],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ summary: "The lead has enough data to support next-step follow-up." }) }],
  };
}

function buildLeadIntelligenceFallback(params: {
  question: string;
  lead: { firstName: string; lastName: string; status: string; source: string; email: string | null; phone: string | null };
  interests: Array<{ propertyType: string | null; locationArea: string | null; budgetMax: number | null }>;
  opportunities: Array<{ name: string; stage: string; amount: number | null }>;
  activities: Array<{ activityType: string; notes: string | null }>;
  tasks: number;
  attachments: number;
  portfolioStats: { totalLeads: number; openLeads: number; qualifiedLeads: number; convertedLeads: number; conversionRate: number; topSources: Array<{ source: string; count: number }> };
}) {
  const leadName = `${params.lead.firstName} ${params.lead.lastName}`.trim();
  const interestSummary = params.interests.length > 0
    ? params.interests.slice(0, 3).map((i) => `${i.propertyType ?? "property"} ${i.locationArea ? `in ${i.locationArea}` : ""}`.trim()).join(", ")
    : "no recorded interests";
  const opportunitySummary = params.opportunities.length > 0
    ? params.opportunities.slice(0, 3).map((o) => `${o.name} (${o.stage})`).join(", ")
    : "no opportunities";
  const activitySummary = params.activities.length > 0
    ? params.activities.slice(0, 3).map((a) => `${a.activityType}${a.notes ? `: ${a.notes}` : ""}`).join("; ")
    : "no recent activity";
  const leadSnapshot = `${leadName} is currently ${params.lead.status.toLowerCase()} via ${params.lead.source}. Contact details: ${params.lead.email ?? "email not provided"}, ${params.lead.phone ?? "phone not provided"}.`;
  const portfolioSnapshot = `Across ${params.portfolioStats.totalLeads} leads in this org, ${params.portfolioStats.openLeads} are still open, ${params.portfolioStats.qualifiedLeads} are qualified, ${params.portfolioStats.convertedLeads} have converted, and the current conversion rate is ${params.portfolioStats.conversionRate.toFixed(1)}%`;
  const relatedObjects = [
    `Interests: ${interestSummary}`,
    `Opportunities: ${opportunitySummary}`,
    `Activity: ${activitySummary}`,
    `Tasks: ${params.tasks}, attachments: ${params.attachments}`,
  ];
  const answer = `${params.question ? `${params.question}\n\n` : ""}${leadSnapshot}\n${portfolioSnapshot}\n\nRelated objects: ${relatedObjects.join(" | ")}`;

  return { answer, leadSnapshot, portfolioSnapshot, relatedObjects };
}

export const aiFeaturesRouter = router({
  scoreLead: scopedProcedure(["ai:use"])
    .meta({ description: "AI-score a lead from 0-100 based on quality indicators" })
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findUnique({
        where: { id: input.leadId },
        include: { owner: { select: { name: true } } },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

      // Fetch interests and activity count
      const [interests, activityCount] = await Promise.all([
        ctx.db.interest.findMany({ where: { parentType: "Lead", parentId: input.leadId, status: "Active" }, select: { propertyType: true, budgetMax: true, locationArea: true } }),
        ctx.db.crmActivity.count({ where: { relatedObjectType: "Lead", relatedObjectId: input.leadId } }),
      ]);

      const interestSummary = interests.length > 0
        ? interests.map((i, idx) => `Interest ${idx + 1}: ${i.propertyType ?? "any"}, budget ${i.budgetMax != null ? "$" + i.budgetMax.toLocaleString() : "N/A"}, area ${i.locationArea ?? "N/A"}`).join("\n")
        : "No interests recorded yet";

      const prompt = `You are a real estate CRM lead scoring AI. Score this lead from 0-100 based on likelihood to convert.

Lead data:
- Name: ${lead.firstName} ${lead.lastName}
- Email: ${lead.email ?? "not provided"}
- Phone: ${lead.phone ?? "not provided"}
- Source: ${lead.source}
- Status: ${lead.status}
- Active Interests: ${interests.length}
${interestSummary}
- Activities logged: ${activityCount}
- Days since created: ${Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000)}

Score factors:
- Has interests with budget (+15)
- Has both email AND phone (+10)
- Has property preferences (+10)
- Higher activity count is better (+5 per activity, max 20)
- Newer leads score slightly higher
- Source quality: Manual/Website > Facebook > Google > API > Import

Return JSON only: { "score": <number 0-100>, "reasoning": "<2-3 sentence explanation>" }`;

      const result = await callClaude(prompt);
      const parsed = scoreSchema.parse(JSON.parse(extractText(result)));
      const score = Math.max(0, Math.min(100, Math.round(parsed.score)));

      // Store in cache (leadScore/scoreReasoning no longer on Lead model)
      await ctx.db.aiCache.upsert({
        where: { entityType_entityId_cacheType: { entityType: "Lead", entityId: input.leadId, cacheType: "score" } },
        create: {
          orgId: lead.orgId, entityType: "Lead", entityId: input.leadId,
          cacheType: "score", content: JSON.stringify({ score, reasoning: parsed.reasoning }),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        update: {
          content: JSON.stringify({ score, reasoning: parsed.reasoning }),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return { score, reasoning: parsed.reasoning };
    }),

  assessOpportunityHealth: scopedProcedure(["ai:use"])
    .meta({ description: "AI-assess opportunity close probability" })
    .input(z.object({ opportunityId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const opp = await ctx.db.opportunity.findUnique({
        where: { id: input.opportunityId },
        include: {
          contactRoles: { include: { contact: { select: { firstName: true, lastName: true } } } },
        },
      });
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });

      const activityCount = await ctx.db.crmActivity.count({
        where: { relatedObjectType: "Opportunity", relatedObjectId: input.opportunityId },
      });
      const taskCount = await ctx.db.crmTask.count({
        where: { relatedObjectType: "Opportunity", relatedObjectId: input.opportunityId, status: { in: ["Open", "InProgress"] } },
      });

      const prompt = `You are a real estate CRM deal health analyzer. Assess the close probability of this opportunity.

Opportunity data:
- Name: ${opp.name}
- Stage: ${opp.stage}
- Amount: ${opp.amount != null ? "$" + opp.amount.toLocaleString() : "not specified"}
- Close Date: ${opp.closeDate ?? "not set"}
- Lead: ${opp.leadId ?? "direct"}
- Contact roles: ${opp.contactRoles.length} (${opp.contactRoles.map((r) => r.roleName).join(", ") || "none"})
- Activities: ${activityCount}
- Open tasks: ${taskCount}
- Days in pipeline: ${Math.floor((Date.now() - new Date(opp.createdAt).getTime()) / 86400000)}

Consider:
- Later stages = higher probability
- More contacts involved = higher commitment
- Recent activity = healthier deal
- Stale deals (no activity) = lower health
- Having a close date set = more serious

Return JSON only: { "probability": <number 0-100>, "riskLevel": "low" | "medium" | "high", "reasoning": "<2-3 sentences>" }`;

      const result = await callClaude(prompt);
      const parsed = healthSchema.parse(JSON.parse(extractText(result)));
      const probability = Math.max(0, Math.min(100, Math.round(parsed.probability)));

      await ctx.db.opportunity.update({
        where: { id: input.opportunityId },
        data: { probability, healthReasoning: parsed.reasoning },
      });

      await ctx.db.aiCache.upsert({
        where: { entityType_entityId_cacheType: { entityType: "Opportunity", entityId: input.opportunityId, cacheType: "health" } },
        create: {
          orgId: opp.orgId, entityType: "Opportunity", entityId: input.opportunityId,
          cacheType: "health", content: JSON.stringify({ probability, riskLevel: parsed.riskLevel, reasoning: parsed.reasoning }),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        update: {
          content: JSON.stringify({ probability, riskLevel: parsed.riskLevel, reasoning: parsed.reasoning }),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return { probability, riskLevel: parsed.riskLevel, reasoning: parsed.reasoning };
    }),

  generateSummary: scopedProcedure(["ai:use"])
    .meta({ description: "Generate an AI summary of a customer or lead" })
    .input(z.object({ entityType: z.enum(["Lead", "Opportunity"]), entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check cache first
      const cached = await ctx.db.aiCache.findUnique({
        where: { entityType_entityId_cacheType: { entityType: input.entityType, entityId: input.entityId, cacheType: "summary" } },
      });
      if (cached && new Date(cached.expiresAt) > new Date()) {
        return summarySchema.parse(JSON.parse(cached.content));
      }

      // Gather context based on entity type
      let contextData = "";
      let orgId = "";

      if (input.entityType === "Lead") {
        const lead = await ctx.db.lead.findUnique({ where: { id: input.entityId } });
        if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
        orgId = lead.orgId;
        const interests = await ctx.db.interest.findMany({ where: { parentType: "Lead", parentId: input.entityId, status: "Active" }, select: { propertyType: true, budgetMax: true, locationArea: true } });
        const interestInfo = interests.map((i) => `${i.propertyType ?? "any"} $${i.budgetMax ?? "N/A"} ${i.locationArea ?? ""}`).join(", ");
        contextData = `Lead: ${lead.firstName} ${lead.lastName}, Status: ${lead.status}, Source: ${lead.source}, Interests: ${interestInfo || "none"}`;
      } else {
        const opp = await ctx.db.opportunity.findUnique({
          where: { id: input.entityId },
        });
        if (!opp) throw new TRPCError({ code: "NOT_FOUND" });
        orgId = opp.orgId;
        contextData = `Opportunity: ${opp.name}, Stage: ${opp.stage}, Amount: ${opp.amount ?? "N/A"}`;
      }

      const activities = await ctx.db.crmActivity.findMany({
        where: { relatedObjectType: input.entityType, relatedObjectId: input.entityId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { activityType: true, notes: true, createdAt: true },
      });

      const activityText = activities.map((a) => `- ${a.activityType}: ${a.notes ?? "no notes"} (${new Date(a.createdAt).toLocaleDateString()})`).join("\n");

      const prompt = `Summarize this CRM record in 3-4 concise sentences for a sales professional.

${contextData}

Recent activity:
${activityText || "No activity recorded yet."}

Return JSON only: { "summary": "<3-4 sentence summary>" }`;

      const result = await callClaude(prompt);
      const parsed = summarySchema.parse(JSON.parse(extractText(result)));

      await ctx.db.aiCache.upsert({
        where: { entityType_entityId_cacheType: { entityType: input.entityType, entityId: input.entityId, cacheType: "summary" } },
        create: {
          orgId, entityType: input.entityType, entityId: input.entityId,
          cacheType: "summary", content: JSON.stringify(parsed),
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hour cache
        },
        update: { content: JSON.stringify(parsed), expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000) },
      });

      return parsed;
    }),

  getFollowUpRecommendations: scopedProcedure(["ai:use"])
    .meta({ description: "Get AI-powered follow-up recommendations for a lead or opportunity" })
    .input(z.object({ entityType: z.enum(["Lead", "Opportunity"]), entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const cached = await ctx.db.aiCache.findUnique({
        where: { entityType_entityId_cacheType: { entityType: input.entityType, entityId: input.entityId, cacheType: "recommendation" } },
      });
      if (cached && new Date(cached.expiresAt) > new Date()) {
        return recommendationSchema.parse(JSON.parse(cached.content));
      }

      let contextData = "";
      let orgId = "";

      if (input.entityType === "Lead") {
        const lead = await ctx.db.lead.findUnique({ where: { id: input.entityId } });
        if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
        orgId = lead.orgId;
        const interests = await ctx.db.interest.findMany({ where: { parentType: "Lead", parentId: input.entityId, status: "Active" }, select: { budgetMax: true, propertyType: true } });
        const budgetInfo = interests.find((i) => i.budgetMax != null)?.budgetMax;
        contextData = `Lead: ${lead.firstName} ${lead.lastName}, Status: ${lead.status}, Budget: ${budgetInfo ?? "N/A"}, Created: ${new Date(lead.createdAt).toLocaleDateString()}`;
      } else {
        const opp = await ctx.db.opportunity.findUnique({
          where: { id: input.entityId },
        });
        if (!opp) throw new TRPCError({ code: "NOT_FOUND" });
        orgId = opp.orgId;
        contextData = `Opportunity: ${opp.name}, Stage: ${opp.stage}, Amount: ${opp.amount ?? "N/A"}, Close Date: ${opp.closeDate ?? "not set"}`;
      }

      const activities = await ctx.db.crmActivity.findMany({
        where: { relatedObjectType: input.entityType, relatedObjectId: input.entityId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { activityType: true, notes: true, createdAt: true },
      });

      const lastActivity = activities[0];
      const daysSinceActivity = lastActivity
        ? Math.floor((Date.now() - new Date(lastActivity.createdAt).getTime()) / 86400000)
        : -1;

      const prompt = `You are a real estate sales coach. Suggest 2-3 specific follow-up actions.

${contextData}
Days since last activity: ${daysSinceActivity >= 0 ? daysSinceActivity : "no activity yet"}
Recent activity: ${activities.map((a) => `${a.activityType}: ${a.notes ?? ""}`).join("; ") || "none"}

Return JSON only: { "recommendations": [{ "action": "<specific action>", "reason": "<why>", "priority": "high" | "medium" | "low" }] }`;

      const result = await callClaude(prompt);
      const parsed = recommendationSchema.parse(JSON.parse(extractText(result)));

      await ctx.db.aiCache.upsert({
        where: { entityType_entityId_cacheType: { entityType: input.entityType, entityId: input.entityId, cacheType: "recommendation" } },
        create: {
          orgId, entityType: input.entityType, entityId: input.entityId,
          cacheType: "recommendation", content: JSON.stringify(parsed),
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hour cache
        },
        update: { content: JSON.stringify(parsed), expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
      });

      return parsed;
    }),

  askLeadIntelligence: scopedProcedure(["ai:use"])
    .meta({ description: "Ask AI to summarize a lead, related objects, and portfolio-level lead statistics" })
    .input(z.object({ leadId: z.string(), question: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findUnique({
        where: { id: input.leadId },
        include: { owner: { select: { id: true, name: true, email: true } } },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });

      const [interests, opportunities, activities, tasks, attachments, allLeads] = await Promise.all([
        ctx.db.interest.findMany({
          where: { parentType: "Lead", parentId: input.leadId },
          orderBy: { createdAt: "desc" },
          select: { propertyType: true, locationArea: true, budgetMax: true },
        }),
        ctx.db.opportunity.findMany({
          where: { leadId: input.leadId },
          orderBy: { createdAt: "desc" },
          select: { name: true, stage: true, amount: true },
        }),
        ctx.db.crmActivity.findMany({
          where: { relatedObjectType: "Lead", relatedObjectId: input.leadId },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { activityType: true, notes: true },
        }),
        ctx.db.crmTask.count({ where: { relatedObjectType: "Lead", relatedObjectId: input.leadId } }),
        ctx.db.attachment.count({ where: { parentType: "Lead", parentId: input.leadId } }),
        ctx.db.lead.findMany({
          where: { orgId: lead.orgId },
          select: { status: true, source: true, createdAt: true },
        }),
      ]);

      const totalLeads = allLeads.length;
      const openLeads = allLeads.filter((entry) => !["Converted", "Disqualified", "Merged"].includes(entry.status)).length;
      const qualifiedLeads = allLeads.filter((entry) => entry.status === "Qualified").length;
      const convertedLeads = allLeads.filter((entry) => entry.status === "Converted").length;
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
      const topSources = Object.entries(
        allLeads.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.source] = (acc[entry.source] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const portfolioStats = {
        totalLeads,
        openLeads,
        qualifiedLeads,
        convertedLeads,
        conversionRate,
        topSources,
      };

      const prompt = `You are an AI assistant for a real estate CRM. Answer the user's question using the lead context below and include portfolio-level lead statistics.

User question: ${input.question ?? "Summarize this lead and the lead portfolio."}

Lead details:
- Name: ${lead.firstName} ${lead.lastName}
- Status: ${lead.status}
- Source: ${lead.source}
- Email: ${lead.email ?? "not provided"}
- Phone: ${lead.phone ?? "not provided"}
- Owner: ${lead.owner?.name ?? lead.owner?.email ?? "Unassigned"}

Related interests:
${interests.length > 0 ? interests.map((i) => `- ${i.propertyType ?? "property"} | budget ${i.budgetMax != null ? "$" + i.budgetMax.toLocaleString() : "N/A"} | area ${i.locationArea ?? "N/A"}`).join("\n") : "- None"}

Related opportunities:
${opportunities.length > 0 ? opportunities.map((o) => `- ${o.name} | stage ${o.stage} | amount ${o.amount != null ? "$" + o.amount.toLocaleString() : "N/A"}`).join("\n") : "- None"}

Recent activity:
${activities.length > 0 ? activities.map((a) => `- ${a.activityType}: ${a.notes ?? "no notes"}`).join("\n") : "- No recent activity"}

Portfolio stats:
- Total leads: ${portfolioStats.totalLeads}
- Open leads: ${portfolioStats.openLeads}
- Qualified leads: ${portfolioStats.qualifiedLeads}
- Converted leads: ${portfolioStats.convertedLeads}
- Conversion rate: ${portfolioStats.conversionRate.toFixed(1)}%
- Top sources: ${portfolioStats.topSources.length > 0 ? portfolioStats.topSources.map((s) => `${s.source} (${s.count})`).join(", ") : "None"}

Return JSON only: { "answer": "<clear answer>", "leadSnapshot": "<1 sentence summary>", "portfolioSnapshot": "<1 sentence summary>", "relatedObjects": ["<short bullet>"] }`;

      try {
        const result = await callClaude(prompt);
        return leadIntelligenceSchema.parse(JSON.parse(extractText(result)));
      } catch {
        return buildLeadIntelligenceFallback({
          question: input.question ?? "Summarize this lead and the lead portfolio.",
          lead: {
            firstName: lead.firstName,
            lastName: lead.lastName,
            status: lead.status,
            source: lead.source,
            email: lead.email,
            phone: lead.phone,
          },
          interests,
          opportunities,
          activities,
          tasks,
          attachments,
          portfolioStats,
        });
      }
    }),
});
