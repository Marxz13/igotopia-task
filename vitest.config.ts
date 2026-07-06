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
    env: { NODE_ENV: 'test' },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
