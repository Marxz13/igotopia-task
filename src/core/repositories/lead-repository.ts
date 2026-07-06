import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import type { LeadsQuery, ScoreFactor } from '@/core/contract';
import { getDb } from '@/core/db/client';
import { leads, type LeadRow } from '@/core/db/schema';

// Org-scoped inbox reads
// Leads carry a denormalized organization_id (copied from the parent job at insert),
// so the inbox filters by org directly. A foreign jobId returns no rows - the org
// guard always applies.

export async function listLeadsByOrg(orgId: string, filter: LeadsQuery): Promise<LeadRow[]> {
  const conditions: SQL[] = [eq(leads.organizationId, orgId)];
  if (filter.state) conditions.push(eq(leads.state, filter.state));
  if (filter.jobId) conditions.push(eq(leads.jobId, filter.jobId));
  return getDb()
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt));
}

// Worker mutations

export interface NewCandidate {
  organizationId: string;
  jobId: string;
  name: string;
  company: string;
  title: string;
  email: string;
  sourceUrl: string | null;
  candidateKey: string;
}

/** Idempotent insert: ON CONFLICT(job_id, candidate_key) DO NOTHING, so a re-run
 * (retry, stalled re-pick, crash restart) inserts no duplicate leads. */
export async function insertCandidates(rows: NewCandidate[]): Promise<void> {
  if (rows.length === 0) return;
  await getDb()
    .insert(leads)
    .values(rows.map((r) => ({ ...r, state: 'unverified_raw' as const })))
    .onConflictDoNothing();
}

/** Reads only unverified rows, so a re-run never re-scores a settled lead. */
export async function listUnverified(jobId: string): Promise<LeadRow[]> {
  return getDb()
    .select()
    .from(leads)
    .where(and(eq(leads.jobId, jobId), eq(leads.state, 'unverified_raw')));
}

export async function setLeadVerified(
  leadId: string,
  score: number,
  scoreFactors: ScoreFactor[],
): Promise<void> {
  await getDb()
    .update(leads)
    .set({ state: 'verified', score, scoreFactors, rejectionReason: null, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
}

export async function setLeadRejected(leadId: string, reason: string): Promise<void> {
  await getDb()
    .update(leads)
    .set({
      state: 'rejected',
      score: null,
      scoreFactors: null,
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
}

/** Authoritative counts from the rows themselves, set into the job (no drift). */
export async function countByState(
  jobId: string,
): Promise<{ verified: number; rejected: number; total: number }> {
  const rows = await getDb()
    .select({ state: leads.state, n: count() })
    .from(leads)
    .where(eq(leads.jobId, jobId))
    .groupBy(leads.state);
  let verified = 0;
  let rejected = 0;
  let total = 0;
  for (const r of rows) {
    total += r.n;
    if (r.state === 'verified') verified = r.n;
    else if (r.state === 'rejected') rejected = r.n;
  }
  return { verified, rejected, total };
}
