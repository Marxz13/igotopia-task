import type { Job, JobEvent, JobEventType, JobStatus, Lead, LeadState } from '@/core/contract';
import type { JobEventRow, JobRow, LeadRow } from '@/core/db/schema';

// Convert a DB row to the contract shape. status/state are text columns whose CHECK
// constraints match the contract enums, so the cast is safe. Timestamps become ISO strings.

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    status: row.status as JobStatus,
    request: row.requestJson,
    discoveredCount: row.discoveredCount,
    verifiedCount: row.verifiedCount,
    rejectedCount: row.rejectedCount,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toJobEvent(row: JobEventRow): JobEvent {
  return {
    id: row.id,
    type: row.type as JobEventType,
    message: row.message,
    data: row.data ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    company: row.company,
    title: row.title,
    email: row.email,
    sourceUrl: row.sourceUrl,
    state: row.state as LeadState,
    score: row.score,
    scoreFactors: row.scoreFactors ?? null,
    rejectionReason: row.rejectionReason,
  };
}
