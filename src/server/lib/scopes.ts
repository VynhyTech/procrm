import type { PrismaClient } from "@prisma/client";

async function scopeNamesForRoleFilter(
  db: PrismaClient,
  userId: string,
  roleOrgId: string | null,
): Promise<string[]> {
  const userRoles = await db.userRole.findMany({
    where: { userId, role: { orgId: roleOrgId } },
    select: {
      role: {
        select: {
          scopes: { select: { scope: { select: { name: true } } } },
        },
      },
    },
  });

  const names = new Set<string>();
  for (const userRole of userRoles) {
    for (const roleScope of userRole.role.scopes) {
      names.add(roleScope.scope.name);
    }
  }
  return [...names];
}

/** Scopes granted by platform/system roles (Role.orgId === null) — independent of which org is active. */
export async function getPlatformScopes(db: PrismaClient, userId: string): Promise<string[]> {
  return scopeNamesForRoleFilter(db, userId, null);
}

/** Platform scopes unioned with scopes granted by org-specific roles for the active org. */
export async function getEffectiveScopes(
  db: PrismaClient,
  userId: string,
  orgId: string | null,
): Promise<string[]> {
  const platformScopes = await getPlatformScopes(db, userId);
  if (!orgId) return platformScopes;

  const orgScopes = await scopeNamesForRoleFilter(db, userId, orgId);
  return [...new Set([...platformScopes, ...orgScopes])];
}
