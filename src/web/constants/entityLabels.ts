// Plural display labels for CRM entity types — naive `${entityType}s` concatenation
// breaks on "Opportunity" (produces "Opportunitys" instead of "Opportunities").
export const ENTITY_PLURAL_LABELS: Record<string, string> = {
  Lead: "Leads",
  Contact: "Contacts",
  Opportunity: "Opportunities",
};

export function pluralizeEntity(entityType: string): string {
  return ENTITY_PLURAL_LABELS[entityType] ?? `${entityType}s`;
}
