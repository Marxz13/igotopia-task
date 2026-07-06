import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { JobStatus } from '@/core/contract';
import { getDb } from '@/core/db/client';
import { creditLedger, jobs, organizations, type JobRow } from '@/core/db/schema';

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

/** Conditional advance: moves the row only if it is still in `from`. Returns true if
 * it moved. Lets a concurrent cancel win — the worker can't clobber a cancelled job.
 * A same-state advance (from === to) is an idempotent no-op that still returns true. */
export async function advanceJobStatus(
  jobId: string,
  from: JobStatus,
  to: JobStatus,
  patch: JobStatusPatch = {},
): Promise<boolean> {
  const rows = await getDb()
    .update(jobs)
    .set({
      status: to,
      updatedAt: new Date(),
      ...(patch.startedAt ? { startedAt: patch.startedAt } : {}),
      ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
      ...('error' in patch ? { error: patch.error ?? null } : {}),
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, from)))
    .returning();
  return rows.length > 0;
}

/** Org-scoped cancel: flips a still-running job to cancelled AND refunds the one credit
 * the search charged, in a single transaction, so a job is never left cancelled-but-
 * unrefunded. Returns the updated row, or null when the job doesn't exist for this org or
 * is already terminal (no flip, no refund). The flip's WHERE status IN (non-terminal) can
 * match at most once, so the refund runs exactly once; the ledger's UNIQUE(job_id, reason)
 * is a second guard against a double refund. */
export async function cancelJob(orgId: string, jobId: string): Promise<JobRow | null> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(jobs)
      .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.organizationId, orgId),
          inArray(jobs.status, ['queued', 'discovering', 'verifying']),
        ),
      )
      .returning();

    const cancelled = rows[0];
    if (!cancelled) return null; // not ours, or already terminal — nothing to refund

    // Give the credit back. balance_after is read from the increment so the ledger stays
    // a truthful running balance, mirroring the search_charge row written at start.
    const credited = await tx
      .update(organizations)
      .set({ credits: sql`${organizations.credits} + 1` })
      .where(eq(organizations.id, orgId))
      .returning({ credits: organizations.credits });

    await tx
      .insert(creditLedger)
      .values({
        organizationId: orgId,
        jobId,
        delta: 1,
        reason: 'refund',
        balanceAfter: credited[0]?.credits ?? 0,
      })
      .onConflictDoNothing({ target: [creditLedger.jobId, creditLedger.reason] });

    return cancelled;
  });
}

/** System-scoped status read, used by the worker's cooperative cancellation checks. */
export async function getJobStatusSystem(jobId: string): Promise<JobStatus | null> {
  const rows = await getDb()
    .select({ status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const status = rows[0]?.status;
  return status ? (status as JobStatus) : null;
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
