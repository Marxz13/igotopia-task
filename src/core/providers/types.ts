import type { SearchRequest } from '@/core/contract/types';

// Provider interfaces you can swap for a real SERP or email API.
export interface CandidateLead {
  name: string;
  company: string;
  title: string;
  email: string;
  sourceUrl: string | null;
}

export interface DiscoverProvider {
  discover(input: SearchRequest): Promise<CandidateLead[]>;
}

export interface VerifyProvider {
  verify(candidate: CandidateLead): Promise<{ ok: boolean; reason?: string; score?: number }>;
}
