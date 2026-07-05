import type { SearchRequest } from '@/core/contract/types';

// Starts a search job.

export interface StartSearchInput {
  orgId: string;
  userId: string;
  idempotencyKey: string;
  request: SearchRequest;
}

export interface StartSearchResult {
  jobId: string;
  status: 'queued';
  replayed: boolean;
}

export async function startSearch(_input: StartSearchInput): Promise<StartSearchResult> {
  throw new Error('not_implemented');
}
