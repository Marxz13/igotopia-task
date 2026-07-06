// Maps domain state to a tone (colors + glyph). Shared by status badges,
// lead badges, and the stage rail so colors stay consistent.

import type { CSSProperties } from 'react';
import type { JobStatus, LeadState } from '@/core/contract';

export type Tone = 'neutral' | 'active' | 'success' | 'error' | 'cancel';

interface ToneSpec {
  fg: string;
  bg: string;
  bd: string;
  glyph: string;
  dashed: boolean;
}

export const TONES: Record<Tone, ToneSpec> = {
  neutral: { fg: '#414651', bg: '#f5f5f5', bd: '#e9e9eb', glyph: '○', dashed: false },
  active: { fg: '#9a3412', bg: '#fff4ed', bd: '#fed7aa', glyph: '', dashed: false },
  success: { fg: '#067647', bg: '#ecfdf3', bd: '#abefc6', glyph: '✓', dashed: false },
  error: { fg: '#b42318', bg: '#fef3f2', bd: '#fecdca', glyph: '✕', dashed: false },
  cancel: { fg: '#b54708', bg: '#fffaeb', bd: '#fedf89', glyph: '⊘', dashed: true },
};

export function badgeStyle(tone: Tone): CSSProperties {
  const t = TONES[tone];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 9px',
    borderRadius: '8px',
    border: `1px ${t.dashed ? 'dashed' : 'solid'} ${t.bd}`,
    background: t.bg,
    color: t.fg,
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    lineHeight: '18px',
  };
}

const JOB_LABELS: Record<JobStatus, string> = {
  queued: 'Queued',
  discovering: 'Discovering',
  verifying: 'Verifying',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function jobTone(status: JobStatus): Tone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancel';
    case 'discovering':
    case 'verifying':
      return 'active';
    default:
      return 'neutral';
  }
}

export function jobLabel(status: JobStatus): string {
  return JOB_LABELS[status];
}

export const JOB_TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'completed',
  'failed',
  'cancelled',
]);

export function isTerminalStatus(status: JobStatus): boolean {
  return JOB_TERMINAL.has(status);
}

// Lead state presentation
const LEAD_LABELS: Record<LeadState, string> = {
  unverified_raw: 'Unverified',
  verified: 'Verified',
  rejected: 'Rejected',
};

export function leadTone(state: LeadState): Tone {
  return state === 'verified' ? 'success' : state === 'rejected' ? 'error' : 'neutral';
}

export function leadLabel(state: LeadState): string {
  return LEAD_LABELS[state];
}

// Discover / verify stage rail
export interface StageStep {
  key: string;
  label: string;
  mark: string;
  style: CSSProperties;
}

// queued -> discover -> verify. A step is done (check), active (arrow), or pending.
export function stageRail(status: JobStatus): StageStep[] {
  const order = [
    { key: 'queued', label: 'Queued' },
    { key: 'discover', label: 'Discover' },
    { key: 'verify', label: 'Verify' },
  ];
  const reached =
    status === 'queued' ? 0 : status === 'discovering' ? 1 : status === 'verifying' ? 2 : 3;

  return order.map((step, i) => {
    const active = i === reached;
    const done = i < reached;
    return {
      key: step.key,
      label: step.label,
      mark: done ? '✓' : active ? '→' : '○',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        border: `1px solid ${active ? '#fed7aa' : done ? '#abefc6' : '#e9e9eb'}`,
        background: active ? '#fff4ed' : done ? '#ecfdf3' : '#fafafa',
        color: active ? '#9a3412' : done ? '#067647' : '#a3a3a3',
      },
    };
  });
}

// First+last initial for the avatar chip.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
