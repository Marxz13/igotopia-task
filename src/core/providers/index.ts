import { loadConfig } from '@/core/config';
import { createMockDiscoverProvider } from './mock-discover';
import { createMockVerifyProvider } from './mock-verify';
import { createRealDiscoverProvider, createRealVerifyProvider } from './real';
import type { DiscoverProvider, VerifyProvider } from './types';

// Factory: the pipeline imports these, never a concrete provider. PROVIDER_MODE
// picks mock (default) or real at call time.

export function getDiscoverProvider(): DiscoverProvider {
  return loadConfig().PROVIDER_MODE === 'real'
    ? createRealDiscoverProvider()
    : createMockDiscoverProvider();
}

export function getVerifyProvider(): VerifyProvider {
  return loadConfig().PROVIDER_MODE === 'real'
    ? createRealVerifyProvider()
    : createMockVerifyProvider();
}

export { EMPTY_COMPANY, FAIL_COMPANY } from './mock-discover';
export type { CandidateLead, DiscoverProvider, VerifyProvider, VerifyResult } from './types';
