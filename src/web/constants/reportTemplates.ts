import { Users, TrendingUp, PieChart } from "lucide-react";
import type { ComponentType } from "react";

export interface ReportTemplateConfig {
  fields: string[];
  filters: Array<{ field: string; operator: "equals" | "contains" | "gt" | "lt"; value: string }>;
  chartType: "table" | "bar" | "line" | "pie" | "doughnut";
  groupBy?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  aggregation?: "count" | "sum" | "avg";
}

export interface ReportTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  entityType: "Lead" | "Contact" | "Opportunity";
  tags: string[];
  icon: ComponentType<{ className?: string }>;
  config: ReportTemplateConfig;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    key: "lead-pipeline",
    name: "Lead Pipeline",
    description: "Leads grouped by status showing pipeline distribution",
    category: "Sales",
    entityType: "Lead",
    tags: ["Lead", "bar"],
    icon: Users,
    config: { fields: ["status", "source", "createdAt"], filters: [], chartType: "bar", groupBy: "status", aggregation: "count" },
  },
  {
    key: "opportunity-pipeline",
    name: "Opportunity Pipeline",
    description: "Deal pipeline by stage with amounts",
    category: "Sales",
    entityType: "Opportunity",
    tags: ["Opportunity", "bar"],
    icon: TrendingUp,
    config: { fields: ["stage", "amount", "closeDate"], filters: [], chartType: "bar", groupBy: "stage", aggregation: "sum" },
  },
  {
    key: "contact-lifecycle",
    name: "Contact Lifecycle",
    description: "Contacts grouped by owner",
    category: "Sales",
    entityType: "Contact",
    tags: ["Contact", "doughnut"],
    icon: Users,
    config: { fields: ["ownerUserId", "createdAt"], filters: [], chartType: "doughnut", groupBy: "ownerUserId", aggregation: "count" },
  },
  {
    key: "closed-won-deals",
    name: "Closed Won Deals",
    description: "All successfully closed deals",
    category: "Sales",
    entityType: "Opportunity",
    tags: ["Opportunity", "table"],
    icon: TrendingUp,
    config: {
      fields: ["stage", "amount", "closeDate", "ownerUserId"],
      filters: [{ field: "stage", operator: "equals", value: "ClosedWon" }],
      chartType: "table",
      sortBy: "closeDate",
      sortOrder: "desc",
    },
  },
  {
    key: "new-leads-this-week",
    name: "New Leads This Week",
    description: "Recently created leads for follow-up",
    category: "Sales",
    entityType: "Lead",
    tags: ["Lead", "table"],
    icon: Users,
    config: { fields: ["status", "source", "ownerUserId", "createdAt"], filters: [], chartType: "table", sortBy: "createdAt", sortOrder: "desc" },
  },
  {
    key: "lead-sources",
    name: "Lead Sources",
    description: "Where your leads are coming from",
    category: "Marketing",
    entityType: "Lead",
    tags: ["Lead", "pie"],
    icon: PieChart,
    config: { fields: ["source", "status"], filters: [], chartType: "pie", groupBy: "source", aggregation: "count" },
  },
];
