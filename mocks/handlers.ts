// Mock API request handlers (MSW) matching @/core/contract.

import { http, HttpResponse } from 'msw';
import {
  IDEMPOTENCY_KEY_HEADER,
  leadsQuerySchema,
  loginRequestSchema,
  searchRequestSchema,
  switchOrgRequestSchema,
  type ErrorCode,
  type ErrorResponse,
} from '@/core/contract';
import {
  buildMe,
  createSearch,
  findUserByEmail,
  getCredits,
  getJob,
  getSession,
  isMember,
  listJobs,
  listLeads,
  login,
  logout,
  peekReplay,
  setActiveOrg,
} from './db';

function jsonError(error: ErrorCode, status: number, message?: string): Response {
  const body: ErrorResponse = message ? { error, message } : { error };
  return HttpResponse.json(body, { status });
}

type OrgCtx = { ok: true; userId: string; orgId: string } | { ok: false; response: Response };

// Get the caller's org context from the session, not the request.
function requireActiveOrg(): OrgCtx {
  const session = getSession();
  if (!session) return { ok: false, response: jsonError('unauthorized', 401, 'Not signed in.') };
  if (!session.activeOrgId) {
    return {
      ok: false,
      response: jsonError('unauthorized', 401, 'No active organization selected.'),
    };
  }
  return { ok: true, userId: session.userId, orgId: session.activeOrgId };
}

async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

export const handlers = [
  // Health
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),

  // Auth
  http.post('/api/auth/login', async ({ request }) => {
    const parsed = loginRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError('validation_error', 400, 'Enter a valid email.');
    const user = findUserByEmail(parsed.data.email);
    if (!user) return jsonError('unauthorized', 401, 'Invalid credentials.');
    login(user.id);
    return HttpResponse.json(buildMe());
  }),

  http.post('/api/auth/logout', () => {
    logout();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/me', () => {
    const me = buildMe();
    if (!me) return jsonError('unauthorized', 401, 'Not signed in.');
    return HttpResponse.json(me);
  }),

  // Active-org switch
  http.post('/api/session/active-org', async ({ request }) => {
    const session = getSession();
    if (!session) return jsonError('unauthorized', 401, 'Not signed in.');
    const parsed = switchOrgRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError('validation_error', 400, 'Invalid organization id.');
    // Not a member returns 404, same as a missing org.
    if (!isMember(session.userId, parsed.data.organizationId)) {
      return jsonError('not_found', 404, 'Organization not found.');
    }
    setActiveOrg(parsed.data.organizationId);
    return HttpResponse.json(buildMe());
  }),

  // Searches
  http.post('/api/searches', async ({ request }) => {
    const ctx = requireActiveOrg();
    if (!ctx.ok) return ctx.response;

    const parsed = searchRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid search request.';
      return jsonError('validation_error', 400, message);
    }

    const key = request.headers.get(IDEMPOTENCY_KEY_HEADER);

    // Duplicate submit (same org + key): replay the one job, no second charge.
    const replayJobId = peekReplay(ctx.orgId, key);
    if (replayJobId) {
      const job = getJob(ctx.orgId, replayJobId);
      return HttpResponse.json({ jobId: replayJobId, status: job?.status ?? 'queued' });
    }

    // Reject before charging if the balance is 0.
    if (getCredits(ctx.orgId) < 1) {
      return jsonError('insufficient_credits', 402, 'Insufficient credits for this organization.');
    }

    const { jobId } = createSearch(ctx.orgId, ctx.userId, parsed.data, key);
    return HttpResponse.json({ jobId, status: 'queued' }, { status: 201 });
  }),

  // Jobs
  http.get('/api/jobs/:id', ({ params }) => {
    const ctx = requireActiveOrg();
    if (!ctx.ok) return ctx.response;
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const job = id ? getJob(ctx.orgId, id) : undefined;
    // Wrong org or unknown id => 404, never 403.
    if (!job) return jsonError('not_found', 404, 'Job not found.');
    return HttpResponse.json(job);
  }),

  http.get('/api/jobs', () => {
    const ctx = requireActiveOrg();
    if (!ctx.ok) return ctx.response;
    return HttpResponse.json({ jobs: listJobs(ctx.orgId) });
  }),

  // Leads
  http.get('/api/leads', ({ request }) => {
    const ctx = requireActiveOrg();
    if (!ctx.ok) return ctx.response;
    const url = new URL(request.url);
    const parsed = leadsQuerySchema.safeParse({
      state: url.searchParams.get('state') ?? undefined,
      jobId: url.searchParams.get('jobId') ?? undefined,
    });
    if (!parsed.success) return jsonError('validation_error', 400, 'Invalid leads filter.');
    return HttpResponse.json({ leads: listLeads(ctx.orgId, parsed.data) });
  }),
];
