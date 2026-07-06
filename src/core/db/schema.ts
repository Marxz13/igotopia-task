import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { SearchRequest } from '@/core/contract';

// Drizzle schema: the 7 tables backing tenancy, atomic credits, and idempotency.
// The constraints are the real guarantees, not app code: CHECK(credits >= 0) and
// UNIQUE(org, idempotency_key) make double-spend impossible; UNIQUE(job, candidate)
// makes discovery re-runs idempotent. Columns are snake_case; TIMESTAMPTZ; UUID PKs.

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    credits: integer('credits').notNull().default(10),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('organizations_credits_nonneg', sql`${t.credits} >= 0`)],
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per (user, org); backs the "may this user act in this org" check.
    uniqueIndex('memberships_user_org_uq').on(t.userId, t.organizationId),
    index('memberships_user_idx').on(t.userId),
    index('memberships_org_idx').on(t.organizationId),
  ],
);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The cookie holds a random token; only its hash is stored, never the raw token.
  tokenHash: text('token_hash').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  // The only source of org scope. Null until a multi-org user picks one.
  activeOrganizationId: uuid('active_organization_id').references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('queued'),
    requestJson: jsonb('request_json').$type<SearchRequest>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    discoveredCount: integer('discovered_count').notNull().default(0),
    verifiedCount: integer('verified_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A concurrent double-submit collides here, so exactly one job and one charge.
    uniqueIndex('jobs_org_idem_uq').on(t.organizationId, t.idempotencyKey),
    index('jobs_status_idx').on(t.status),
    index('jobs_org_created_idx').on(t.organizationId, t.createdAt.desc()),
    check(
      'jobs_status_chk',
      sql`${t.status} in ('queued','discovering','verifying','completed','failed','cancelled')`,
    ),
  ],
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Denormalized from the parent job so inbox reads filter by org directly.
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    name: text('name').notNull(),
    company: text('company').notNull(),
    title: text('title').notNull(),
    email: text('email').notNull(),
    sourceUrl: text('source_url'),
    state: text('state').notNull().default('unverified_raw'),
    score: integer('score'),
    rejectionReason: text('rejection_reason'),
    candidateKey: text('candidate_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotent discovery insert: a re-run conflicts on every row, so no duplicates.
    uniqueIndex('leads_job_candidate_uq').on(t.jobId, t.candidateKey),
    index('leads_org_state_idx').on(t.organizationId, t.state),
    check('leads_state_chk', sql`${t.state} in ('unverified_raw','verified','rejected')`),
    check('leads_score_chk', sql`${t.score} is null or (${t.score} between 0 and 100)`),
  ],
);

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    jobId: uuid('job_id').references(() => jobs.id),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one charge per job (seed rows have a null job_id, so not constrained).
    uniqueIndex('credit_ledger_job_reason_uq').on(t.jobId, t.reason),
    check('credit_ledger_reason_chk', sql`${t.reason} in ('search_charge','seed','refund')`),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
