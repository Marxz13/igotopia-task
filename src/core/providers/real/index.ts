import type { DiscoverProvider, VerifyProvider } from '../types';

// Real provider hookup (PROVIDER_MODE=real). Implement against a SERP + email
// verification API behind the same interfaces; the pipeline needs no other change.
//
// TODO(discover): page through the SERP with a cursor loop; map each hit to a
//   CandidateLead with a stable candidateKey so re-runs stay idempotent. Respect
//   rate limits (token bucket), retry with backoff and jitter, track per-call cost.
// TODO(verify): call the verification API; deliverable -> { ok, score },
//   undeliverable/role/disposable -> { ok:false, reason }. Add a circuit breaker.
// Provide credentials via env; never commit keys.

export function createRealDiscoverProvider(): DiscoverProvider {
  throw new Error('real discover provider not implemented — set PROVIDER_MODE=mock');
}

export function createRealVerifyProvider(): VerifyProvider {
  throw new Error('real verify provider not implemented — set PROVIDER_MODE=mock');
}
