// Groups permission scopes (e.g. "leads:viewAll") into the two zones shown on the Role
// detail page: CRM data objects ("tables") vs. everything else ("system permissions").

export const OBJECT_CATEGORY_LABELS: Record<string, string> = {
  leads: "Leads",
  contacts: "Contacts",
  opportunities: "Opportunities",
  tasks: "Tasks",
  activities: "Activities",
  interests: "Interests",
  campaigns: "Campaigns",
};

export const SYSTEM_CATEGORY_LABELS: Record<string, string> = {
  orgs: "Organization",
  businessUnits: "Business Units",
  teams: "Teams",
  customFields: "Custom Fields",
  dashboard: "Dashboards",
  reports: "Reports",
  audit: "Audit",
  compliance: "Compliance",
  ai: "AI Features",
  communications: "Communications",
  agents: "Agent Performance",
  workflows: "Workflows",
  roles: "Roles & Permissions",
  users: "Users",
  tenants: "Tenants",
  scopes: "Scopes",
  oauth: "OAuth",
  logs: "Logs",
  services: "Services",
  app: "App Settings",
};

export function scopeCategoryOf(scopeName: string): string {
  return scopeName.split(":")[0];
}

export function isObjectCategory(category: string): boolean {
  return category in OBJECT_CATEGORY_LABELS;
}

export function categoryLabel(category: string): string {
  return OBJECT_CATEGORY_LABELS[category] ?? SYSTEM_CATEGORY_LABELS[category] ?? (category.charAt(0).toUpperCase() + category.slice(1));
}
