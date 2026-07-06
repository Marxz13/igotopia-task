import { count, eq, sql } from 'drizzle-orm';
import { getDb } from '@/core/db/client';
import { getRedis } from '@/core/queue/connection';
import { findJobByIdSystem } from '@/core/repositories/job-repository';
import {
  creditLedger,
  jobs,
  leads,
  memberships,
  organizations,
  users,
  type JobRow,
} from '@/core/db/schema';

// Fixed demo identities (same as the seed and MSW mock).
export const MARZLABS = 'aaaaaaaa-0000-4000-8000-000000000001';
export const ALLANINC = 'bbbbbbbb-0000-4000-8000-000000000001';
export const MARZ = 'a1a1a1a1-0000-4000-8000-000000000001';
export const ALLAN = 'a2a2a2a2-0000-4000-8000-000000000001';

// Reset to the seeded baseline before each test: clear tenant data, make sure the
// orgs/users/memberships exist, reset balances (Marz Labs=10, Allan Inc=1), and flush
// Redis so no stale BullMQ jobs leak between tests.
export async function resetDb(): Promise<void> {
  const db = getDb();
  await db.execute(sql`TRUNCATE leads, credit_ledger, jobs, sessions RESTART IDENTITY CASCADE`);
  await db
    .insert(organizations)
    .values([
      { id: MARZLABS, name: 'Marz Labs', credits: 10 },
      { id: ALLANINC, name: 'Allan Inc', credits: 1 },
    ])
    .onConflictDoNothing();
  await db
    .insert(users)
    .values([
      { id: MARZ, email: 'marz@test.com', name: 'Marz' },
      { id: ALLAN, email: 'allan@test.com', name: 'Allan' },
    ])
    .onConflictDoNothing();
  await db
    .insert(memberships)
    .values([
      { userId: MARZ, organizationId: MARZLABS },
      { userId: ALLAN, organizationId: MARZLABS },
      { userId: ALLAN, organizationId: ALLANINC },
    ])
    .onConflictDoNothing();
  await db.update(organizations).set({ credits: 10 }).where(eq(organizations.id, MARZLABS));
  await db.update(organizations).set({ credits: 1 }).where(eq(organizations.id, ALLANINC));
  await getRedis().flushdb();
}

export async function credits(orgId: string): Promise<number> {
  const r = await getDb()
    .select({ c: organizations.credits })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return r[0]?.c ?? -1;
}

export async function ledgerCount(orgId: string): Promise<number> {
  const r = await getDb()
    .select({ n: count() })
    .from(creditLedger)
    .where(eq(creditLedger.organizationId, orgId));
  return r[0]?.n ?? 0;
}

export async function jobCount(orgId: string): Promise<number> {
  const r = await getDb().select({ n: count() }).from(jobs).where(eq(jobs.organizationId, orgId));
  return r[0]?.n ?? 0;
}

export async function leadCount(jobId: string): Promise<number> {
  const r = await getDb().select({ n: count() }).from(leads).where(eq(leads.jobId, jobId));
  return r[0]?.n ?? 0;
}

export async function requireJob(jobId: string): Promise<JobRow> {
  const job = await findJobByIdSystem(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  return job;
}
