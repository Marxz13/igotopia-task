import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { organizations, type Organization } from '@/core/db/schema';

export async function findOrgById(id: string): Promise<Organization | null> {
  const rows = await getDb().select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listOrgsByIds(ids: string[]): Promise<Organization[]> {
  if (ids.length === 0) return [];
  return getDb().select().from(organizations).where(inArray(organizations.id, ids));
}
