# Lead Discovery Pipeline

A small multi-tenant lead tool. A user submits who they want to find, the system runs a
two-stage background job (**discover → verify**), and the results land in an inbox they can
review. Each organization only ever sees its own jobs and leads.

> **Live demo:** https://gecko.marzallan.com, sign in with `marz@test.com` (passwordless).

---

## What it does

- Sign in as a demo user and pick a workspace (organization).
- Start a search (companies, roles, region). This costs **1 credit** and returns a `job_id`
  immediately (**HTTP 202**); the pipeline runs in the background.
- A background worker finds candidate leads, then verifies each one (approve or reject).
- Watch the job progress live with an activity log, **cancel** an in-flight job, then browse the
  leads in an inbox and filter by status.

---

## Tech stack

| Area       | Choice                                           |
| ---------- | ------------------------------------------------ |
| Framework  | Next.js 15 (App Router) + React 19               |
| Language   | TypeScript (frontend + backend)                  |
| Database   | Postgres, via Drizzle ORM                        |
| Queue      | Redis + BullMQ (two queues: discover, verify)    |
| Validation | Zod, one shared contract for API + worker + UI   |
| Logging    | Pino (structured JSON logs)                      |
| Tests      | Vitest (64 tests)                                |
| Dev mock   | MSW for the frontend (off by default)            |
| Tooling    | ESLint, Prettier, Husky, commitlint, drizzle-kit |

---

## Architecture

The web app and the worker are two separate processes. They only talk through Postgres
(the source of truth) and Redis (the job queue). The HTTP request never runs provider work;
it just creates the job, charges the credit, and enqueues stage one.

```mermaid
flowchart LR
    U["Browser (search form,<br/>progress, inbox)"]

    subgraph web["Next.js app"]
        API["API routes<br/>(auth, searches, jobs, leads)"]
    end

    subgraph worker["Worker process"]
        D["Stage 1: discover"]
        V["Stage 2: verify"]
        S["Sweeper<br/>(recovers stuck jobs)"]
    end

    PG[("Postgres<br/>jobs, leads, credits")]
    RQ[("Redis / BullMQ<br/>discover + verify queues")]

    U -->|"start search / poll / list leads"| API
    API -->|"1 tx: create job + charge credit"| PG
    API -->|"enqueue discover"| RQ

    RQ --> D
    D -->|"insert candidate leads"| PG
    D -->|"enqueue verify"| RQ
    RQ --> V
    V -->|"score / reject each lead"| PG

    S -.->|"re-enqueue non-terminal jobs"| RQ
    API -->|"read status + counts"| PG
    U -->|"GET /api/jobs/:id (poll)"| API
```

**Job states:** `queued → discovering → verifying → completed` (or `failed`). A user can
**cancel** an in-flight job from the UI (any non-terminal state → `cancelled`).

**Lead states:** `unverified_raw` → `verified` or `rejected` (with a `rejection_reason`).

---

## Core MVP features

- **Multi-tenant.** Every job, lead, and credit row carries an `organization_id`. The org is
  read only from the session, never from the request body, so one org can't reach another
  org's data. A cross-org `job_id` returns **404**, not the row; leads are only ever listed
  org-scoped, so another org's leads never appear in the inbox.
- **Credits.** Each search costs 1 credit. The credit charge and the job creation happen in a
  **single database transaction**, so a failed charge rolls the whole thing back. Double-clicking
  submit spends only 1 credit (idempotency key + unique constraint).
- **Two real stages.** Discover and verify are separate BullMQ queues handled by a separate
  worker. Verification does **not** run inside the HTTP handler.
