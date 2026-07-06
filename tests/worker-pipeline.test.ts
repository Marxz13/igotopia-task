import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SearchRequest } from '@/core/contract';
import { EMPTY_COMPANY } from '@/core/providers';
import { startSearch } from '@/core/services/search-service';
import { listLeadsByOrg } from '@/core/repositories/lead-repository';
import { runDiscoverStage } from '@/core/worker/stages/discover';
import { runVerifyStage } from '@/core/worker/stages/verify';
import { MARZLABS, MARZ, leadCount, requireJob, resetDb } from './helpers/db';

const req: SearchRequest = {
  companies: ['Marriott'],
  roles: ['Director of Sales'],
  region: 'Malaysia',
};

beforeEach(resetDb);
afterEach(() => {
  delete process.env.CRASH_AFTER_DISCOVER;
});

async function start(key: string, request: SearchRequest = req): Promise<string> {
  const { jobId } = await startSearch({
    orgId: MARZLABS,
    userId: MARZ,
    idempotencyKey: key,
    request,
  });
  return jobId;
}

describe('two-stage pipeline', () => {
  it('discover -> verify -> completed; counts sum; verify rules applied', async () => {
    const jobId = await start('p1');

    await runDiscoverStage(jobId);
    let job = await requireJob(jobId);
    expect(job.status).toBe('verifying');
    expect(job.discoveredCount).toBeGreaterThanOrEqual(3);
    const raw = await listLeadsByOrg(MARZLABS, { jobId });
    expect(raw.every((l) => l.state === 'unverified_raw')).toBe(true);

    await runVerifyStage(jobId);
    job = await requireJob(jobId);
    expect(job.status).toBe('completed');
    expect(job.verifiedCount + job.rejectedCount).toBe(job.discoveredCount);

    const leads = await listLeadsByOrg(MARZLABS, { jobId });
    expect(
      leads.filter((l) => l.state === 'verified').every((l) => typeof l.score === 'number'),
    ).toBe(true);
    expect(
      leads.filter((l) => l.state === 'rejected').every((l) => Boolean(l.rejectionReason)),
    ).toBe(true);
  });

  it('crash after discover -> re-run inserts 0 duplicate leads, recovers to completed', async () => {
    const jobId = await start('crash');

    process.env.CRASH_AFTER_DISCOVER = '1';
    await expect(runDiscoverStage(jobId)).rejects.toThrow();
    const afterCrash = await leadCount(jobId);
    expect(afterCrash).toBeGreaterThanOrEqual(3);

    process.env.CRASH_AFTER_DISCOVER = '0';
    await runDiscoverStage(jobId); // stalled re-pick
    expect(await leadCount(jobId)).toBe(afterCrash); // idempotent insert -> no dups

    await runVerifyStage(jobId);
    expect((await requireJob(jobId)).status).toBe('completed');
  });

  it('redelivery — re-running stages does not duplicate leads or drift counts', async () => {
    const jobId = await start('redeliver');

    await runDiscoverStage(jobId);
    const afterDiscover = await leadCount(jobId);
    await runDiscoverStage(jobId); // discover redelivery before verify
    expect(await leadCount(jobId)).toBe(afterDiscover);

    await runVerifyStage(jobId);
    const done = await requireJob(jobId);
    await runVerifyStage(jobId); // verify redelivery on a terminal job -> no-op
    const again = await requireJob(jobId);
    expect(await leadCount(jobId)).toBe(afterDiscover);
    expect(again.verifiedCount).toBe(done.verifiedCount);
    expect(again.rejectedCount).toBe(done.rejectedCount);
    expect(again.verifiedCount + again.rejectedCount).toBe(again.discoveredCount);
  });

  it('0-candidate sentinel -> completed with an empty inbox', async () => {
    const jobId = await start('empty', { companies: [EMPTY_COMPANY], roles: [], region: '' });
    await runDiscoverStage(jobId);
    await runVerifyStage(jobId);
    const job = await requireJob(jobId);
    expect(job.status).toBe('completed');
    expect(job.discoveredCount).toBe(0);
    expect((await listLeadsByOrg(MARZLABS, { jobId })).length).toBe(0);
  });
});
