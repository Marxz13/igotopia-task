import { describe, expect, it } from 'vitest';
import type { Job } from '@/core/contract';
import { jobCriteria, percent, timeAgo } from '@/app/lib/format';

describe('percent', () => {
  it('rounds a ratio and dashes a zero denominator', () => {
    expect(percent(3, 4)).toBe('75%');
    expect(percent(1, 3)).toBe('33%');
    expect(percent(0, 0)).toBe('-');
    expect(percent(5, 0)).toBe('-');
  });
});

describe('timeAgo', () => {
  it('buckets recent timestamps', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 5_000).toISOString())).toBe('just now');
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString())).toBe('5 mins ago');
    expect(timeAgo(new Date(now - 60 * 60_000).toISOString())).toBe('1 hour ago');
    expect(timeAgo(new Date(now - 48 * 60 * 60_000).toISOString())).toBe('2 days ago');
  });

  it('returns empty string for an unparseable date', () => {
    expect(timeAgo('not-a-date')).toBe('');
  });
});

describe('jobCriteria', () => {
  it('joins companies, falling back to a dash', () => {
    const base = {
      id: 'x',
      status: 'completed',
      discoveredCount: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      error: null,
      createdAt: new Date().toISOString(),
    } as const;
    const job = {
      ...base,
      request: { companies: ['Marriott', 'Hilton'], roles: [], region: '' },
    } as Job;
    expect(jobCriteria(job)).toBe('Marriott, Hilton');
  });
});
