import { seeded } from './prng';
import type { CandidateLead, VerifyProvider, VerifyResult } from './types';

// Deterministic mock verification. Rejects role/disposable addresses (noreply, info@)
// with a reason; otherwise approves with a seeded score. Seeded by the candidate's
// stable key so re-verifying the same lead gives the same score.

function mockVerify(candidate: CandidateLead): VerifyResult {
  const email = candidate.email.toLowerCase();
  if (email.includes('noreply') || email.startsWith('info@')) {
    return { ok: false, reason: 'Disposable / role-based email address' };
  }
  const score = 50 + Math.floor(seeded(`verify:${candidate.candidateKey}`)() * 50); // 50-99
  return { ok: true, score };
}

export function createMockVerifyProvider(): VerifyProvider {
  return { verify: (candidate) => Promise.resolve(mockVerify(candidate)) };
}
