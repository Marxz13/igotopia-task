// Deterministic PRNG: xmur3 string seed -> mulberry32 stream. Keyed by a stable
// string (e.g. `${jobId}:${company}:${i}`) so the mock provider regenerates
// byte-identical output for the same job - the basis of crash-safe re-discovery.

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh [0,1) stream deterministically derived from `key`. */
export function seeded(key: string): () => number {
  return mulberry32(xmur3(key)());
}

export function pick<T>(arr: readonly T[], r: number): T {
  const value = arr[Math.floor(r * arr.length) % arr.length];
  if (value === undefined) throw new Error('pick from empty pool');
  return value;
}
