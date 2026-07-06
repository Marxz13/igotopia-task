import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminal } from '@/core/worker/state-machine';

describe('job state machine', () => {
  it('identifies terminal states', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('discovering')).toBe(false);
    expect(isTerminal('verifying')).toBe(false);
  });

  it('allows the forward pipeline transitions', () => {
    expect(canTransition('queued', 'discovering')).toBe(true);
    expect(canTransition('discovering', 'verifying')).toBe(true);
    expect(canTransition('verifying', 'completed')).toBe(true);
    expect(canTransition('discovering', 'failed')).toBe(true);
  });

  it('allows same-state re-set (idempotent redelivery)', () => {
    expect(canTransition('discovering', 'discovering')).toBe(true);
    expect(canTransition('verifying', 'verifying')).toBe(true);
  });

  it('rejects illegal + terminal transitions', () => {
    expect(canTransition('completed', 'verifying')).toBe(false);
    expect(canTransition('queued', 'completed')).toBe(false);
    expect(canTransition('failed', 'completed')).toBe(false);
    expect(() => assertTransition('completed', 'discovering')).toThrow();
  });
});
