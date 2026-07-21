export const CRM_ROLE_DEFINITIONS: Array<{ name: string; description: string; isDefault: boolean; scopes: string[] }> = [
  {
    name: "Tenant Admin",
    description: "Full access to all CRM features, settings, compliance, and reporting",
    isDefault: false,
    scopes: [
      "leads:viewAll", "leads:viewTeam", "leads:edit", "leads:assign", "leads:convert", "leads:delete",
      "leads:claim", "leads:merge",
      "contacts:viewAll", "contacts:edit", "contacts:delete",
      "opportunities:viewAll", "opportunities:viewTeam", "opportunities:edit", "opportunities:delete",
      "tasks:viewAll", "tasks:edit",
      "activities:viewAll",
      "interests:edit", "campaigns:view", "campaigns:edit",
      "businessUnits:manage", "teams:manage", "customFields:manage",
      "dashboard:executive", "dashboard:manager",
      "reports:view", "reports:edit",
      "audit:view", "compliance:manage",
      "ai:use", "communications:send", "communications:templates",
      "agents:viewPerformance",
      "orgs:manageOrgMembers",
      "roles:view", "roles:edit", "users:viewRoles", "users:editRoles",
    ],
  },
  {
    name: "Sales Manager",
    description: "Manage team leads and opportunities, assign leads, view reports and agent performance",
    isDefault: false,
    scopes: [
      "leads:viewAll", "leads:viewTeam", "leads:edit", "leads:assign", "leads:convert",
      "leads:claim", "leads:merge",
      "contacts:viewAll", "contacts:edit",
      "opportunities:viewAll", "opportunities:viewTeam", "opportunities:edit",
      "tasks:viewAll", "tasks:edit",
      "activities:viewAll",
      "interests:edit", "campaigns:view", "campaigns:edit",
      "dashboard:manager",
      "reports:view", "reports:edit",
      "ai:use", "communications:send",
      "agents:viewPerformance",
    ],
  },
  {
    name: "Agent",
    description: "Work assigned leads and opportunities, communicate with leads, use AI tools",
    isDefault: true,
    scopes: [
      "leads:edit", "leads:convert", "leads:claim",
      "contacts:edit",
      "opportunities:edit",
      "tasks:edit",
      "interests:edit",
      "ai:use", "communications:send",
    ],
  },
  {
    name: "Viewer",
    description: "Read-only access to CRM data, reports, and dashboards",
    isDefault: false,
    scopes: [
      "leads:viewAll",
      "contacts:viewAll",
      "opportunities:viewAll",
      "tasks:viewAll",
      "activities:viewAll",
      "campaigns:view",
      "reports:view",
    ],
  },
];

/**
 * Creates (or refreshes) the default CRM roles for an org and returns their ids/names,
 * so callers — onboarding's self-service org creation and the manual "reseed" button in
 * Settings — share one scope-list source of truth instead of drifting apart.
 */
export async function seedCrmRolesForOrg(db: any, orgId: string): Promise<{ id: string; name: string }[]> {
  const roles: { id: string; name: string }[] = [];

  for (const roleDef of CRM_ROLE_DEFINITIONS) {
    const existing = await db.role.findFirst({
      where: { name: roleDef.name, orgId: orgId },
    });

    const scopeRecords = await db.scope.findMany({
      where: { name: { in: roleDef.scopes } },
      select: { id: true },
    });

    if (existing) {
      // Update existing role: clear old scopes, add current set
      await db.roleScope.deleteMany({ where: { roleId: existing.id } });
      await db.roleScope.createMany({
        data: scopeRecords.map((s: { id: string }) => ({ roleId: existing.id, scopeId: s.id })),
      });
      roles.push({ id: existing.id, name: roleDef.name });
      continue;
    }

    const role = await db.role.create({
      data: {
        name: roleDef.name,
        description: roleDef.description,
        orgId: orgId,
        isDefault: roleDef.isDefault,
        scopes: {
          create: scopeRecords.map((s: { id: string }) => ({ scopeId: s.id })),
        },
      },
    });

    roles.push({ id: role.id, name: role.name });
  }

  return roles;
}
