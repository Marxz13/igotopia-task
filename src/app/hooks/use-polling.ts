'use client';

// Polling hook.

export type PollingPhase = 'loading' | 'polling' | 'stopped' | 'error';

export interface UsePollingOptions<T> {
  key: string | null;
  enabled: boolean;
  intervalMs: number;
  fetcher: (signal: AbortSignal) => Promise<T>;
  isTerminal: (data: T) => boolean;
}

export interface UsePollingResult<T> {
  data: T | null;
  phase: PollingPhase;
  error: Error | null;
}

export function usePolling<T>(_options: UsePollingOptions<T>): UsePollingResult<T> {
  // TODO: implement
  return { data: null, phase: 'loading', error: null };
}
