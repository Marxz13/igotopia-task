import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { jobs, type JobRow } from '@/core/db/schema';

// Org-scoped job reads. Every method takes orgId first and there is no unscoped
// fetch exposed to the API, so cross-org access isn't possible. A miss returns null,
// which the route maps to 404 (never 403) so it can't reveal whether a record exists.

export async function getJobById(orgId: string, jobId: string): Promise<JobRow | null> {
  const rows = await getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listJobsByOrg(orgId: string): Promise<JobRow[]> {
  return getDb()
    .select()
    .from(jobs)
    .where(eq(jobs.organizationId, orgId))
    .orderBy(desc(jobs.createdAt));
}
