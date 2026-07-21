import { TRPCError } from "@trpc/server";

/**
 * In-memory cache for org status — avoids DB hit on every mutation.
 * 60-second TTL. Suspended orgs blocked within 60s max.
 */
const orgStatusCache = new Map<string, { status: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function requireActiveOrg(db: any, orgId: string | null): Promise<string> {
  if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "No organization selected" });

  // Check cache first
  const cached = orgStatusCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.status === "suspended") throw new TRPCError({ code: "FORBIDDEN", message: "This organization has been suspended." });
    if (cached.status === "inactive") throw new TRPCError({ code: "FORBIDDEN", message: "This organization is inactive." });
    return orgId;
  }

  // Cache miss — query DB
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { status: true } });
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

  orgStatusCache.set(orgId, { status: org.status, expiresAt: Date.now() + CACHE_TTL_MS });

  if (org.status === "suspended") throw new TRPCError({ code: "FORBIDDEN", message: "This organization has been suspended." });
  if (org.status === "inactive") throw new TRPCError({ code: "FORBIDDEN", message: "This organization is inactive." });
  return orgId;
}

interface AuditChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

interface AuditParams {
  orgId: string | null;
  userId: string;
  entityType: string;
  entityId?: string;
  action: string;
  changes?: AuditChange[];
}

export async function logAudit(db: any, params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        orgId: params.orgId,
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        action: params.action,
        changes: params.changes ? JSON.stringify(params.changes) : null,
      },
    });
  } catch {
    console.error("Failed to write audit log");
  }
}

export function diffChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: string[],
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (oldVal !== newVal && newVal !== undefined) {
      changes.push({
        field,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
      });
    }
  }
  return changes;
}
