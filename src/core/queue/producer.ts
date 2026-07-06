import type { JobsOptions } from 'bullmq';
import { getDiscoverQueue, getVerifyQueue } from './queues';

// Enqueue helpers with deterministic BullMQ jobIds (`discover-<id>` / `verify-<id>`).
// A duplicate enqueue (double-submit, sweeper re-run) collapses to the same BullMQ
// job - a second dedup layer over the DB UNIQUE(org, idempotency_key).
// The separator is '-' not ':' because BullMQ forbids ':' in custom job ids.

const STAGE_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export async function enqueueDiscover(jobId: string): Promise<void> {
  await getDiscoverQueue().add(
    'discover',
    { jobId },
    { ...STAGE_OPTS, jobId: `discover-${jobId}` },
  );
}

export async function enqueueVerify(jobId: string): Promise<void> {
  await getVerifyQueue().add('verify', { jobId }, { ...STAGE_OPTS, jobId: `verify-${jobId}` });
}
