import type { JobStatus } from '@/core/contract';

// Job state machine. Terminal states never transition. The worker checks isTerminal
// before acting (safe on redelivery) and assertTransition blocks illegal moves.

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['discovering', 'failed', 'cancelled'],
  discovering: ['verifying', 'failed', 'cancelled'],
  verifying: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

// Same-state is allowed (idempotent re-set on a redelivered job). Otherwise the
// target must be a declared successor.
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`invalid job transition: ${from} -> ${to}`);
  }
}
