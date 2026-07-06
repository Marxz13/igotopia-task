import 'dotenv/config'; // load .env so `npm run migrate` picks up a custom DATABASE_URL
import { defineConfig } from 'drizzle-kit';

// drizzle-kit config for `generate` (build migrations offline from the schema) and
// `migrate` (apply SQL to DATABASE_URL). The fallback URL is the local compose
// default so `generate` works without env; `migrate` uses DATABASE_URL when set.
export default defineConfig({
  schema: './src/core/db/schema.ts',
  out: './src/core/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/lead_discovery',
  },
});
