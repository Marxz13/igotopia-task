import { describe, expect, it } from 'vitest';
import {
  createMockDiscoverProvider,
  EMPTY_COMPANY,
  FAIL_COMPANY,
} from '@/core/providers/mock-discover';
import { createMockVerifyProvider } from '@/core/providers/mock-verify';

const req = { companies: ['Marriott'], roles: ['Director of Sales'], region: 'Malaysia' };

describe('mock providers', () => {
  const discover = createMockDiscoverProvider();
  const verify = createMockVerifyProvider();

  it('is deterministic per jobId (byte-identical) and varied (>=3)', async () => {
    const a = await discover.discover(req, 'job-1');
    const b = await discover.discover(req, 'job-1');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(new Set(a.map((c) => c.candidateKey)).size).toBe(a.length); // keys unique
  });

  it('differs across jobIds', async () => {
    const a = await discover.discover(req, 'job-1');
    const c = await discover.discover(req, 'job-2');
    expect(a).not.toEqual(c);
  });

  it('rejects junk emails, verifies clean with a 0-100 score', async () => {
    const candidates = await discover.discover(req, 'job-1');
    let verified = 0;
    let rejected = 0;
    for (const cand of candidates) {
      const res = await verify.verify(cand);
      if (res.ok) {
        verified++;
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
      } else {
        rejected++;
        expect(res.reason).toBeTruthy();
        expect(cand.email.toLowerCase()).toMatch(/noreply|info@/);
      }
    }
    expect(rejected).toBeGreaterThanOrEqual(1);
    expect(verified).toBeGreaterThanOrEqual(1);
  });

  it('honors sentinels: __empty__ -> 0 candidates, __fail__ throws', async () => {
    const empty = await discover.discover({ ...req, companies: [EMPTY_COMPANY] }, 'j');
    expect(empty.length).toBe(0);
    await expect(discover.discover({ ...req, companies: [FAIL_COMPANY] }, 'j')).rejects.toThrow();
  });
});
