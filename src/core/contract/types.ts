import type { z } from 'zod';
import type {
  searchRequestSchema,
  jobStatusSchema,
  leadStateSchema,
  errorCodeSchema,
  errorResponseSchema,
  jobSchema,
  leadSchema,
  scoreFactorSchema,
  orgSchema,
  userSchema,
  meSchema,
  loginRequestSchema,
  switchOrgRequestSchema,
  leadsQuerySchema,
  createSearchResponseSchema,
  jobsResponseSchema,
  leadsResponseSchema,
} from './schemas';

// TypeScript types derived from the contract schemas.

// Domain entities
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type LeadState = z.infer<typeof leadStateSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Lead = z.infer<typeof leadSchema>;
export type ScoreFactor = z.infer<typeof scoreFactorSchema>;
export type Org = z.infer<typeof orgSchema>;
export type User = z.infer<typeof userSchema>;
export type Me = z.infer<typeof meSchema>;

// Errors
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Endpoint requests / queries
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SwitchOrgRequest = z.infer<typeof switchOrgRequestSchema>;
export type LeadsQuery = z.infer<typeof leadsQuerySchema>;

// Endpoint responses
export type CreateSearchResponse = z.infer<typeof createSearchResponseSchema>;
export type JobsResponse = z.infer<typeof jobsResponseSchema>;
export type LeadsResponse = z.infer<typeof leadsResponseSchema>;
