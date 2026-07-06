'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Polls with a recursive setTimeout (not setInterval) so only one request runs at a time.
// Aborts in-flight requests on cleanup so a stale response can't clobber fresh state.

export type PollingPhase = 'loading' | 'polling' | 'stopped' | 'error';

const MAX_BACKOFF_STEPS = 5;

export interface UsePollingOptions<T> {
  key: string | null;
  enabled: boolean;
  intervalMs: number;
  fetcher: (signal: AbortSignal) => Promise<T>;
  isTerminal: (data: T) => boolean;
  onTerminal?: (data: T) => void;
}

export interface UsePollingResult<T> {
  data: T | null;
  phase: PollingPhase;
  error: Error | null;
  parked: boolean;
  retry: () => void;
}

export function usePolling<T>(options: UsePollingOptions<T>): UsePollingResult<T> {
  const { key, enabled, intervalMs, fetcher, isTerminal, onTerminal } = options;

  const [data, setData] = useState<T | null>(null);
  const [phase, setPhase] = useState<PollingPhase>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [parked, setParked] = useState(false);

  // Latest callbacks, read by the loop without re-subscribing it.
  const fetcherRef = useRef(fetcher);
  const isTerminalRef = useRef(isTerminal);
  const onTerminalRef = useRef(onTerminal);
  fetcherRef.current = fetcher;
  isTerminalRef.current = isTerminal;
  onTerminalRef.current = onTerminal;

  // Loop machinery, kept out of state so mutating it never triggers a render.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const backoffRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const tick = useCallback(async () => {
    if (cancelledRef.current || !key) return;
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const result = await fetcherRef.current(ac.signal);
      if (cancelledRef.current) return;
      backoffRef.current = 0;
      setData(result);
      setError(null);
      if (isTerminalRef.current(result)) {
        setPhase('stopped');
        onTerminalRef.current?.(result);
        return; // terminal - stop; no reschedule
      }
      setPhase('polling');
      timerRef.current = setTimeout(() => void tick(), intervalMs);
    } catch (err) {
      if (cancelledRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error(String(err)));
      backoffRef.current += 1;
      if (backoffRef.current > MAX_BACKOFF_STEPS) {
        setPhase('error');
        setParked(true); // give up auto-retry; wait for the user
        return;
      }
      setPhase('error');
      timerRef.current = setTimeout(() => void tick(), intervalMs * backoffRef.current);
    }
  }, [key, intervalMs]);

  const retry = useCallback(() => {
    if (!key) return;
    clearTimer();
    backoffRef.current = 0;
    setParked(false);
    setError(null);
    setPhase('loading');
    void tick();
  }, [key, tick]);

  useEffect(() => {
    if (!enabled || !key) {
      setPhase('stopped');
      return;
    }
    // Fresh run for this key: reset flags and fire immediately (no initial delay).
    cancelledRef.current = false;
    backoffRef.current = 0;
    setData(null);
    setError(null);
    setParked(false);
    setPhase('loading');
    void tick();

    return () => {
      cancelledRef.current = true;
      clearTimer();
      abortRef.current?.abort();
    };
  }, [enabled, key, tick]);

  return { data, phase, error, parked, retry };
}
