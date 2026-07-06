// All client API calls go through here. Parses responses against the contract and
// throws a typed ApiError on non-2xx (e.g. insufficient_credits -> 402).

import {
  IDEMPOTENCY_KEY_HEADER,
  createSearchResponseSchema,
  errorResponseSchema,
  jobSchema,
  jobEventsResponseSchema,
  jobsResponseSchema,
  leadsResponseSchema,
  meSchema,
  type CreateSearchResponse,
  type ErrorCode,
  type Job,
  type JobEvent,
  type Lead,
  type LeadState,
  type Me,
  type SearchRequest,
} from '@/core/contract';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'network_error';
  readonly retryAfterMs: number | undefined; // set on 429 so the UI can count down the cooldown

  constructor(
    status: number,
    code: ErrorCode | 'network_error',
    message: string,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

// JSON in, JSON out with cookie session. Non-2xx -> ApiError, 204 -> null.
async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const { method = 'GET', body, headers = {}, signal } = options;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'Network request failed.');
  }

  if (res.status === 204) return null;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(
        res.status,
        parsed.data.error,
        parsed.data.message ?? parsed.data.error,
        parsed.data.retryAfterMs,
      );
    }
    throw new ApiError(res.status, 'internal_error', `Request failed (${res.status}).`);
  }

  return payload;
}

// Auth / session
export async function getMe(signal?: AbortSignal): Promise<Me> {
  const data = await request('/api/me', signal ? { signal } : {});
  return meSchema.parse(data);
}

export async function login(email: string): Promise<Me> {
  const data = await request('/api/auth/login', { method: 'POST', body: { email } });
  return meSchema.parse(data);
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function switchOrg(organizationId: string): Promise<Me> {
  const data = await request('/api/session/active-org', {
    method: 'POST',
    body: { organizationId },
  });
  return meSchema.parse(data);
}

// Searches / jobs / leads
export async function createSearch(
  request_: SearchRequest,
  idempotencyKey: string,
): Promise<CreateSearchResponse> {
  const data = await request('/api/searches', {
    method: 'POST',
    body: request_,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
  });
  return createSearchResponseSchema.parse(data);
}

export async function getJob(id: string, signal?: AbortSignal): Promise<Job> {
  const data = await request(`/api/jobs/${id}`, signal ? { signal } : {});
  return jobSchema.parse(data);
}

export async function getJobEvents(id: string, signal?: AbortSignal): Promise<JobEvent[]> {
  const data = await request(`/api/jobs/${id}/events`, signal ? { signal } : {});
  return jobEventsResponseSchema.parse(data).events;
}

export async function cancelJob(id: string): Promise<Job> {
  const data = await request(`/api/jobs/${id}/cancel`, { method: 'POST' });
  return jobSchema.parse(data);
}

export async function listJobs(signal?: AbortSignal): Promise<Job[]> {
  const data = await request('/api/jobs', signal ? { signal } : {});
  return jobsResponseSchema.parse(data).jobs;
}

export async function listLeads(
  filter: { state?: LeadState; jobId?: string } = {},
  signal?: AbortSignal,
): Promise<Lead[]> {
  const params = new URLSearchParams();
  if (filter.state) params.set('state', filter.state);
  if (filter.jobId) params.set('jobId', filter.jobId);
  const query = params.toString();
  const data = await request(`/api/leads${query ? `?${query}` : ''}`, signal ? { signal } : {});
  return leadsResponseSchema.parse(data).leads;
}
