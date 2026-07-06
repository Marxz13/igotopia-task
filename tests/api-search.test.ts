import { beforeEach, describe, expect, it } from 'vitest';
import { startSearch } from '@/core/services/search-service';
import { enforceSearchRateLimit, searchRateLimitKey } from '@/core/services/rate-limiter';
import { getRedis } from '@/core/queue/connection';
import { buildMe } from '@/core/services/auth-service';
import { getJobById } from '@/core/repositories/job-repository';
import { listLeadsByOrg } from '@/core/repositories/lead-repository';
import { runDiscoverStage } from '@/core/worker/stages/discover';
import {
  MARZLABS,
  MARZ,
  ALLAN,
  ALLANINC,
  credits,
  jobCount,
  ledgerCount,
  resetDb,
} from './helpers/db';

const req = { companies: ['Marriott'], roles: ['Director of Sales'], region: 'Malaysia' };

beforeEach(resetDb);

describe('POST /api/searches — atomic charge + idempotency', () => {
  it('charges exactly one credit and creates one job', async () => {
    const r = await startSearch({
      orgId: MARZLABS,
      userId: MARZ,
      idempotencyKey: 'k1',
      request: req,
    });
    expect(r.replayed).toBe(false);
    expect(await credits(MARZLABS)).toBe(9);
    expect(await ledgerCount(MARZLABS)).toBe(1);
  });

  it('replay reports the existing job real status, not a stale queued', async () => {
    const first = await startSearch({
      orgId: MARZLABS,
      userId: MARZ,
      idempotencyKey: 'k1',
      request: req,
    });
    await runDiscoverStage(first.jobId); // advance past 'queued' -> 'verifying'
    const replay = await startSearch({
      orgId: MARZLABS,
      userId: MARZ,
      idempotencyKey: 'k1',
      request: req,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.status).not.toBe('queued');
    expect(replay.status).toBe((await getJobById(MARZLABS, first.jobId))?.status);
  });

  it('double-submit with the same key replays one job, no second charge', async () => {
    const first = await startSearch({
      orgId: MARZLABS,
      userId: MARZ,
      idempotencyKey: 'k1',
      request: req,
    });
    const second = await startSearch({
      orgId: MARZLABS,
      userId: MARZ,
      idempotencyKey: 'k1',
      request: req,
    });
    expect(second.replayed).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(await credits(MARZLABS)).toBe(9);
    expect(await ledgerCount(MARZLABS)).toBe(1);
  });

  it('concurrent double-click (same key) -> one job, one charge', async () => {
    const [a, b] = await Promise.all([
      startSearch({ orgId: MARZLABS, userId: MARZ, idempotencyKey: 'kc', request: req }),
      startSearch({ orgId: MARZLABS, userId: MARZ, idempotencyKey: 'kc', request: req }),
    ]);
    expect(a.jobId).toBe(b.jobId);
    expect([a, b].filter((r) => r.replayed).length).toBe(1);
    expect(await credits(MARZLABS)).toBe(9);
    expect(await ledgerCount(MARZLABS)).toBe(1);
  });

  it('distinct keys -> two jobs, two charges', async () => {
    await startSearch({ orgId: MARZLABS, userId: MARZ, idempotencyKey: 'k1', request: req });
    await startSearch({ orgId: MARZLABS, userId: MARZ, idempotencyKey: 'k2', request: req });
    expect(await credits(MARZLABS)).toBe(8);
    expect(await jobCount(MARZLABS)).toBe(2);
  });

  it('insufficient credits -> 402 with full rollback (no job, no ledger row)', async () => {
    await startSearch({ orgId: ALLANINC, userId: ALLAN, idempotencyKey: 'g1', request: req });
    expect(await credits(ALLANINC)).toBe(0);
    await expect(
      startSearch({ orgId: ALLANINC, userId: ALLAN, idempotencyKey: 'g2', request: req }),
    ).rejects.toMatchObject({ code: 'insufficient_credits', status: 402 });
    expect(await credits(ALLANINC)).toBe(0); // never negative
    expect(await jobCount(ALLANINC)).toBe(1); // g2 job rolled back
    expect(await ledgerCount(ALLANINC)).toBe(1); // only the one valid charge
  });
});

describe('tenancy — cross-org access is 404 (invisible)', () => {
  it('org B cannot read org A job or leads; org A can', async () => {
    const { jobId } = await startSearch({
      orgId: MARZLABS,
      userId: MARZ,
      idempotencyKey: 'k1',
      request: req,
    });
    await runDiscoverStage(jobId);
    expect(await getJobById(ALLANINC, jobId)).toBeNull(); // 404 mask
    expect((await listLeadsByOrg(ALLANINC, { jobId })).length).toBe(0);
    expect(await getJobById(MARZLABS, jobId)).not.toBeNull();
  });
});

describe('stale membership — never advertise a revoked active org', () => {
  it('buildMe nulls an activeOrgId the user is not a member of', async () => {
    // MARZ belongs to Marz Labs only; a session pointing at Allan Inc is stale.
    const me = await buildMe(MARZ, ALLANINC);
    expect(me.activeOrgId).toBeNull();
    expect(me.orgs.some((o) => o.id === ALLANINC)).toBe(false);
  });

  it('buildMe keeps an activeOrgId the user still belongs to', async () => {
    const me = await buildMe(ALLAN, ALLANINC); // ALLAN is a member of Allan Inc
    expect(me.activeOrgId).toBe(ALLANINC);
  });
});

describe('rate limit — start search per org', () => {
  // Node coerces `process.env.X = undefined` to the string "undefined", so restore by
  // deleting when the var was originally unset.
  function setEnv(key: string, value: string | undefined): void {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  async function withRateEnv(max: string, windowMs: string, fn: () => Promise<void>) {
    const prevMax = process.env.RATE_LIMIT_MAX;
    const prevWin = process.env.RATE_LIMIT_WINDOW_MS;
    setEnv('RATE_LIMIT_MAX', max);
    setEnv('RATE_LIMIT_WINDOW_MS', windowMs);
    try {
      await fn();
    } finally {
      setEnv('RATE_LIMIT_MAX', prevMax);
      setEnv('RATE_LIMIT_WINDOW_MS', prevWin);
    }
  }

  beforeEach(async () => {
    await getRedis().del(searchRateLimitKey(MARZLABS), searchRateLimitKey(ALLANINC));
  });

  it('allows up to the cap, then 429s; a different org has its own bucket', async () => {
    await withRateEnv('3', '60000', async () => {
      // long window so it can't expire mid-test
      await enforceSearchRateLimit(MARZLABS);
      await enforceSearchRateLimit(MARZLABS);
      await enforceSearchRateLimit(MARZLABS); // 3 allowed
      await expect(enforceSearchRateLimit(MARZLABS)).rejects.toMatchObject({
        code: 'rate_limited',
        status: 429,
      });
      // A separate org is unaffected by MARZLABS hitting its cap.
      await expect(enforceSearchRateLimit(ALLANINC)).resolves.toBeUndefined();
    });
  });

  it('RATE_LIMIT_MAX=0 disables the limit', async () => {
    await withRateEnv('0', '10000', async () => {
      for (let i = 0; i < 8; i++) await enforceSearchRateLimit(MARZLABS);
    });
  });
});