- **Inbox.** Leads are listed per org and can be filtered by status.
- **Idempotent + restart-safe.** Re-running a job (or a worker crash after discover) never
  duplicates leads. See [Idempotency & recovery](#idempotency--recovery).
- **Errors surface.** A failed job stores its error and the UI shows it.
- **Cancel.** An in-flight job can be cancelled from the UI. Status advances are conditional
  updates (`WHERE status = <from>`), so the worker never clobbers a cancel; it also checks for
  cancellation during its stage pause, so the pipeline stops cleanly mid-run.
- **Activity log.** Every job keeps a per-run timeline (`queued`, `discovering`, `discovered N`,
  `verifying`, `completed`, plus `crashed` / `recovered` / `retry` / `cancelled`), appended by the
  backend (worker for the stage events, API for `queued` / `cancelled`) and shown live under the
  progress card. A crash + recovery shows as two discovery passes.
- **Explainable scoring (extra).** A verified lead gets a 0-100 score built from named factors
  (title seniority, corporate domain, named mailbox, etc.), not a black-box number.
- **Rate limit (extra).** Start-search is capped per org (default **3 per 10s**, a Redis
  fixed-window). Over the cap the API returns **429** with a `Retry-After`, and the UI shows a live
  cooldown. The check runs **before** the credit charge, so a blocked burst never spends credits.

---

## Mock data & providers

Real SERP/email APIs are swapped out for mocks that behave like the real thing but need no keys.
Both sit behind interfaces (`DiscoverProvider`, `VerifyProvider`) so a real provider can drop in
later; see [Plugging in a real provider](#plugging-in-a-real-provider).

**Mock discover** (`src/core/providers/mock-discover.ts`)

- Deterministic: seeded by `job_id`, so the same job always produces the same candidates. This is
  what makes runs testable and re-runs safe.
- Produces 3-5 contacts per company with varied names; titles cycle through the roles you searched.
  Capped at 50 candidates per job (the brief's 0-50 range).
- Always includes at least one **junk email** per company (`info@…` or `noreply@…`) so the verify
  step has something to reject.
- Two test sentinels you can type as a company name:
  - `__empty__` → returns 0 candidates (job still completes, empty inbox).
  - `__fail__` → throws, so you can see the **failed** job path in the UI.

**Mock verify** (`src/core/providers/mock-verify.ts`)

- Rejects any email containing `noreply` or starting with `info@`, with a reason.
- Otherwise approves and returns a 0-100 score plus the factors that make it up.

**Seed data** (`npm run seed`, `scripts/seed.ts`): 2 orgs, 2 users, different credit balances:

| User             | Password | Workspaces (orgs)           | Credits            |
| ---------------- | -------- | --------------------------- | ------------------ |
| `marz@test.com`  | none     | Marz Labs                   | Marz Labs = **10** |
| `allan@test.com` | none     | Marz Labs **and** Allan Inc | Allan Inc = **1**  |

Login is passwordless (email only); this is a demo. Allan Inc starts with 1 credit so you can
hit the "no credits" path quickly. Allan belongs to two orgs, which lets you test the workspace
switcher and prove isolation.

---

## Run it locally

**Requirements:** Node 20+ and Docker (for Postgres + Redis).

```bash
# 1. Environment
cp .env.example .env

# 2. Start Postgres + Redis
docker compose up -d postgres redis

# 3. Install, migrate, seed
npm install
npm run migrate
npm run seed

# 4. Run the app and the worker in two terminals
npm run dev      # terminal 1  -> http://localhost:3000
npm run worker   # terminal 2
```

Then open http://localhost:3000 and sign in with `marz@test.com`. Start a search (e.g. companies
`Marriott`, role `Director of Sales`, region `Malaysia`) and watch it move through discover →
verify. To see the **per-org rate limit**, click **Start search** four times quickly — the fourth
returns 429 and the form shows a cooldown (default 3 per 10s).

> The base `docker-compose.yml` only runs Postgres + Redis for local dev. A full-stack image
> (app + worker + Caddy) also exists in `docker-compose.prod.yml` for deployment.

### Commands

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Start the Next.js app                              |
| `npm run worker`    | Start the background worker (discover + verify)    |
| `npm run migrate`   | Apply database migrations                          |
| `npm run seed`      | Create the demo orgs, users, and credits           |
| `npm test`          | Run all tests (needs Postgres + Redis up)          |
| `npm run test:ui`   | Run only the pure/frontend tests (no infra needed) |
| `npm run typecheck` | Type-check with `tsc`                              |
| `npm run lint`      | Lint with ESLint                                   |

---

## Tests

```bash
npm test        # all 64 tests (backend tests need Postgres + Redis running)
npm run test:ui # pure logic + frontend only, no database
```

They cover the parts most likely to break: atomic credit charge, double-submit, cross-org
isolation, the discover/verify state machine, crash-and-restart with no duplicate leads, cancel
(including cancel mid-stage without clobbering it), the activity-log event sequence, the per-org
rate limit, mock providers, and the scoring logic.

---

## How the parts work

### Multi-tenancy

The active organization lives on the **session row**, not in the request. Every API route reads
`orgId` from the session and passes it into the database query, and every tenant query filters on
`organization_id`. There is no way to send an org id from the client. Membership is also
re-checked on every request, so access revoked mid-session stops right away instead of lasting
until the cookie expires.

### Credits

`startSearch` runs one Postgres transaction that:

1. Inserts the job with a `UNIQUE(org, idempotency_key)` constraint, so a double-click collapses
   to one job.
2. Charges the credit with `UPDATE … SET credits = credits - 1 WHERE credits >= 1`. If no row is
   updated (no credits), the whole transaction rolls back → HTTP 402.
3. Writes a credit-ledger row.

Because it's one transaction, the charge and the job are always consistent: you never get a job
without a charge, or a charge without a job.

### Idempotency & recovery

- **Same job twice.** Leads have a `UNIQUE(job_id, candidate_key)` constraint and are inserted
  with `ON CONFLICT DO NOTHING`. Re-running discover inserts the same keys again, so every row
  conflicts and nothing is duplicated.
- **Worker crash after discover.** Set `CRASH_AFTER_DISCOVER=1` in `.env` and start a search. The
  worker inserts the leads, then exits before moving to verify. On restart, the job is still
  `discovering`, so it re-runs discover; the inserts conflict (0 duplicates) and it continues to
  verify. This is covered by a test.
- **Lost enqueue.** If the database commits but the enqueue is lost, a **sweeper** runs on worker
  startup and every 10s, finds non-terminal jobs with no queued work, and re-enqueues them at the
  right stage. Deterministic queue ids (`discover-<jobId>`) make re-enqueue a no-op if one already
  exists.

### Plugging in a real provider

The pipeline only depends on two interfaces (`src/core/providers/types.ts`):

```ts
interface DiscoverProvider {
  discover(input: SearchRequest, jobId: string): Promise<CandidateLead[]>;
}
interface VerifyProvider {
  verify(candidate: CandidateLead): Promise<VerifyResult>;
}
```

These deliberately extend the brief's interface: `discover` also takes `jobId` (seeds the
deterministic mock so a re-run regenerates identical candidates, the load-bearing crash-idempotency
property), and `VerifyResult` is a superset of `{ ok, reason? }` that also carries the `score` +
`factors` behind an approval, for the explainable-scoring extra.

To use a real one:

1. Implement `createRealDiscoverProvider` / `createRealVerifyProvider` in
   `src/core/providers/real/index.ts` (currently a stub with TODO notes). Map each SERP hit to a
   `CandidateLead` with a **stable** `candidateKey` so re-runs stay idempotent.
2. Set `PROVIDER_MODE=real` in `.env`. The factory in `src/core/providers/index.ts` switches to it;
   nothing else in the pipeline changes.
3. Put API keys in `.env`, and never commit them.

---

## Environment variables

| Variable                | Default        | What it's for                                                                    |
| ----------------------- | -------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`          | local Postgres | Postgres connection string                                                       |
| `REDIS_URL`             | local Redis    | Redis connection string                                                          |
| `POSTGRES_PORT`         | `5432`         | Host port for the Postgres container                                             |
| `REDIS_PORT`            | `6379`         | Host port for the Redis container                                                |
| `SESSION_SECRET`        | _(required)_   | Signs the session cookie; min 16 chars, no code default; set a long random value |
| `PROVIDER_MODE`         | `mock`         | `mock` or `real`                                                                 |
| `WORKER_CONCURRENCY`    | `5`            | Jobs processed at once per stage                                                 |
| `RATE_LIMIT_MAX`        | `3`            | Max start-search calls per org per window (`0` disables)                         |
| `RATE_LIMIT_WINDOW_MS`  | `10000`        | Rate-limit window in ms                                                          |
| `STAGE_DELAY_MS`        | `0`            | Pause per stage (ms); `.env` sets `2000` so progress and cancel are watchable    |
| `QUEUE_PREFIX`          | `bull`         | BullMQ key prefix (tests use a separate prefix so a dev worker can't race them)  |
| `CRASH_AFTER_DISCOVER`  | `0`            | Set to `1` to demo crash recovery                                                |
| `NEXT_PUBLIC_USE_MOCKS` | `false`        | Use the MSW frontend mock instead of real API                                    |
| `NODE_ENV`              | `development`  | `development` / `test` / `production`                                            |

---

## Production next steps

Out of scope for the take-home; what I'd actually do for a real deployment.

**Cost.** With a real scraper the bill is proxy bytes, not servers: rotating residential IPs billed
per GB. So push as few bytes as possible through the pricey ones: cache scrapes keyed by query with a
TTL, shared across orgs (repeat searches are the biggest save); use plain HTTP + a parser instead of
headless whenever the page doesn't need JS, and block images/fonts when it does; try cheap datacenter
IPs first and fall back to residential only on a block (~10x on the bill); be polite per domain to
get blocked less.

**Deploy.** Let the real pain point drive each step, not a schedule:

1. **Blue-green on the single box**, two compose stacks behind Caddy: bring the new one up,
   health-check, flip, keep the old warm for one-command rollback. Removes the current
   recreate-the-stack downtime; safe because the worker drains on SIGTERM and inserts are idempotent.
   Needs backward-compatible migrations (add first, drop later) since both colours share the DB.
2. **Postgres + Redis off the box** onto RDS/ElastiCache, a DB on one VM is the scariest thing here;
   worth more than any deploy polish.
3. **Pull the worker out and autoscale on queue depth** (spot) when one box can't keep up; the web
   side barely grows since polling stops on terminal, and a killed job just re-runs cleanly.
4. **Kubernetes only** if this grows into enough services to justify it; ECS/Fargate or Nomad goes a
   long way for one app + one worker.

**Also:** transactional outbox to replace the sweeper; rate limiter + circuit breaker around the real
provider; partition the leads table once large; real metrics (queue lag, cost per job, cache hit
rate) with alerting; credit prices matching real cost and tuning the per-org rate limit to match;
proper auth (passwords or SSO + CSRF).
