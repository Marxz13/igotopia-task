import { z } from 'zod';

// Fail-fast, validated environment. The single place process env is read; every
// module takes config as input instead of touching process.env directly. Parsed
// lazily (not at import) so Next build passes that lack runtime env don't throw.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  // Signs the session cookie token hash; must be a long random value.
  SESSION_SECRET: z.string().min(16),
  PROVIDER_MODE: z.enum(['mock', 'real']).default('mock'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // BullMQ key prefix. Tests use a separate prefix so a dev worker running against the
  // same Redis can never pick up test-enqueued jobs and race the assertions.
  QUEUE_PREFIX: z.string().min(1).default('bull'),
  // Artificial per-stage pause (ms) so discover/verify are watchable and cancellable
  // in a demo. Defaults to 0 so tests stay fast; the local .env sets 2000.
  STAGE_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  // Crash hook: the discover stage exits right after inserting leads, to prove a
  // restart doesn't duplicate. Explicit truthy values only, since a coerced boolean
  // would treat "0"/"false" as true.
  CRASH_AFTER_DISCOVER: z
    .enum(['0', '1', 'true', 'false'])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
});

export type AppConfig = z.infer<typeof envSchema>;

/** Parse and validate env. Throws (fail-fast) on missing or invalid values. Not
 * cached, so a runtime toggle (e.g. CRASH_AFTER_DISCOVER) is picked up on the next read. */
export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
