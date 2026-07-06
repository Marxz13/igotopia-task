import { and, asc, eq } from 'drizzle-orm';
import type { JobEventType } from '@/core/contract';
import { getDb } from '@/core/db/client';
import { getLogger } from '@/core/logger';
import { jobEvents, type JobEventRow } from '@/core/db/schema';

// The job run log. Appends are best-effort: a logging failure must never break the
// pipeline, so appendJobEvent swallows its own errors. Reads are org-scoped.

export async function appendJobEvent(
  orgId: string,
  jobId: string,
  type: JobEventType,
  message: string,
  data?: Record<string, number | string | boolean>,
): Promise<void> {
  try {
    await getDb()
      .insert(jobEvents)
      .values({ organizationId: orgId, jobId, type, message, data: data ?? null });
  } catch (err) {
    getLogger().warn(
      { jobId, type, err: err instanceof Error ? err.message : String(err) },
      'failed to append job event',
    );
  }
}

/** Org-scoped read for the timeline, oldest first. A foreign jobId returns no rows. */
export async function listJobEventsByOrg(orgId: string, jobId: string): Promise<JobEventRow[]> {
  return getDb()
    .select()
    .from(jobEvents)
    .where(and(eq(jobEvents.organizationId, orgId), eq(jobEvents.jobId, jobId)))
    .orderBy(asc(jobEvents.createdAt), asc(jobEvents.id));
}
