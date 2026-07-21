/**
 * Batch-resolve user IDs to names for createdBy/updatedBy display.
 * Accepts an array of records with optional createdBy/updatedBy string fields,
 * returns a Map of userId → { name, email }.
 */
export async function resolveUserIds(
  db: { user: { findMany: (args: { where: { id: { in: string[] } }; select: { id: true; name: true; email: true } }) => Promise<Array<{ id: string; name: string | null; email: string | null }>> } },
  userIds: (string | null | undefined)[],
): Promise<Map<string, { name: string | null; email: string | null }>> {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
}

export function userDisplay(map: Map<string, { name: string | null; email: string | null }>, id: string | null | undefined): string | null {
  if (!id) return null;
  const u = map.get(id);
  return u?.name ?? u?.email ?? null;
}
