'use client';

import { useEffect, useState, type ReactNode } from 'react';

// Starts the MSW worker before first render so the initial GET /api/me is mocked.
// Mocks off = pass-through to the real API.

const MOCKS_ON = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

// Don't block first paint forever if the worker is slow or fails to register
// (a `next dev` + Fast Refresh hazard). Render anyway after this; early requests just hit the real API.
const START_TIMEOUT_MS = 4000;

export function MswProvider({ children }: { children: ReactNode }) {
  // Ready immediately when mocks are off; otherwise wait for worker.start().
  const [ready, setReady] = useState(!MOCKS_ON);

  useEffect(() => {
    if (!MOCKS_ON) return;
    let active = true;
    const release = () => {
      if (active) {
        active = false;
        setReady(true);
      }
    };
    const timer = setTimeout(release, START_TIMEOUT_MS);

    void (async () => {
      try {
        const { worker } = await import('../../../mocks/browser');
        // 'bypass' so Next's own traffic (RSC, HMR, _next/*) passes through; only /api/* is mocked.
        await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
      } catch (err) {
        console.error('[msw] worker failed to start; rendering without the mock', err);
      } finally {
        clearTimeout(timer);
        release();
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
