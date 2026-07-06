import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests run against a live Postgres + Redis (from docker compose). Test
// files run serially since they share one DB that's reset per test, and each file is
// its own worker process so the DB/Redis singletons close cleanly between files.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
    // STAGE_DELAY_MS=0 keeps the pipeline instant in tests. QUEUE_PREFIX isolates the
    // test queue so a dev worker on the same Redis can't consume test jobs and race the
    // assertions. dotenv won't override an already-set var, so .env never leaks in here.
    env: { NODE_ENV: 'test', STAGE_DELAY_MS: '0', QUEUE_PREFIX: 'test' },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
