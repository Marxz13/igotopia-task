import { loadConfig } from '@/core/config';
import { getLogger } from '@/core/logger';
import { getDiscoverProvider } from '@/core/providers';
import { enqueueVerify } from '@/core/queue/producer';
import {
  findJobByIdSystem,
  setDiscoveredCount,
  setJobStatus,
} from '@/core/repositories/job-repository';
import { insertCandidates } from '@/core/repositories/lead-repository';
import { CrashAfterDiscover } from '../crash-signal';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

// Discover stage: status -> discovering, run the provider, idempotently insert the
// candidates, SET discovered_count, checkpoint -> verifying, enqueue verify. Safe to
// re-run: the insert conflicts on every existing row and the count is SET, not added.
export async function runDiscoverStage(jobId: string): Promise<void> {
  const job = await findJobByIdSystem(jobId);
  if (!job) {
    getLogger().warn({ jobId }, 'discover: job not found — skipping');
    return;
  }
  if (TERMINAL.has(job.status)) return; // already finished (redelivery) - no-op

  const log = getLogger().child({ jobId, orgId: job.organizationId });
  await setJobStatus(jobId, 'discovering', { startedAt: new Date() });

  const candidates = await getDiscoverProvider().discover(job.requestJson, jobId);
  await insertCandidates(
    candidates.map((c) => ({
      organizationId: job.organizationId,
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
  log.info({ discovered: candidates.length }, 'discover: leads inserted');

  // Crash hook: simulate a hard crash right after the idempotent insert but
  // before advancing. On restart, re-discovery inserts 0 dups and the job continues.
  if (loadConfig().CRASH_AFTER_DISCOVER) {
    log.warn('CRASH_AFTER_DISCOVER set — crashing after discover');
    throw new CrashAfterDiscover();
  }

  await setJobStatus(jobId, 'verifying');
  await enqueueVerify(jobId);
}
