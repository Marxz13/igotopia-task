import { NextResponse } from 'next/server';
import type { JobsResponse } from '@/core/contract';
import { listJobsByOrg } from '@/core/repositories/job-repository';
import { errorResponse, requireContext } from '@/app/api/_lib/http';
import { toJob } from '@/app/api/_lib/serializers';

// GET /api/jobs - the active org's jobs, newest first.
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireContext();
    const rows = await listJobsByOrg(ctx.orgId);
    const payload: JobsResponse = { jobs: rows.map(toJob) };
    return NextResponse.json(payload);
  } catch (err) {
    return errorResponse(err);
  }
}
