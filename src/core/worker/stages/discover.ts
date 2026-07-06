import type { JobStatus } from '@/core/contract';
import { loadConfig } from '@/core/config';
import { getLogger } from '@/core/logger';
import { getDiscoverProvider } from '@/core/providers';
import { enqueueVerify } from '@/core/queue/producer';
import { appendJobEvent } from '@/core/repositories/job-event-repository';
import {
  advanceJobStatus,
  findJobByIdSystem,
  setDiscoveredCount,
} from '@/core/repositories/job-repository';
import { insertCandidates } from '@/core/repositories/lead-repository';
import { CrashAfterDiscover } from '../crash-signal';
import { cancellableSleep } from '../delay';
import { isTerminal } from '../state-machine';

// Discover stage: status -> discovering, run the provider, idempotently insert the
// candidates, SET discovered_count, checkpoint -> verifying, enqueue verify. Safe to
// re-run: the insert conflicts on every existing row and the count is SET, not added.
// Cancellable: a cancel during the delay or before the advance stops the pipeline.
export async function runDiscoverStage(jobId: string): Promise<void> {
  const job = await findJobByIdSystem(jobId);
  if (!job) {
    getLogger().warn({ jobId }, 'discover: job not found — skipping');
    return;
  }
  if (isTerminal(job.status)) return; // already finished (redelivery / cancel) - no-op

  const log = getLogger().child({ jobId, orgId: job.organizationId });
  const org = job.organizationId;
  const rerun = job.status === 'discovering'; // re-entered after a crash / stalled re-pick

  // Guarded entry: only claims the job if it's still in the state we read. A cancel
  // that landed in the meantime flips the status and this becomes a no-op -> stop.
  if (
    !(await advanceJobStatus(jobId, job.status as JobStatus, 'discovering', {
      startedAt: new Date(),
    }))
  ) {
    log.info('discover: could not enter (cancelled or already moved)');
    return;
  }
  await appendJobEvent(
    org,
    jobId,
    rerun ? 'recovered' : 'discovering',
    rerun ? 'Re-running discovery after an interruption' : 'Discovery started',
  );

  // Visible, cancellable pause so the stage can be watched and cancelled mid-flight.
  if ((await cancellableSleep(jobId, loadConfig().STAGE_DELAY_MS)) === 'cancelled') {
    log.info('discover: cancelled during delay');
    return;
  }

  const candidates = await getDiscoverProvider().discover(job.requestJson, jobId);
  await insertCandidates(
    candidates.map((c) => ({
      organizationId: org,
      jobId,
      name: c.name,
      company: c.company,
      title: c.title,
      email: c.email,
      sourceUrl: c.sourceUrl,
      candidateKey: c.candidateKey,
    })),
  );
  await setDiscoveredCount(jobId, candidates.length);
  await appendJobEvent(
    org,
    jobId,
    'discovered',
    `Discovered ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`,
    { discovered: candidates.length },
  );
  log.info({ discovered: candidates.length }, 'discover: leads inserted');

  // Crash hook: simulate a hard crash right after the idempotent insert but before
  // advancing. On restart, re-discovery inserts 0 dups and the job continues.
  if (loadConfig().CRASH_AFTER_DISCOVER) {
    log.warn('CRASH_AFTER_DISCOVER set — crashing after discover');
    await appendJobEvent(org, jobId, 'crashed', 'Worker crashed after discovery (simulated)');
    throw new CrashAfterDiscover();
  }

  // Guarded advance: if a cancel landed during discovery, this is a no-op -> stop, and
  // we never enqueue verify. Otherwise move discovering -> verifying.
  if (!(await advanceJobStatus(jobId, 'discovering', 'verifying'))) {
    log.info('discover: not advancing (cancelled or already moved)');
    return;
  }
  await enqueueVerify(jobId);
}
