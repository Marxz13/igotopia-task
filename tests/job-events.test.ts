import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startSearch } from '@/core/services/search-service';
import { runDiscoverStage } from '@/core/worker/stages/discover';
import { runVerifyStage } from '@/core/worker/stages/verify';
import { advanceJobStatus, cancelJob, getJobById } from '@/core/repositories/job-repository';
import { listJobEventsByOrg } from '@/core/repositories/job-event-repository';
import {
  ALLANINC,
  MARZ,
  MARZLABS,
  credits,
  leadCount,
  ledgerCount,
  requireJob,
  resetDb,
} from './helpers/db';

const req = { companies: ['Marriott'], roles: ['Director of Sales'], region: 'Malaysia' };

beforeEach(resetDb);
afterEach(() => {
  delete process.env.CRASH_AFTER_DISCOVER;
  process.env.STAGE_DELAY_MS = '0';
});

async function start(key: string): Promise<string> {
  const { jobId } = await startSearch({
    orgId: MARZLABS,
    userId: MARZ,
    idempotencyKey: key,
    request: req,
  });
  return jobId;
}

async function eventTypes(orgId: string, jobId: string): Promise<string[]> {
  return (await listJobEventsByOrg(orgId, jobId)).map((e) => e.type);
}

describe('job run log', () => {
  it('records queued -> discovering -> discovered -> verifying -> completed for a full run', async () => {
    const jobId = await start('e1');
    await runDiscoverStage(jobId);
    await runVerifyStage(jobId);
    expect(await eventTypes(MARZLABS, jobId)).toEqual([
      'queued',
      'discovering',
      'discovered',
      'verifying',
      'completed',
    ]);
  });

  it('is org-scoped: org B sees none of org A job events', async () => {
    const jobId = await start('e2');
    await runDiscoverStage(jobId);
    expect((await listJobEventsByOrg(MARZLABS, jobId)).length).toBeGreaterThan(0);
    expect(await listJobEventsByOrg(ALLANINC, jobId)).toEqual([]);
  });

  it('crash + recover appends a second discovery pass — the previous run stays visible', async () => {
    const jobId = await start('e3');

    process.env.CRASH_AFTER_DISCOVER = '1';
    await expect(runDiscoverStage(jobId)).rejects.toThrow();

    process.env.CRASH_AFTER_DISCOVER = '0';
    await runDiscoverStage(jobId); // recovery re-run
    await runVerifyStage(jobId);

    const seq = await eventTypes(MARZLABS, jobId);
    expect(seq).toContain('crashed');
    expect(seq).toContain('recovered');
    expect(seq.filter((t) => t === 'discovered').length).toBe(2); // two passes
    expect(seq.at(-1)).toBe('completed');
  });
});

describe('cancel', () => {
  it('cancel before discover stops the pipeline (cancelled, nothing discovered)', async () => {
    const jobId = await start('c1');
    expect((await cancelJob(MARZLABS, jobId))?.status).toBe('cancelled');

    await runDiscoverStage(jobId); // worker picks it up but must no-op
    const job = await requireJob(jobId);
    expect(job.status).toBe('cancelled');
    expect(job.discoveredCount).toBe(0);
    expect(await leadCount(jobId)).toBe(0);
  });

  it('guarded advance does not clobber a cancel that landed mid-stage', async () => {
    const jobId = await start('c2');
    await advanceJobStatus(jobId, 'queued', 'discovering'); // worker entered discover
    await cancelJob(MARZLABS, jobId); // cancel lands during the stage
    // Worker tries to advance to verifying — must be refused, cancel wins.
    expect(await advanceJobStatus(jobId, 'discovering', 'verifying')).toBe(false);
    expect((await requireJob(jobId)).status).toBe('cancelled');
  });

  it('cancel during the discover delay stops before any leads are inserted', async () => {
    const jobId = await start('c3');
    process.env.STAGE_DELAY_MS = '800';
    const running = runDiscoverStage(jobId);
    await new Promise((r) => setTimeout(r, 200)); // let it enter the delay
    await cancelJob(MARZLABS, jobId);
    await running;
    const job = await requireJob(jobId);
    expect(job.status).toBe('cancelled');
    expect(await leadCount(jobId)).toBe(0);
  });

  it('cancel is org-scoped: org B cannot cancel org A job', async () => {
    const jobId = await start('c4');
    expect(await cancelJob(ALLANINC, jobId)).toBeNull();
    expect((await getJobById(MARZLABS, jobId))?.status).toBe('queued');
  });

  it('cancel of an already-completed job is a no-op', async () => {
    const jobId = await start('c5');
    await runDiscoverStage(jobId);
    await runVerifyStage(jobId);
    expect(await cancelJob(MARZLABS, jobId)).toBeNull();
    expect((await requireJob(jobId)).status).toBe('completed');
  });

  it('cancel refunds the one credit the search charged', async () => {
    const jobId = await start('r1');
    expect(await credits(MARZLABS)).toBe(9); // charged at start
    expect((await cancelJob(MARZLABS, jobId))?.status).toBe('cancelled');
    expect(await credits(MARZLABS)).toBe(10); // given back
    expect(await ledgerCount(MARZLABS)).toBe(2); // search_charge + refund
  });

  it('cancel is idempotent — a repeat cancel does not double-refund', async () => {
    const jobId = await start('r2');
    await cancelJob(MARZLABS, jobId);
    expect(await cancelJob(MARZLABS, jobId)).toBeNull(); // already cancelled
    expect(await credits(MARZLABS)).toBe(10); // still exactly one refund
    expect(await ledgerCount(MARZLABS)).toBe(2);
  });

  it('a completed job that is "cancelled" is a no-op and refunds nothing', async () => {
    const jobId = await start('r3');
    await runDiscoverStage(jobId);
    await runVerifyStage(jobId);
    expect(await credits(MARZLABS)).toBe(9); // charged, work delivered
    expect(await cancelJob(MARZLABS, jobId)).toBeNull();
    expect(await credits(MARZLABS)).toBe(9); // no refund
  });

  it('a cross-org cancel that fails refunds nobody', async () => {
    const jobId = await start('r4');
    expect(await cancelJob(ALLANINC, jobId)).toBeNull(); // wrong org, no flip
    expect(await credits(MARZLABS)).toBe(9); // charger untouched
    expect(await credits(ALLANINC)).toBe(1); // canceller untouched
  });
});
