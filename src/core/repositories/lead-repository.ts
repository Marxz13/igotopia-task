import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { LeadsQuery } from '@/core/contract';
import { getDb } from '@/core/db/client';
import { leads, type LeadRow } from '@/core/db/schema';

// Org-scoped inbox reads. Leads store a denormalized organization_id (copied from
// the parent job at insert), so the inbox filters by org directly. state and jobId
// are optional filters; a foreign jobId just returns no rows since the org guard wins.

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
