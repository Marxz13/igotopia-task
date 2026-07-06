// In-memory store for the MSW mock. Seeds two orgs and two users, and handles
// credit charging, idempotent replay, cross-org 404s, and timed job progression
// (queued -> discovering -> verifying -> completed) derived from wall-clock time.

import type {
  Job,
  Lead,
  LeadsQuery,
  LeadState,
  Me,
  Org,
  ScoreFactor,
  SearchRequest,
} from '@/core/contract';
import { scoreCandidate } from '@/core/providers/mock-verify';

// Fixed identities (valid UUIDs).
const MARZLABS_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALLANINC_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const MARZ_ID = 'a1a1a1a1-0000-4000-8000-000000000001';
const ALLAN_ID = 'a2a2a2a2-0000-4000-8000-000000000001';

// Sentinel inputs for empty and failed outcomes.
// A search containing one of these company names forces that outcome.
export const EMPTY_COMPANY = '__empty__';
export const FAIL_COMPANY = '__fail__';

// Progression thresholds (ms since job creation).
const T_QUEUED_MS = 700;
const T_DISCOVER_END_MS = 2200;
const T_VERIFY_END_MS = 4200;

interface MockUser {
  id: string;
  email: string;
  name: string;
}

interface MockLead {
  id: string;
  jobId: string;
  name: string;
  company: string;
  title: string;
  email: string;
  sourceUrl: string | null;
  state: LeadState;
  score: number | null;
  scoreFactors: ScoreFactor[] | null;
  rejectionReason: string | null;
}

interface MockJob {
  id: string;
  orgId: string;
  createdByUserId: string;
  request: SearchRequest;
  idempotencyKey: string | null;
  createdAtMs: number;
  outcome: 'ok' | 'empty' | 'fail';
  error: string | null;
  leads: MockLead[];
}

interface Session {
  userId: string;
  activeOrgId: string | null;
}

interface Store {
  orgs: Map<string, Org>;
  users: MockUser[];
  memberships: Array<{ userId: string; orgId: string }>;
  jobs: MockJob[];
  // (orgId + idempotency key) -> jobId, so a duplicate submit replays one job.
  idempotency: Map<string, string>;
  session: Session | null;
}

function initialStore(): Store {
  return {
    orgs: new Map<string, Org>([
      [MARZLABS_ID, { id: MARZLABS_ID, name: 'Marz Labs', credits: 10 }],
      [ALLANINC_ID, { id: ALLANINC_ID, name: 'Allan Inc', credits: 1 }],
    ]),
    users: [
      { id: MARZ_ID, email: 'marz@test.com', name: 'Marz' },
      { id: ALLAN_ID, email: 'allan@test.com', name: 'Allan' },
    ],
    memberships: [
      { userId: MARZ_ID, orgId: MARZLABS_ID },
      { userId: ALLAN_ID, orgId: MARZLABS_ID },
      { userId: ALLAN_ID, orgId: ALLANINC_ID },
    ],
    jobs: [],
    idempotency: new Map<string, string>(),
    session: null,
  };
}

let store = initialStore();

/** Reset to the seeded baseline — used between tests. */
export function resetDb(): void {
  store = initialStore();
}

// Deterministic PRNG (xmur3 seed -> mulberry32), keyed by input.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seeded(key: string): () => number {
  return mulberry32(xmur3(key)());
}

function pick<T>(arr: readonly T[], r: number): T {
  const value = arr[Math.floor(r * arr.length) % arr.length];
  if (value === undefined) throw new Error('pick from empty pool');
  return value;
}

const FIRST_NAMES = [
  'Marz',
  'Lebron',
  'Syamim',
  'Ali',
  'Daniel',
  'Priya',
  'Liam',
  'Nadia',
  'Tom',
  'Sara',
] as const;
const LAST_NAMES = [
  'Ladina',
  'John',
  'Cena',
  'Michael',
  'Jackson',
  'Patel',
  'James',
  'Rahman',
  'Blake',
  'Brown',
] as const;

function slug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'example';
}

