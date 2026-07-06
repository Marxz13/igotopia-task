import { NextResponse } from 'next/server';
import {
  IDEMPOTENCY_KEY_HEADER,
  searchRequestSchema,
  type CreateSearchResponse,
} from '@/core/contract';
import { ValidationError } from '@/core/errors';
import { startSearch } from '@/core/services/search-service';
import { errorResponse, requireContext } from '@/app/api/_lib/http';

// POST /api/searches - charge, create idempotently, and enqueue. No provider
// work in the request path (that would be fake-async); the worker does discovery.
export async function POST(req: Request): Promise<NextResponse> {
  let orgId: string | undefined = undefined;
  try {
    const ctx = await requireContext();
    orgId = ctx.orgId;
    const key = req.headers.get(IDEMPOTENCY_KEY_HEADER);
    if (!key) throw new ValidationError('Idempotency-Key header is required');

    const body: unknown = await req.json().catch(() => null);
    const request = searchRequestSchema.parse(body);

    const result = await startSearch({
      orgId: ctx.orgId,
      userId: ctx.userId,
      idempotencyKey: key,
      request,
    });

    const payload: CreateSearchResponse = { jobId: result.jobId, status: result.status };
    // 202 Accepted: the job is queued and runs in the background (poll GET /api/jobs/:id).
    // 200 for an idempotent replay of the same job (nothing new was created).
    return NextResponse.json(payload, { status: result.replayed ? 200 : 202 });
  } catch (err) {
    return errorResponse(err, { req, orgId });
  }
}
