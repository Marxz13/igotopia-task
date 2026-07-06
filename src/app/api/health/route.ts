import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { getRedis } from '@/core/queue/connection';

// Readiness probe for the health-gated deploy: 200 only when Postgres AND Redis
// are reachable, else 503. Deploy switches traffic to a new container only after
// this hits 200, so a broken build never takes traffic. Runs per-request (never
// prerendered at build, where there's no DB).
export const dynamic = 'force-dynamic';

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function GET() {
  const checks = { postgres: false, redis: false };

  try {
    await withTimeout(getDb().execute(sql`select 1`), 2000);
    checks.postgres = true;
  } catch {
    // leave false
  }
  try {
    const pong = await withTimeout(getRedis().ping(), 2000);
    checks.redis = pong === 'PONG';
  } catch {
    // leave false
  }

  const ok = checks.postgres && checks.redis;
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', service: 'lead-discovery', checks },
    { status: ok ? 200 : 503 },
  );
}
