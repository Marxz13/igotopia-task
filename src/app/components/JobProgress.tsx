'use client';

import { useEffect, useRef, useState } from 'react';
import type { Job } from '@/core/contract';
import { cancelJob, getJob } from '@/app/lib/api';
import { usePolling } from '@/app/hooks/use-polling';
import { isTerminalStatus, jobLabel, jobTone, stageRail } from '@/app/lib/tones';
import { Badge } from '@/app/components/Badge';
import { JobTimeline } from '@/app/components/JobTimeline';

const POLL_INTERVAL_MS = 1500;

// Live panel for one job: polls until it finishes. Counts are aria-live; the failure banner grabs focus.
export function JobProgress({
  jobId,
  onSettled,
  onReset,
  onViewInbox,
}: {
  jobId: string;
  onSettled: () => void;
  onReset: () => void;
  onViewInbox: (jobId: string) => void;
}) {
  const { data, phase, parked, retry } = usePolling<Job>({
    key: jobId,
    enabled: true,
    intervalMs: POLL_INTERVAL_MS,
    fetcher: (signal) => getJob(jobId, signal),
    isTerminal: (job) => isTerminalStatus(job.status),
    onTerminal: () => onSettled(),
  });

  const failRef = useRef<HTMLDivElement>(null);
  const failed = data?.status === 'failed';
  useEffect(() => {
    if (failed) failRef.current?.focus();
  }, [failed]);

  const [cancelling, setCancelling] = useState(false);
  async function handleCancel() {
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancelJob(jobId);
    } catch {
      // polling will reflect the real state; nothing to surface here
    } finally {
      setCancelling(false);
    }
  }

  // Until the first poll lands, show the job as freshly queued.
  const status = data?.status ?? 'queued';
  const discovered = data?.discoveredCount ?? 0;
  const verified = data?.verifiedCount ?? 0;
  const rejected = data?.rejectedCount ?? 0;
  const active = status === 'queued' || status === 'discovering' || status === 'verifying';
  const completed = status === 'completed';
  const cancelled = status === 'cancelled';

  const stageWord =
    status === 'verifying'
      ? 'Verifying leads…'
      : status === 'discovering'
        ? 'Discovering candidates…'
        : 'Queued…';

  const total = verified + rejected;
  const completedSummary =
    total === 0
      ? 'Completed. 0 leads found for these criteria.'
      : `Completed. ${total} leads (${verified} verified, ${rejected} rejected).`;

  return (
    <div className="card" style={{ padding: 22 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Current job</h2>
          <span className="mono" style={{ fontSize: 13, color: 'var(--muted-2)' }}>
            #{jobId.slice(0, 6)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge tone={jobTone(status)} label={jobLabel(status)} plain />
          {active && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={cancelling}
              aria-label="Cancel job"
              title="Cancel this job"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: '#b54708',
                background: '#fffaeb',
                border: '1px solid #fedf89',
                borderRadius: 8,
                cursor: cancelling ? 'default' : 'pointer',
                opacity: cancelling ? 0.6 : 1,
              }}
            >
              <span aria-hidden="true">✕</span>
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {active && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          {stageRail(status).map((s) => (
            <span key={s.key} style={s.style}>
              <span aria-hidden="true">{s.mark}</span> {s.label}
            </span>
          ))}
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          display: 'flex',
          gap: 28,
          flexWrap: 'wrap',
          padding: '15px 18px',
          border: '1px solid #f1f1f1',
          background: '#fbfbfb',
          borderRadius: 12,
          position: 'relative',
        }}
      >
        <Count label="Discovered" value={discovered} color="var(--ink)" />
        <Count label="Verified" value={verified} color="var(--success)" />
        <Count label="Rejected" value={rejected} color="var(--danger)" />
        <span className="sr-only">
          Discovered {discovered}, verified {verified}, rejected {rejected}.
        </span>
      </div>

      {verified > 0 && (active || completed) && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="row-link" onClick={() => onViewInbox(jobId)}>
            → View {verified} verified in inbox
          </button>
        </div>
      )}

      {active && (
        <>
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontSize: 14,
              color: 'var(--ink-2)',
            }}
          >
            <span className="spinner" aria-hidden="true" />
            <span>{stageWord}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted-2)' }}>
            Polling every ~1.5s · stops automatically when the job reaches a terminal state.
          </div>
          {phase === 'error' && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 8,
                fontSize: 13,
                color: 'var(--warn)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span aria-hidden="true">⟳</span>
              <span>
                {parked
                  ? 'Status unavailable. Check your connection, then retry.'
                  : 'Status temporarily unavailable, retrying…'}
              </span>
              {parked && (
                <button
                  type="button"
                  onClick={retry}
                  style={{
                    padding: '3px 9px',
                    border: '1px solid var(--warn-border)',
                    borderRadius: 7,
                    background: 'var(--warn-tint)',
                    fontSize: 12,
                    color: 'var(--warn)',
                  }}
                >
                  Retry now
                </button>
              )}
            </div>
          )}
        </>
      )}

      {completed && (
        <div style={{ marginTop: 14, fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>
          {completedSummary}
        </div>
      )}

      {cancelled && (
        <div style={{ marginTop: 14, fontSize: 14, color: '#b54708', fontWeight: 600 }}>
          Cancelled. Last counts - discovered {discovered}, verified {verified}, rejected {rejected}
          .
        </div>
      )}

      {failed && (
        <div
          role="alert"
          tabIndex={-1}
          ref={failRef}
          style={{
            marginTop: 14,
            padding: '12px 14px',
            border: '1px solid var(--danger-border)',
            background: 'var(--danger-tint)',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>
            Failed
          </div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--danger)' }}>
            {data?.error ?? 'The job failed.'}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            Last counts - discovered {discovered}, verified {verified}, rejected {rejected}.
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={onReset}
            style={{ marginTop: 10, padding: '7px 14px', fontSize: 13 }}
          >
            Try again
          </button>
        </div>
      )}

      <JobTimeline jobId={jobId} />
    </div>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div className="tnum" style={{ fontWeight: 700, fontSize: 24, color }}>
        {value}
      </div>
    </div>
  );
}