// Generates leads deterministically from the search input. Junk emails
// (info@/noreply@) become rejected; clean emails become verified with a score.
function generateLeads(jobId: string, request: SearchRequest): MockLead[] {
  const seedKey = [request.companies.join(','), request.roles.join(','), request.region].join('|');
  const roles = request.roles.length > 0 ? request.roles : ['Sales Lead'];
  const leads: MockLead[] = [];

  for (const company of request.companies) {
    const domain = `${slug(company)}.com`;
    const countRng = seeded(`${seedKey}:${company}:count`);
    const count = 3 + Math.floor(countRng() * 3); // 3-5 leads

    for (let i = 0; i < count; i++) {
      const r = seeded(`${seedKey}:${company}:${i}`);
      const first = pick(FIRST_NAMES, r());
      const last = pick(LAST_NAMES, r());
      const role = roles[i % roles.length] ?? 'Sales Lead';
      // The last lead per company is always junk; the rest are junk about 20% of the time.
      const roll = r();
      const junk = i === count - 1 || roll < 0.2;
      const email = junk
        ? `${r() < 0.5 ? 'noreply' : 'info'}@${domain}`
        : `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
      const name = `${first} ${last}`;
      const sourceUrl = `https://${domain}/team`;
      // Clean leads get the same feature-based score + evidence the BE verifier
      // produces (shared scorer) — the mock never diverges from real behavior.
      const scored = junk
        ? null
        : scoreCandidate({
            candidateKey: `${slug(company)}:${i}`,
            name,
            company,
            title: role,
            email,
            sourceUrl,
          });

      leads.push({
        id: crypto.randomUUID(),
        jobId,
        name,
        company,
        title: role,
        email,
        sourceUrl,
        state: junk ? 'rejected' : 'verified',
        score: scored ? scored.score : null,
        scoreFactors: scored ? scored.factors : null,
        rejectionReason: junk ? 'Disposable / role-based email address' : null,
      });
    }
  }

  return leads;
}

function ramp(elapsed: number, start: number, end: number, total: number): number {
  if (elapsed <= start) return 0;
  if (elapsed >= end) return total;
  return Math.round(((elapsed - start) / (end - start)) * total);
}

// Session / identity helpers
export function getSession(): Session | null {
  return store.session;
}

export function findUserByEmail(email: string): MockUser | undefined {
  const normalized = email.trim().toLowerCase();
  return store.users.find((u) => u.email.toLowerCase() === normalized);
}

function orgsForUser(userId: string): Org[] {
  return store.memberships
    .filter((m) => m.userId === userId)
    .map((m) => store.orgs.get(m.orgId))
    .filter((o): o is Org => o !== undefined);
}

export function isMember(userId: string, orgId: string): boolean {
  return store.memberships.some((m) => m.userId === userId && m.orgId === orgId);
}

/** Log a user in; single-org users get an active org immediately, multi-org null. */
export function login(userId: string): void {
  const orgs = orgsForUser(userId);
  store.session = {
    userId,
    activeOrgId: orgs.length === 1 ? (orgs[0]?.id ?? null) : null,
  };
}

export function logout(): void {
  store.session = null;
}

export function setActiveOrg(orgId: string): void {
  if (store.session) store.session.activeOrgId = orgId;
}

/** The GET /api/me snapshot for the current session, or null if signed out. */
export function buildMe(): Me | null {
  const session = store.session;
  if (!session) return null;
  const user = store.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return {
    user: { id: user.id, email: user.email, name: user.name },
    orgs: orgsForUser(user.id),
    activeOrgId: session.activeOrgId,
  };
}

// Credits / searches
export function getCredits(orgId: string): number {
  return store.orgs.get(orgId)?.credits ?? 0;
}

/** Returns the existing job id for a seen (orgId, key), or null. */
export function peekReplay(orgId: string, idempotencyKey: string | null): string | null {
  if (!idempotencyKey) return null;
  return store.idempotency.get(`${orgId}:${idempotencyKey}`) ?? null;
}

export interface CreateSearchOutcome {
  kind: 'created' | 'replayed';
  jobId: string;
}

/**
 * Charges one credit and creates a job, or replays the existing job for a
 * repeated (orgId, key) with no second charge.
 */
export function createSearch(
  orgId: string,
  userId: string,
  request: SearchRequest,
  idempotencyKey: string | null,
): CreateSearchOutcome {
  if (idempotencyKey) {
    const existing = store.idempotency.get(`${orgId}:${idempotencyKey}`);
    if (existing) return { kind: 'replayed', jobId: existing };
  }

  const org = store.orgs.get(orgId);
  if (org) org.credits -= 1;

  const id = crypto.randomUUID();
  const companies = request.companies.map((c) => c.trim().toLowerCase());
  const outcome: MockJob['outcome'] = companies.includes(FAIL_COMPANY)
    ? 'fail'
    : companies.includes(EMPTY_COMPANY)
      ? 'empty'
      : 'ok';

  const job: MockJob = {
    id,
    orgId,
    createdByUserId: userId,
    request,
    idempotencyKey,
    createdAtMs: Date.now(),
    outcome,
    error: outcome === 'fail' ? 'Provider unavailable — discovery failed.' : null,
    leads: outcome === 'ok' ? generateLeads(id, request) : [],
  };
  store.jobs.push(job);
  if (idempotencyKey) store.idempotency.set(`${orgId}:${idempotencyKey}`, id);
  return { kind: 'created', jobId: id };
}

