import { Worker, type Job } from 'bullmq';
import { loadConfig } from '@/core/config';
import { closeDb } from '@/core/db/client';
import { getLogger } from '@/core/logger';
import { closeRedis, getRedis } from '@/core/queue/connection';
import { QUEUE_NAMES, type StageJobData } from '@/core/queue/queues';
import { findJobByIdSystem, setJobStatus } from '@/core/repositories/job-repository';
import { CrashAfterDiscover } from './crash-signal';
import { runDiscoverStage } from './stages/discover';
import { runVerifyStage } from './stages/verify';
import { isTerminal } from './state-machine';
import { runSweep } from './sweeper';

// Shared worker core: boots the discover + verify BullMQ Workers and the sweeper,
// surfaces exhausted failures onto the PG job row, and drains cleanly on SIGTERM.

const SWEEP_INTERVAL_MS = 10_000;

export async function runWorker(): Promise<void> {
  const log = getLogger();
  const { WORKER_CONCURRENCY } = loadConfig();
  const connection = getRedis();
  const opts = { connection, concurrency: WORKER_CONCURRENCY };

  const discoverWorker = new Worker<StageJobData>(
    QUEUE_NAMES.discover,
    (job) => runDiscoverStage(job.data.jobId),
    opts,
  );
  const verifyWorker = new Worker<StageJobData>(
    QUEUE_NAMES.verify,
    (job) => runVerifyStage(job.data.jobId),
    opts,
  );

  async function onFailed(
    queue: string,
    job: Job<StageJobData> | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) {
      log.error({ queue, err: err.message }, 'job failed with no job ref');
      return;
    }
    const jobId = job.data.jobId;

    // Crash hook: exit the whole process to simulate a hard crash after the
    // idempotent discover insert. On restart, BullMQ's stalled recovery re-runs it.
    if (err instanceof CrashAfterDiscover || err.name === 'CrashAfterDiscover') {
      log.error({ jobId }, 'CRASH_AFTER_DISCOVER — exiting to simulate crash');
      process.exit(1);
    }

    // Only after all retries are exhausted do we mark the job failed (readable error
    // surfaced to the UI); earlier attempts just log and let BullMQ back off + retry.
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      const current = await findJobByIdSystem(jobId);
      if (current && !isTerminal(current.status)) {
        await setJobStatus(jobId, 'failed', { error: err.message });
      }
      log.error({ jobId, queue, err: err.message }, 'job failed (attempts exhausted)');
    } else {
      log.warn(
        { jobId, queue, attempt: job.attemptsMade, err: err.message },
        'job attempt failed — retrying',
      );
    }
  }

  discoverWorker.on('failed', (job, err) => void onFailed('discover', job, err));
  verifyWorker.on('failed', (job, err) => void onFailed('verify', job, err));
  discoverWorker.on('error', (err) => log.error({ err: err.message }, 'discover worker error'));
  verifyWorker.on('error', (err) => log.error({ err: err.message }, 'verify worker error'));

  // Startup recovery + periodic reconciliation of stuck jobs.
  await runSweep().catch((err: unknown) => log.error({ err }, 'initial sweep failed'));
  const sweepTimer = setInterval(() => {
    void runSweep().catch((err: unknown) => log.error({ err }, 'sweep failed'));
  }, SWEEP_INTERVAL_MS);

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'worker: draining');
    clearInterval(sweepTimer);
    await Promise.allSettled([discoverWorker.close(), verifyWorker.close()]);
    await closeRedis();
    await closeDb();
    log.info('worker: stopped');
    process.exit(0);
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  log.info({ concurrency: WORKER_CONCURRENCY }, 'worker: started (discover + verify + sweeper)');
}
