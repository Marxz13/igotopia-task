'use client';

import type { JobEvent } from '@/core/contract';
import { getJobEvents } from '@/app/lib/api';
import { usePolling } from '@/app/hooks/use-polling';
import { TONES, eventTone } from '@/app/lib/tones';

const POLL_INTERVAL_MS = 1500;
const TERMINAL_EVENTS = new Set(['completed', 'failed', 'cancelled']);

// Run log for one job. Polls the events endpoint on the same cadence as the progress
// card and stops once a terminal event lands. Shows every run, so a crash + recovery
// (two discover passes) is visible as two entries.
export function JobTimeline({ jobId }: { jobId: string }) {
  const { data } = usePolling<JobEvent[]>({
    key: jobId,
    enabled: true,
    intervalMs: POLL_INTERVAL_MS,
    fetcher: (signal) => getJobEvents(jobId, signal),
    isTerminal: (events) => events.some((e) => TERMINAL_EVENTS.has(e.type)),
  });

  const events = data ?? [];
  if (events.length === 0) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--muted-2)',
          marginBottom: 10,
        }}
      >
        Activity log
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {events.map((e) => (
          <li
            key={e.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '5px 0',
              fontSize: 13,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                flex: 'none',
                borderRadius: '50%',
                background: TONES[eventTone(e.type)].fg,
                transform: 'translateY(1px)',
              }}
            />
            <span
              style={{
                minWidth: 88,
                flex: 'none',
                fontWeight: 600,
                color: TONES[eventTone(e.type)].fg,
              }}
            >
              {e.type}
            </span>
            <span style={{ flex: 1, color: 'var(--ink-2)' }}>{e.message}</span>
            <time
              className="mono"
              dateTime={e.createdAt}
              style={{ flex: 'none', fontSize: 11, color: 'var(--muted-2)' }}
            >
              {new Date(e.createdAt).toLocaleTimeString(undefined, { hour12: false })}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
