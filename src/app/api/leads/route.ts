import { NextResponse } from 'next/server';
import { leadsQuerySchema, type LeadsResponse } from '@/core/contract';
import { listLeadsByOrg } from '@/core/repositories/lead-repository';
import { errorResponse, requireContext } from '@/app/api/_lib/http';
import { toLead } from '@/app/api/_lib/serializers';

// GET /api/leads?state=&jobId= - org-scoped inbox. Filters are optional; the org
// guard always applies, so a foreign jobId returns no rows.
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const ctx = await requireContext();
    const url = new URL(req.url);
    const query = leadsQuerySchema.parse({
      state: url.searchParams.get('state') ?? undefined,
      jobId: url.searchParams.get('jobId') ?? undefined,
    });
    const rows = await listLeadsByOrg(ctx.orgId, query);
    const payload: LeadsResponse = { leads: rows.map(toLead) };
    return NextResponse.json(payload);
  } catch (err) {
    return errorResponse(err);
  }
}
