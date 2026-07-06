import { and, eq } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { memberships } from '@/core/db/schema';

// Checks whether a user may act in an org. Used to validate an active-org switch
// and to build the org list for GET /api/me.
export async function isMember(userId: string, orgId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)))
    .limit(1);
  return rows.length > 0;
}

export async function listOrgIdsForUser(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ orgId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return rows.map((r) => r.orgId);
}
