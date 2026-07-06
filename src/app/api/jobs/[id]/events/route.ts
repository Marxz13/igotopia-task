import { NextResponse } from 'next/server';
import type { JobEventsResponse } from '@/core/contract';
import { NotFoundError } from '@/core/errors';
import { getJobById } from '@/core/repositories/job-repository';
import { listJobEventsByOrg } from '@/core/repositories/job-event-repository';
import { errorResponse, requireContext } from '@/app/api/_lib/http';
import { toJobEvent } from '@/app/api/_lib/serializers';

// GET /api/jobs/:id/events - org-scoped run log for one job, oldest first. A cross-org
// or unknown id 404s (same mask as the job route), so the log can't leak across orgs.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let orgId: string | undefined = undefined;
  try {
    const ctx = await requireContext();
    orgId = ctx.orgId;
    const { id } = await params;
    if (!(await getJobById(ctx.orgId, id))) throw new NotFoundError('Job not found');
    const events = await listJobEventsByOrg(ctx.orgId, id);
    const body: JobEventsResponse = { events: events.map(toJobEvent) };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, { req, orgId });
  }
}
