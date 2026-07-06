// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePolling } from '@/app/hooks/use-polling';

type Doc = { status: string };
const isDone = (d: Doc) => d.status === 'completed';

function poll(fetcher: (signal: AbortSignal) => Promise<Doc>, onTerminal?: (d: Doc) => void) {
  return renderHook(() =>
    usePolling<Doc>({
      key: 'job-1',
      enabled: true,
      intervalMs: 10,
      fetcher,
      isTerminal: isDone,
      ...(onTerminal ? { onTerminal } : {}),
    }),
  );
}

describe('usePolling', () => {
  it('polls until terminal, then stops — no further fetches, onTerminal fires once', async () => {
    const fetcher = vi
      .fn<(s: AbortSignal) => Promise<Doc>>()
      .mockResolvedValueOnce({ status: 'discovering' })
      .mockResolvedValueOnce({ status: 'verifying' })
      .mockResolvedValue({ status: 'completed' });
    const onTerminal = vi.fn();

    const { result } = poll(fetcher, onTerminal);

    await waitFor(() => expect(result.current.phase).toBe('stopped'));
    expect(result.current.data).toEqual({ status: 'completed' });
    expect(onTerminal).toHaveBeenCalledTimes(1);

    const callsAtStop = fetcher.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(fetcher.mock.calls.length).toBe(callsAtStop); // terminal-stop: no polling after done
  });

  it('never has more than one request in flight (recursive, not interval)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetcher = vi.fn(async (): Promise<Doc> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight -= 1;
      return { status: 'discovering' };
    });

    const { unmount } = poll(fetcher);
    await new Promise((r) => setTimeout(r, 100));
    unmount();
    expect(maxInFlight).toBe(1);
  });

  it('backs off then parks for manual retry after repeated transport errors', async () => {
    const fetcher = vi.fn<(s: AbortSignal) => Promise<Doc>>().mockRejectedValue(new Error('boom'));

    const { result } = poll(fetcher);

    await waitFor(() => expect(result.current.parked).toBe(true), { timeout: 3000 });
    expect(result.current.phase).toBe('error');
    // 1 initial attempt + 5 backoff retries before parking.
    const calls = fetcher.mock.calls.length;
    expect(calls).toBe(6);

    await new Promise((r) => setTimeout(r, 80));
    expect(fetcher.mock.calls.length).toBe(6); // parked: auto-retry stopped
  });

  it('retry() resumes from a parked state', async () => {
    const fetcher = vi
      .fn<(s: AbortSignal) => Promise<Doc>>()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockRejectedValueOnce(new Error('e4'))
      .mockRejectedValueOnce(new Error('e5'))
      .mockRejectedValueOnce(new Error('e6'))
      .mockResolvedValue({ status: 'completed' });

    const { result } = poll(fetcher);
    await waitFor(() => expect(result.current.parked).toBe(true), { timeout: 3000 });

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase).toBe('stopped'));
    expect(result.current.parked).toBe(false);
  });

  it('aborts the in-flight request on unmount', async () => {
    let captured: AbortSignal | null = null;
    const fetcher = vi.fn((signal: AbortSignal): Promise<Doc> => {
      captured = signal;
      return new Promise(() => {}); // never settles
    });

    const { unmount } = poll(fetcher);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    unmount();
    expect(captured!.aborted).toBe(true);
  });

  it('does not poll when disabled', async () => {
    const fetcher = vi
      .fn<(s: AbortSignal) => Promise<Doc>>()
      .mockResolvedValue({ status: 'queued' });
    const { result } = renderHook(() =>
      usePolling<Doc>({
        key: 'job-1',
        enabled: false,
        intervalMs: 10,
        fetcher,
        isTerminal: isDone,
      }),
    );
    await new Promise((r) => setTimeout(r, 40));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('stopped');
  });
});
