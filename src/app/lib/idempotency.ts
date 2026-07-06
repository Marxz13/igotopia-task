// Per-org idempotency key in sessionStorage. Same key on every retry of one submit
// so the server charges once. Rotates only after the server acks, so an unacked
// submit stays safe to retry. Keyed by org.

const PREFIX = 'ld_idem_';

function storageKey(orgId: string): string {
  return PREFIX + orgId;
}

function randomKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export function getIdemKey(orgId: string): string {
  const key = storageKey(orgId);
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const minted = randomKey();
    sessionStorage.setItem(key, minted);
    return minted;
  } catch {
    // sessionStorage unavailable (private mode / SSR), fall back to a fresh key.
    return randomKey();
  }
}

export function rotateIdemKey(orgId: string): void {
  try {
    sessionStorage.removeItem(storageKey(orgId));
  } catch {
    // no-op
  }
}
