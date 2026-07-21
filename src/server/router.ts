import { router } from "./trpc";
import { authRouter } from "./routes/auth";
import { leadsRouter } from "./routes/leads";
// Account removed — leads convert directly to contacts
import { contactsRouter } from "./routes/contacts";
import { opportunitiesRouter } from "./routes/opportunities";
import { tasksRouter } from "./routes/tasks";
import { crmActivitiesRouter } from "./routes/crmActivities";
import { orgSettingsRouter } from "./routes/orgSettings";
import { tenantsRouter } from "./routes/tenants";
import { aiFeaturesRouter } from "./routes/aiFeatures";
// aiFeatures still imports @synthetiq/services-claude-api-client, which no longer resolves.
// Left unmounted pending Phase 8 (swap to the official Anthropic SDK) — deliberately deferred,
// not a temporary exclusion; restore this import once Phase 8 lands.
// import { aiFeaturesRouter } from "./routes/aiFeatures";
import { reportsRouter } from "./routes/reports";
import { dashboardsRouter } from "./routes/dashboards";
import { homepageRouter } from "./routes/homepage";
import { auditRouter } from "./routes/audit";
import { complianceRouter } from "./routes/compliance";
import { communicationsRouter } from "./routes/communications";
import { agentPerformanceRouter } from "./routes/agentPerformance";
import { internalChatRouter } from "./routes/internalChat";
import { interestsRouter } from "./routes/interests";
import { campaignsRouter } from "./routes/campaigns";
import { attachmentsRouter } from "./routes/attachments";
import { onboardingRouter } from "./routes/onboarding";
import { apiKeysRouter } from "./routes/apiKeys";

export const appRouter = router({
  auth: authRouter,

  // CRM routes
  leads: leadsRouter,
  // accounts removed
  contacts: contactsRouter,
  opportunities: opportunitiesRouter,
  tasks: tasksRouter,
  crmActivities: crmActivitiesRouter,
  orgSettings: orgSettingsRouter,
  tenants: tenantsRouter,

  // AI, Reporting, Compliance, Communications
  aiFeatures: aiFeaturesRouter,
  reports: reportsRouter,
  dashboards: dashboardsRouter,
  homepage: homepageRouter,
  audit: auditRouter,
  compliance: complianceRouter,
  communications: communicationsRouter,
  agentPerformance: agentPerformanceRouter,
  internalChat: internalChatRouter,
  interests: interestsRouter,
  campaigns: campaignsRouter,
  attachments: attachmentsRouter,
  onboarding: onboardingRouter,
  apiKeys: apiKeysRouter,
});

export type AppRouter = typeof appRouter;
