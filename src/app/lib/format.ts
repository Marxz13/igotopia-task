// Small display formatters shared across pages.

import type { Job } from '@/core/contract';

// Coarse "x ago" for job timestamps. Avoids a date library for one string.
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Job's companies, comma-joined.
export function jobCriteria(job: Job): string {
  return job.request.companies.join(', ') || '-';
}

export function percent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '-';
  return `${Math.round((numerator / denominator) * 100)}%`;
}
