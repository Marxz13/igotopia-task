import { and, desc, eq, inArray } from 'drizzle-orm';
import type { JobStatus } from '@/core/contract';
import { getDb } from '@/core/db/client';
import { jobs, type JobRow } from '@/core/db/schema';

// Org-scoped reads (the API tenancy layer)
// Every method takes orgId first; no unscoped read is exposed to the API, so
// cross-org access is structurally impossible. A miss returns null -> route 404
// (never 403), so "not yours" can't be told apart from "doesn't exist".

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

// Worker / system-scoped mutations
// The worker is system-scoped - it looks a job up by id and copies organization_id
// onto every lead it inserts. Counts are always SET (never incremented), so a
// re-run recomputes the same values with no drift.

export async function findJobByIdSystem(jobId: string): Promise<JobRow | null> {
  const rows = await getDb().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}

export interface JobStatusPatch {
  startedAt?: Date;
  completedAt?: Date;
  error?: string | null;
}

export async function setJobStatus(
  jobId: string,
  status: JobStatus,
  patch: JobStatusPatch = {},
): Promise<void> {
  await getDb()
    .update(jobs)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch.startedAt ? { startedAt: patch.startedAt } : {}),
      ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
      ...('error' in patch ? { error: patch.error ?? null } : {}),
    })
    .where(eq(jobs.id, jobId));
}

export async function setDiscoveredCount(jobId: string, discoveredCount: number): Promise<void> {
  await getDb()
    .update(jobs)
    .set({ discoveredCount, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

export async function setVerifyCounts(
  jobId: string,
  counts: { verified: number; rejected: number },
): Promise<void> {
  await getDb()
    .update(jobs)
    .set({ verifiedCount: counts.verified, rejectedCount: counts.rejected, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

/** Non-terminal jobs - the sweeper re-enqueues any with no active BullMQ job. */
export async function listNonTerminalJobs(): Promise<JobRow[]> {
  return getDb()
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ['queued', 'discovering', 'verifying']));
}
