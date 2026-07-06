import { getLogger } from '@/core/logger';
import { getVerifyProvider } from '@/core/providers';
import {
  findJobByIdSystem,
  setJobStatus,
  setVerifyCounts,
} from '@/core/repositories/job-repository';
import {
  countByState,
  listUnverified,
  setLeadRejected,
  setLeadVerified,
} from '@/core/repositories/lead-repository';
import { isTerminal } from '../state-machine';

// Verify stage: score only the still-unverified leads (so a re-run never re-scores a
// settled lead), set the counts from the actual rows, then complete. With 0 leads,
// complete with an empty inbox (a valid terminal state, not a hang).
export async function runVerifyStage(jobId: string): Promise<void> {
  const job = await findJobByIdSystem(jobId);
  if (!job) {
    getLogger().warn({ jobId }, 'verify: job not found — skipping');
    return;
  }
  if (isTerminal(job.status)) return; // already finished (redelivery) - no-op

  const log = getLogger().child({ jobId, orgId: job.organizationId });
  const provider = getVerifyProvider();

  for (const lead of await listUnverified(jobId)) {
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
  await setJobStatus(jobId, 'completed', { completedAt: new Date() });
  log.info({ ...counts }, 'verify: completed');
}
