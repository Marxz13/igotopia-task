import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadConfig } from '@/core/config';
import * as schema from './schema';

// Shared drizzle handle over a postgres-js pool. Built lazily so importing a
// repository doesn't need DATABASE_URL at module load (Next build / edge). One pool
// per process is reused by the API, the worker, and the seed script.

export type Db = PostgresJsDatabase<typeof schema>;

let sql: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    const { DATABASE_URL } = loadConfig();
    sql = postgres(DATABASE_URL, { max: 10 });
    db = drizzle(sql, { schema });
  }
  return db;
}

/** Close the pool, for graceful worker shutdown and test teardown. */
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
    db = null;
  }
}
