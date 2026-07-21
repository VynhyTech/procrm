import type { PrismaClient } from "@prisma/client";

export const ENTITY_FIELDS: Record<string, string[]> = {
  Lead: ["status", "source", "intakeMode", "ownerUserId", "matchStrength", "campaignName", "createdAt"],
  Contact: ["ownerUserId", "createdAt"],
  Opportunity: ["stage", "amount", "probability", "source", "ownerUserId", "closeDate", "createdAt"],
};

export interface SimpleFilter {
  field: string;
  operator: "equals" | "contains" | "gt" | "lt" | "between" | "in";
  value: string;
}

/** Builds a Prisma `where` clause from a flat list of {field, operator, value} filters. */
export function buildWhereFromFilters(orgId: string, filters: SimpleFilter[]): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId };
  for (const filter of filters) {
    if (filter.operator === "equals") {
      where[filter.field] = filter.value;
    } else if (filter.operator === "contains") {
      where[filter.field] = { contains: filter.value };
    } else if (filter.operator === "gt") {
      where[filter.field] = { gt: isNaN(Number(filter.value)) ? filter.value : Number(filter.value) };
    } else if (filter.operator === "lt") {
      where[filter.field] = { lt: isNaN(Number(filter.value)) ? filter.value : Number(filter.value) };
    }
  }
  return where;
}

/** Runs the {where, orderBy} query against the given entity type's table. */
export async function executeEntityQuery(
  db: PrismaClient,
  entityType: string,
  where: Record<string, unknown>,
  orderBy: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (entityType === "Lead") {
    return db.lead.findMany({ where, orderBy, take: 500, include: { owner: { select: { name: true, email: true } } } });
  } else if (entityType === "Contact") {
    return db.contact.findMany({ where, orderBy, take: 500 });
  } else if (entityType === "Opportunity") {
    return db.opportunity.findMany({ where, orderBy, take: 500, include: { owner: { select: { name: true, email: true } } } });
  }
  return [];
}

/** Groups rows by `groupBy` and aggregates by count or amount-sum, sorted descending by value. */
export function computeGroupByChartData(
  rows: Record<string, unknown>[],
  groupBy: string,
  aggregation: string | undefined,
): { labels: string[]; values: number[] } {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? "Unknown");
    if (aggregation === "sum") {
      grouped.set(key, (grouped.get(key) ?? 0) + (Number(row.amount) || 0));
    } else {
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
  }
  const sorted = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
  return { labels: sorted.map(([k]) => k), values: sorted.map(([, v]) => v) };
}
