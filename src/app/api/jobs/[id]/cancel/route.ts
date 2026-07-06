import { NextResponse } from 'next/server';
import { NotFoundError } from '@/core/errors';
import { getLogger } from '@/core/logger';
import { cancelJob, getJobById } from '@/core/repositories/job-repository';
import { appendJobEvent } from '@/core/repositories/job-event-repository';
import { errorResponse, requireContext } from '@/app/api/_lib/http';
import { toJob } from '@/app/api/_lib/serializers';

// POST /api/jobs/:id/cancel - org-scoped cancel of an in-flight job. cancelJob only
// flips queued/discovering/verifying -> cancelled, so an already-terminal job is a
// no-op (we just return its current state). Unknown / cross-org id -> 404.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let orgId: string | undefined = undefined;
  try {
    const ctx = await requireContext();
    orgId = ctx.orgId;
    const { id } = await params;

    const cancelled = await cancelJob(ctx.orgId, id);
    if (cancelled) {
      await appendJobEvent(ctx.orgId, id, 'cancelled', 'Cancelled by user');
      getLogger().info({ jobId: id, orgId: ctx.orgId }, 'job cancelled');
      return NextResponse.json(toJob(cancelled));
    }

    // Not cancelled: either it doesn't exist for this org (404) or it's already
    // terminal (return the current state, no-op).
    const existing = await getJobById(ctx.orgId, id);
    if (!existing) throw new NotFoundError('Job not found');
    return NextResponse.json(toJob(existing));
  } catch (err) {
    return errorResponse(err, { req, orgId });
  }
}
