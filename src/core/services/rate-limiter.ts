import { loadConfig } from '@/core/config';
import { RateLimitError } from '@/core/errors';
import { getRedis } from '@/core/queue/connection';

// Basic per-org rate limit for start-search. Fixed window in Redis: INCR the org's
// counter and set the TTL on the first hit of a window; over the cap it throws
// RateLimitError with the ms left. Enforced in the route BEFORE the credit charge,
// so a blocked attempt never spends a credit. RATE_LIMIT_MAX=0 disables it.

const KEY_PREFIX = 'ratelimit:search:';

export function searchRateLimitKey(orgId: string): string {
  return `${KEY_PREFIX}${orgId}`;
}

export async function enforceSearchRateLimit(orgId: string): Promise<void> {
  const { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } = loadConfig();
  if (RATE_LIMIT_MAX <= 0) return; // disabled

  const redis = getRedis();
  const key = searchRateLimitKey(orgId);

  // First request in the window sets the TTL; the window then stays fixed (blocked
  // attempts keep incrementing the count but do not extend it).
  const count = await redis.incr(key);
  if (count === 1) await redis.pexpire(key, RATE_LIMIT_WINDOW_MS);

  if (count > RATE_LIMIT_MAX) {
    const ttl = await redis.pttl(key);
    const retryAfterMs = ttl > 0 ? ttl : RATE_LIMIT_WINDOW_MS;
    const windowSec = Math.round(RATE_LIMIT_WINDOW_MS / 1000);
    throw new RateLimitError(
      `Rate limit reached: max ${RATE_LIMIT_MAX} searches per ${windowSec}s for this workspace.`,
      retryAfterMs,
    );
  }
}
