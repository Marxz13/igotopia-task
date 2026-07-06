import { NextResponse } from 'next/server';
import { NotFoundError } from '@/core/errors';
import { getJobById } from '@/core/repositories/job-repository';
import { errorResponse, requireContext } from '@/app/api/_lib/http';
import { toJob } from '@/app/api/_lib/serializers';

// GET /api/jobs/:id - org-scoped poll endpoint. A cross-org or unknown id returns
// 404, never 403, so "not yours" can't be told apart from "doesn't exist".
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireContext();
    const { id } = await params;
    const row = await getJobById(ctx.orgId, id);
    if (!row) throw new NotFoundError('Job not found');
    return NextResponse.json(toJob(row));
  } catch (err) {
    return errorResponse(err);
  }
}
