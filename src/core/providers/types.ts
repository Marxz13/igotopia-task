import type { SearchRequest } from '@/core/contract';

// Swappable provider interfaces - a real SERP/email API implements the same shapes,
// so the pipeline depends only on these, never on a concrete provider.

export interface CandidateLead {
  // Stable per candidate within a job -> the discovery insert is idempotent
  // (UNIQUE(job_id, candidate_key)); a re-run conflicts on every row.
  candidateKey: string;
  name: string;
  company: string;
  title: string;
  email: string;
  sourceUrl: string | null;
}

export interface DiscoverProvider {
  // jobId seeds the (deterministic) mock so a re-run of the SAME job regenerates
  // identical candidates + keys - the load-bearing crash-idempotency property.
  discover(input: SearchRequest, jobId: string): Promise<CandidateLead[]>;
}

// Discriminated result: a verified lead carries a score, a rejected one a reason.
// (Superset of the base { ok, reason? } - adds score for inbox confidence.)
export type VerifyResult = { ok: true; score: number } | { ok: false; reason: string };

export interface VerifyProvider {
  verify(candidate: CandidateLead): Promise<VerifyResult>;
}
