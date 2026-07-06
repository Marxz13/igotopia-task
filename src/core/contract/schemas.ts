import { z } from 'zod';

// Zod schemas for every API request and response. `types.ts` derives the types.

// Wire constants
// Custom header carrying the client's Idempotency-Key on POST /api/searches.
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

// Shared scalars
const uuid = z.string().uuid();
const isoDateTime = z.string().datetime();

// Enumerations
export const jobStatusSchema = z.enum([
  'queued',
  'discovering',
  'verifying',
  'completed',
  'failed',
  'cancelled',
]);

export const leadStateSchema = z.enum(['unverified_raw', 'verified', 'rejected']);

// One entry in a job's run log. Mirrors the job_events.type CHECK constraint.
export const jobEventTypeSchema = z.enum([
  'queued',
  'discovering',
  'discovered',
  'verifying',
  'completed',
  'failed',
  'crashed',
  'recovered',
  'retry',
  'cancelled',
]);

// Error codes. The code is machine-readable; the message is display-only.
export const errorCodeSchema = z.enum([
  'validation_error', // 400
  'unauthorized', // 401
  'insufficient_credits', // 402
  'not_found', // 404
  'rate_limited', // 429
  'internal_error', // 500
]);

// Error envelope
// Every non-2xx JSON response has this shape.
export const errorResponseSchema = z.object({
  error: errorCodeSchema,
  message: z.string().optional(),
});

// Domain entities
// Search criteria: at least one non-blank company; roles and region optional.
export const searchRequestSchema = z.object({
  companies: z.array(z.string().min(1)).min(1),
  roles: z.array(z.string().min(1)).default([]),
  region: z.string().default(''),
});

// A job row the UI reads. Counts are absolute; `error` is set only when status is 'failed'.
export const jobSchema = z.object({
  id: uuid,
  status: jobStatusSchema,
  request: searchRequestSchema,
  discoveredCount: z.number().int().nonnegative(),
  verifiedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: isoDateTime,
});

// One factor behind a score: a named signal and its points (e.g. { label: 'Head /
// Director title', points: 22 }). A lead's score is just the sum of its factors,
// clamped to 0-100 - so every point traces back to a signal, no black box.
export const scoreFactorSchema = z.object({
  label: z.string(),
  points: z.number().int(),
});

// A lead in the inbox. `score` is set only when verified; `rejectionReason` only when
// rejected. `scoreFactors` holds the per-signal breakdown behind `score` (null if unscored).
export const leadSchema = z.object({
  id: uuid,
  jobId: uuid,
  name: z.string(),
  company: z.string(),
  title: z.string(),
  email: z.string(),
  sourceUrl: z.string().url().nullable(),
  state: leadStateSchema,
  score: z.number().int().min(0).max(100).nullable(),
  scoreFactors: z.array(scoreFactorSchema).nullable(),
  rejectionReason: z.string().nullable(),
});

export const orgSchema = z.object({
  id: uuid,
  name: z.string(),
  credits: z.number().int().nonnegative(),
});

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  name: z.string(),
});

// GET /api/me — session snapshot. `activeOrgId` is null when a multi-org user hasn't picked one.
export const meSchema = z.object({
  user: userSchema,
  orgs: z.array(orgSchema),
  activeOrgId: uuid.nullable(),
});

// Endpoint request bodies
export const loginRequestSchema = z.object({
  email: z.string().email(),
});

export const switchOrgRequestSchema = z.object({
  organizationId: uuid,
});

// Endpoint query params
// GET /api/leads?state=&jobId= — both optional; omitted `state` means "all".
export const leadsQuerySchema = z.object({
  state: leadStateSchema.optional(),
  jobId: uuid.optional(),
});

// Endpoint response bodies
// POST /api/searches -> 202 (accepted, runs in the background) or 200 (idempotent
// replay of the same job).
export const createSearchResponseSchema = z.object({
  jobId: uuid,
  status: jobStatusSchema,
});

export const jobsResponseSchema = z.object({
  jobs: z.array(jobSchema),
});

export const leadsResponseSchema = z.object({
  leads: z.array(leadSchema),
});

// One row of a job's run log, as the timeline UI reads it.
export const jobEventSchema = z.object({
  id: uuid,
  type: jobEventTypeSchema,
  message: z.string(),
  data: z.record(z.union([z.number(), z.string(), z.boolean()])).nullable(),
  createdAt: isoDateTime,
});

// GET /api/jobs/:id/events -> the job's run log, oldest first.
export const jobEventsResponseSchema = z.object({
  events: z.array(jobEventSchema),
});
