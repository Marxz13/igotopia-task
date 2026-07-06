import { getLogger } from '@/core/logger';
import { enqueueDiscover, enqueueVerify } from '@/core/queue/producer';
import { getDiscoverQueue, getVerifyQueue } from '@/core/queue/queues';
import { listNonTerminalJobs } from '@/core/repositories/job-repository';

// Reconciler for the enqueue-after-commit gap (DB committed, enqueue lost -> job
// stuck) and startup recovery. Finds non-terminal jobs whose queue job is missing
// and re-enqueues at the right stage; deterministic jobIds make re-enqueue safe.
// (A transactional outbox is the production-grade fix.)
export async function runSweep(): Promise<number> {
  const jobs = await listNonTerminalJobs();
  let reenqueued = 0;

  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'discovering') {
      if (!(await getDiscoverQueue().getJob(`discover:${job.id}`))) {
        await enqueueDiscover(job.id);
        reenqueued++;
      }
    } else if (job.status === 'verifying') {
      if (!(await getVerifyQueue().getJob(`verify:${job.id}`))) {
        await enqueueVerify(job.id);
        reenqueued++;
      }
    }
  }

  if (reenqueued > 0) getLogger().info({ reenqueued }, 'sweeper: re-enqueued stuck jobs');
  return reenqueued;
}
