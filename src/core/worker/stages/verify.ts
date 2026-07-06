import { loadConfig } from '@/core/config';
import { getLogger } from '@/core/logger';
import { getVerifyProvider } from '@/core/providers';
import { appendJobEvent } from '@/core/repositories/job-event-repository';
import {
  advanceJobStatus,
  findJobByIdSystem,
  setVerifyCounts,
} from '@/core/repositories/job-repository';
import {
  countByState,
  listUnverified,
  setLeadRejected,
  setLeadVerified,
} from '@/core/repositories/lead-repository';
import { cancellableSleep } from '../delay';
import { isTerminal } from '../state-machine';

// Verify stage: score only the still-unverified leads (so a re-run never re-scores a
// settled lead), set the counts from the actual rows, then complete. With 0 leads,
// complete with an empty inbox (a valid terminal state, not a hang). Cancellable: a
// cancel during the delay, or before the final advance, stops the job as cancelled.
export async function runVerifyStage(jobId: string): Promise<void> {
  const job = await findJobByIdSystem(jobId);
  if (!job) {
    getLogger().warn({ jobId }, 'verify: job not found — skipping');
    return;
  }
  if (isTerminal(job.status)) return; // already finished (redelivery / cancel) - no-op

  const log = getLogger().child({ jobId, orgId: job.organizationId });
  const org = job.organizationId;
  const provider = getVerifyProvider();
  const unverified = await listUnverified(jobId);

  if (unverified.length > 0) {
    await appendJobEvent(
      org,
      jobId,
      'verifying',
      `Verifying ${unverified.length} lead${unverified.length === 1 ? '' : 's'}`,
    );
  }

  // Visible, cancellable pause before scoring.
  if ((await cancellableSleep(jobId, loadConfig().STAGE_DELAY_MS)) === 'cancelled') {
    log.info('verify: cancelled during delay');
    return;
  }

  for (const lead of unverified) {
    const result = await provider.verify({
      candidateKey: lead.candidateKey,
      name: lead.name,
      company: lead.company,
      title: lead.title,
      email: lead.email,
      sourceUrl: lead.sourceUrl,
    });
    if (result.ok) await setLeadVerified(lead.id, result.score, result.factors);
    else await setLeadRejected(lead.id, result.reason);
  }

  const counts = await countByState(jobId);
  await setVerifyCounts(jobId, { verified: counts.verified, rejected: counts.rejected });

  // Guarded completion: a cancel during verify wins, and the job stays cancelled.
  if (!(await advanceJobStatus(jobId, 'verifying', 'completed', { completedAt: new Date() }))) {
    log.info('verify: not completing (cancelled or already moved)');
    return;
  }
  await appendJobEvent(
    org,
    jobId,
    'completed',
    `Completed — ${counts.verified} verified, ${counts.rejected} rejected`,
    { verified: counts.verified, rejected: counts.rejected },
  );
  log.info({ ...counts }, 'verify: completed');
}