// Read models (org-scoped).
function findJob(orgId: string, jobId: string): MockJob | undefined {
  return store.jobs.find((j) => j.id === jobId && j.orgId === orgId);
}

function deriveStatus(job: MockJob, now: number): Job {
  const elapsed = now - job.createdAtMs;
  const total = job.leads.length;
  const base = {
    id: job.id,
    request: job.request,
    createdAt: new Date(job.createdAtMs).toISOString(),
  };

  if (job.outcome === 'fail') {
    const status =
      elapsed < T_QUEUED_MS ? 'queued' : elapsed < T_DISCOVER_END_MS ? 'discovering' : 'failed';
    return {
      ...base,
      status,
      discoveredCount: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      error: status === 'failed' ? job.error : null,
    };
  }

  if (elapsed < T_QUEUED_MS) {
    return {
      ...base,
      status: 'queued',
      discoveredCount: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      error: null,
    };
  }
  if (elapsed < T_DISCOVER_END_MS) {
    return {
      ...base,
      status: 'discovering',
      discoveredCount: ramp(elapsed, T_QUEUED_MS, T_DISCOVER_END_MS, total),
      verifiedCount: 0,
      rejectedCount: 0,
      error: null,
    };
  }
  if (elapsed < T_VERIFY_END_MS) {
    const resolved = ramp(elapsed, T_DISCOVER_END_MS, T_VERIFY_END_MS, total);
    const verified = job.leads.slice(0, resolved).filter((l) => l.state === 'verified').length;
    return {
      ...base,
      status: 'verifying',
      discoveredCount: total,
      verifiedCount: verified,
      rejectedCount: resolved - verified,
      error: null,
    };
  }
  const verified = job.leads.filter((l) => l.state === 'verified').length;
  return {
    ...base,
    status: 'completed',
    discoveredCount: total,
    verifiedCount: verified,
    rejectedCount: total - verified,
    error: null,
  };
}

function toContractLead(lead: MockLead, resolved: boolean): Lead {
  if (resolved) {
    return {
      id: lead.id,
      jobId: lead.jobId,
      name: lead.name,
      company: lead.company,
      title: lead.title,
      email: lead.email,
      sourceUrl: lead.sourceUrl,
      state: lead.state,
      score: lead.score,
      scoreFactors: lead.scoreFactors,
      rejectionReason: lead.rejectionReason,
    };
  }
  // Discovered but not yet verified, so shown as unverified_raw.
  return {
    id: lead.id,
    jobId: lead.jobId,
    name: lead.name,
    company: lead.company,
    title: lead.title,
    email: lead.email,
    sourceUrl: lead.sourceUrl,
    state: 'unverified_raw',
    score: null,
    scoreFactors: null,
    rejectionReason: null,
  };
}

function deriveLeadsFor(job: MockJob, now: number): Lead[] {
  if (job.outcome !== 'ok') return [];
  const elapsed = now - job.createdAtMs;
  if (elapsed < T_QUEUED_MS) return [];
  const total = job.leads.length;
  const discovered =
    elapsed < T_DISCOVER_END_MS ? ramp(elapsed, T_QUEUED_MS, T_DISCOVER_END_MS, total) : total;
  const resolved =
    elapsed < T_DISCOVER_END_MS ? 0 : ramp(elapsed, T_DISCOVER_END_MS, T_VERIFY_END_MS, total);
  return job.leads.slice(0, discovered).map((lead, i) => toContractLead(lead, i < resolved));
}

/** GET /api/jobs/:id — org-scoped; undefined => caller returns 404. */
export function getJob(orgId: string, jobId: string, now = Date.now()): Job | undefined {
  const job = findJob(orgId, jobId);
  return job ? deriveStatus(job, now) : undefined;
}

/** GET /api/jobs — active-org list, newest first. */
export function listJobs(orgId: string, now = Date.now()): Job[] {
  return store.jobs
    .filter((j) => j.orgId === orgId)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((j) => deriveStatus(j, now));
}

/** GET /api/leads — org-scoped, optionally filtered by state and/or job. */
export function listLeads(orgId: string, filter: LeadsQuery, now = Date.now()): Lead[] {
  return store.jobs
    .filter((j) => j.orgId === orgId && (filter.jobId === undefined || j.id === filter.jobId))
    .flatMap((j) => deriveLeadsFor(j, now))
    .filter((l) => filter.state === undefined || l.state === filter.state);
}
