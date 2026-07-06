import { describe, expect, it } from 'vitest';
import {
  createMockDiscoverProvider,
  EMPTY_COMPANY,
  FAIL_COMPANY,
} from '@/core/providers/mock-discover';
import { createMockVerifyProvider, scoreCandidate } from '@/core/providers/mock-verify';
import type { CandidateLead } from '@/core/providers/types';

const req = { companies: ['Marriott'], roles: ['Director of Sales'], region: 'Malaysia' };

// A clean, well-formed candidate; override one field per case to isolate a signal.
const cand = (over: Partial<CandidateLead> = {}): CandidateLead => ({
  candidateKey: 'marriott:0',
  name: 'Jane Doe',
  company: 'Marriott',
  title: 'Director of Sales',
  email: 'jane.doe@marriott.com',
  sourceUrl: 'https://marriott.com/team',
  ...over,
});

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

  it('two companies with the same slug keep distinct keys (no dropped leads)', async () => {
    // "Acme Inc" and "Acme, Inc." both slug to "acmeinc"; keys must stay globally
    // unique so neither company's leads are lost to a candidate_key collision.
    const out = await discover.discover(
      { ...req, companies: ['Acme Inc', 'Acme, Inc.'] },
      'job-slug',
    );
    expect(new Set(out.map((c) => c.candidateKey)).size).toBe(out.length);
    expect(out.some((c) => c.company === 'Acme Inc')).toBe(true);
    expect(out.some((c) => c.company === 'Acme, Inc.')).toBe(true);
  });

  it('honors sentinels: __empty__ -> 0 candidates, __fail__ throws', async () => {
    const empty = await discover.discover({ ...req, companies: [EMPTY_COMPANY] }, 'j');
    expect(empty.length).toBe(0);
    await expect(discover.discover({ ...req, companies: [FAIL_COMPANY] }, 'j')).rejects.toThrow();
  });
});

// The score is a transparent feature sum, not randomness. These assert the exact
// number AND that the evidence (factors) both justifies it and sums to it — so a
// good lead scores demonstrably higher than a bad one, for a nameable reason.
describe('lead scoring (feature-based, explainable)', () => {
  it('is deterministic — identical input, identical score + factors', () => {
    expect(scoreCandidate(cand())).toEqual(scoreCandidate(cand()));
  });

  it('factors sum to the score (clamped 0–100) — no hidden points', () => {
    for (const c of [
      cand(),
      cand({ title: 'Chief Marketing Officer' }),
      cand({ email: 'x@gmail.com' }),
    ]) {
      const { score, factors } = scoreCandidate(c);
      expect(score).toBe(
        Math.max(
          0,
          Math.min(
            100,
            factors.reduce((s, f) => s + f.points, 0),
          ),
        ),
      );
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('scores a Head/Director lead at exactly 87 with attributable factors', () => {
    const { score, factors } = scoreCandidate(cand());
    expect(score).toBe(87); // 40 + 22 + 8 + 10 + 4 + 3
    const labels = factors.map((f) => f.label);
    expect(labels).toContain('Head / Director title');
    expect(labels).toContain('Corporate domain');
    expect(labels).toContain('Named mailbox (first.last)');
  });

  it('ranks seniority: C-level (100) > Director (87) > individual contributor (69)', () => {
    expect(scoreCandidate(cand({ title: 'Chief Marketing Officer' })).score).toBe(100);
    expect(scoreCandidate(cand({ title: 'Director of Sales' })).score).toBe(87);
    expect(scoreCandidate(cand({ title: 'Sales Associate' })).score).toBe(69);
  });

  it('penalizes a public email provider, with the penalty visible as evidence', () => {
    const corporate = scoreCandidate(cand());
    const gmail = scoreCandidate(cand({ email: 'jane.doe@gmail.com' }));
    expect(gmail.score).toBeLessThan(corporate.score);
    expect(gmail.score).toBe(54); // 40 + 22 - 25 + 10 + 4 + 3
    expect(gmail.factors).toContainEqual({ label: 'Public email provider', points: -25 });
  });

  it('penalizes a shared/role mailbox that survives the deliverability screen', () => {
    const role = scoreCandidate(cand({ email: 'sales@marriott.com' }));
    expect(role.score).toBe(62); // 40 + 22 + 8 - 15 + 4 + 3
    expect(role.factors).toContainEqual({ label: 'Shared / role mailbox', points: -15 });
  });
});
