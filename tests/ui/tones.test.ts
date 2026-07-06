import { describe, expect, it } from 'vitest';
import {
  initials,
  isTerminalStatus,
  jobLabel,
  jobTone,
  leadLabel,
  leadTone,
  stageRail,
} from '@/app/lib/tones';

describe('job status presentation', () => {
  it('maps each status to a tone and label', () => {
    expect(jobTone('completed')).toBe('success');
    expect(jobTone('failed')).toBe('error');
    expect(jobTone('cancelled')).toBe('cancel');
    expect(jobTone('discovering')).toBe('active');
    expect(jobTone('verifying')).toBe('active');
    expect(jobTone('queued')).toBe('neutral');
    expect(jobLabel('discovering')).toBe('Discovering');
  });

  it('treats only completed/failed/cancelled as terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('queued')).toBe(false);
    expect(isTerminalStatus('discovering')).toBe(false);
    expect(isTerminalStatus('verifying')).toBe(false);
  });
});

describe('lead state presentation', () => {
  it('maps state to tone and label', () => {
    expect(leadTone('verified')).toBe('success');
    expect(leadTone('rejected')).toBe('error');
    expect(leadTone('unverified_raw')).toBe('neutral');
    expect(leadLabel('unverified_raw')).toBe('Unverified');
  });
});

describe('stageRail', () => {
  it('marks past stages done, the current stage active, and future stages pending', () => {
    // verifying => queued done, discover done, verify active
    const rail = stageRail('verifying');
    expect(rail.map((s) => s.mark)).toEqual(['✓', '✓', '→']);
  });

  it('marks every stage done once terminal', () => {
    expect(stageRail('completed').map((s) => s.mark)).toEqual(['✓', '✓', '✓']);
  });

  it('marks only the first stage active while queued', () => {
    expect(stageRail('queued').map((s) => s.mark)).toEqual(['→', '○', '○']);
  });
});

describe('initials', () => {
  it('takes first + last initial, uppercased', () => {
    expect(initials('marz zallan')).toBe('MZ');
    expect(initials('Allan')).toBe('A');
    expect(initials('')).toBe('');
  });
});
