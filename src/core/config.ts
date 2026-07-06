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
  // Crash hook: the discover stage exits right after inserting leads, to prove a
  // restart doesn't duplicate. Explicit truthy values only, since a coerced boolean
  // would treat "0"/"false" as true.
  CRASH_AFTER_DISCOVER: z
    .enum(['0', '1', 'true', 'false'])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

/** Parse and validate env once, at process boot. Throws (fail-fast) on missing or invalid values. */
export function loadConfig(): AppConfig {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}
