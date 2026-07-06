// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getIdemKey, rotateIdemKey } from '@/app/lib/idempotency';

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001';

beforeEach(() => {
  sessionStorage.clear();
});

describe('idempotency key', () => {
  it('is stable across reads until rotated — the same submit retries under one key', () => {
    const first = getIdemKey(ORG_A);
    expect(getIdemKey(ORG_A)).toBe(first);
    expect(getIdemKey(ORG_A)).toBe(first);
  });

  it('rotates to a fresh key only after an acknowledged submit', () => {
    const first = getIdemKey(ORG_A);
    rotateIdemKey(ORG_A);
    const second = getIdemKey(ORG_A);
    expect(second).not.toBe(first);
  });

  it('is scoped per org — switching workspace starts a distinct key', () => {
    const a = getIdemKey(ORG_A);
    const b = getIdemKey(ORG_B);
    expect(a).not.toBe(b);
    // Rotating one org must not disturb the other's in-flight key.
    rotateIdemKey(ORG_A);
    expect(getIdemKey(ORG_B)).toBe(b);
  });
});
