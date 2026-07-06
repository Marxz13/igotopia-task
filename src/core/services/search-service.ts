import { and, eq, sql } from 'drizzle-orm';
import type { JobStatus, SearchRequest } from '@/core/contract';
import { getDb } from '@/core/db/client';
import { creditLedger, jobs, organizations } from '@/core/db/schema';
import { InsufficientCreditsError } from '@/core/errors';
import { getLogger } from '@/core/logger';
import { enqueueDiscover } from '@/core/queue/producer';
import { appendJobEvent } from '@/core/repositories/job-event-repository';

// The money path. One Postgres transaction atomically creates the job, charges
// one credit, and writes the ledger row, or rolls it all back. No provider work
// runs here; discovery is enqueued after commit and runs in the separate worker
// process.

export interface StartSearchInput {
  orgId: string;
  userId: string;
  idempotencyKey: string;
  request: SearchRequest;
}

export interface StartSearchResult {
  jobId: string;
  status: JobStatus;
  replayed: boolean;
}

export async function startSearch(input: StartSearchInput): Promise<StartSearchResult> {
  const result = await getDb().transaction(async (tx) => {
    // 1. Insert the job; UNIQUE(org, idempotency_key) collapses a double-submit.
    const inserted = await tx
      .insert(jobs)
      .values({
        organizationId: input.orgId,
        createdByUserId: input.userId,
        status: 'queued',
        requestJson: input.request,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: [jobs.organizationId, jobs.idempotencyKey] })
      .returning({ id: jobs.id });

    const jobRow = inserted[0];
    if (!jobRow) {
      // Duplicate submit: replay the one existing job, no second charge.
      const existing = await tx
        .select({ id: jobs.id, status: jobs.status })
        .from(jobs)
        .where(
          and(eq(jobs.organizationId, input.orgId), eq(jobs.idempotencyKey, input.idempotencyKey)),
        )
        .limit(1);
      const row = existing[0];
      if (!row) throw new Error('idempotency conflict with no existing job');
      // Report the existing job's REAL status (may already be discovering/completed),
      // not a stale 'queued' — a client polling the replay must see backend truth.
      return { jobId: row.id, status: row.status as JobStatus, replayed: true };
    }

    // 2. Atomic check-and-decrement: the WHERE credits >= 1 makes it indivisible
    //    (no read-then-write race). 0 rows affected means insufficient balance.
    const charged = await tx
      .update(organizations)
      .set({ credits: sql`${organizations.credits} - 1` })
      .where(and(eq(organizations.id, input.orgId), sql`${organizations.credits} >= 1`))
      .returning({ credits: organizations.credits });

    const chargedRow = charged[0];
    if (!chargedRow) {
      // Throwing rolls the tx back: the job insert above is undone (no orphan job,
      // no ledger row). The route maps this to 402.
      throw new InsufficientCreditsError('Insufficient credits for this organization');
    }

    // 3. Append the audit ledger row in the same transaction.
    await tx.insert(creditLedger).values({
      organizationId: input.orgId,
      jobId: jobRow.id,
      delta: -1,
      reason: 'search_charge',
      balanceAfter: chargedRow.credits,
    });

    return { jobId: jobRow.id, status: 'queued' as JobStatus, replayed: false };
  });

  // 4. Enqueue AFTER commit, best-effort. The committed job is the source of truth, so
  //    the jobId is returned no matter what happens here; if this throws (e.g. a Redis
  //    blip) the sweeper re-enqueues the stuck job within its interval. Deterministic
  //    jobId makes a replay's re-enqueue a harmless no-op.
  if (!result.replayed) {
    await appendJobEvent(input.orgId, result.jobId, 'queued', 'Search queued');
  }
  try {
    await enqueueDiscover(result.jobId);
  } catch (err) {
    getLogger().warn(
      { jobId: result.jobId, err: err instanceof Error ? err.message : String(err) },
      'enqueue failed after commit — sweeper will recover',
    );
  }
  getLogger().info(
    { jobId: result.jobId, orgId: input.orgId, replayed: result.replayed },
    'search started',
  );

  return { jobId: result.jobId, status: result.status, replayed: result.replayed };
}
