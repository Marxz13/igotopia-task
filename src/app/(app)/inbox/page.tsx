'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Job, Lead, LeadState } from '@/core/contract';
import { listJobs, listLeads } from '@/app/lib/api';
import { jobCriteria } from '@/app/lib/format';
import { leadLabel, leadTone } from '@/app/lib/tones';
import { useSession } from '@/app/providers/SessionProvider';
import { Badge } from '@/app/components/Badge';

type StatusFilter = 'all' | LeadState;

const PAGE_SIZE = 10;

// Fetches leads + jobs once, then filters client-side so filter changes are instant.
// ?job=<id> preselects the job filter.
export default function InboxPage() {
  return (
    <Suspense fallback={<Shell>{<Centered>Loading…</Centered>}</Shell>}>
      <InboxContent />
    </Suspense>
  );
}

function InboxContent() {
  const { activeOrg } = useSession();
  const params = useSearchParams();
  const jobParam = params.get('job');

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [jobFilter, setJobFilter] = useState<string>(jobParam ?? 'all');

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading');
    try {
      const [l, j] = await Promise.all([listLeads({}, signal), listJobs(signal)]);
      setLeads(l);
      setJobs(j);
      setPhase('ready');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const filtered = useMemo(
    () =>
      leads.filter(
        (l) =>
          (statusFilter === 'all' || l.state === statusFilter) &&
          (jobFilter === 'all' || l.jobId === jobFilter),
      ),
    [leads, statusFilter, jobFilter],
  );

  const jobOptions = useMemo(
    () => [
      { value: 'all', label: 'All jobs' },
      ...jobs.map((j) => ({ value: j.id, label: `#${j.id.slice(0, 6)} · ${jobCriteria(j)}` })),
    ],
    [jobs],
  );

  // Click the State header to sort: off -> asc -> desc -> off. Rank orders states by
  // pipeline outcome (verified, then unverified, then rejected); desc reverses it.
  const [stateSort, setStateSort] = useState<'asc' | 'desc' | null>(null);
  const sorted = useMemo(() => {
    if (!stateSort) return filtered;
    const rank: Record<LeadState, number> = { verified: 0, unverified_raw: 1, rejected: 2 };
    const s = [...filtered].sort((a, b) => rank[a.state] - rank[b.state]);
    return stateSort === 'asc' ? s : s.reverse();
  }, [filtered, stateSort]);

  // Client-side pagination over the sorted, filtered leads. Page resets to 1 whenever
  // the filters or sort change so you never land on an out-of-range page.
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [statusFilter, jobFilter, stateSort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageLeads = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const rangeStart = filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(current * PAGE_SIZE, filtered.length);
  const showing =
    filtered.length === 0
      ? 'showing 0 leads'
      : `showing ${rangeStart}–${rangeEnd} of ${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}`;

  return (
    <Shell>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          padding: '15px 18px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="ld-fstatus" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Status
          </label>
          <select
            id="ld-fstatus"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="select-input"
          >
            <option value="all">All</option>
            <option value="unverified_raw">Unverified</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="ld-fjob" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Job
          </label>
          <select
            id="ld-fjob"
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="select-input mono"
          >
            {jobOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <div
          role="status"
          aria-live="polite"
          className="tnum"
          style={{ fontSize: 13, color: 'var(--muted)' }}
        >
          {showing}
        </div>
      </div>

      {phase === 'loading' && <Centered spinner>Loading leads…</Centered>}
      {phase === 'error' && (
        <div
          role="alert"
          style={{ padding: 30, textAlign: 'center', fontSize: 14, color: 'var(--danger)' }}
        >
          Couldn&apos;t load leads.{' '}
          <button
            type="button"
            className="btn-soft"
            onClick={() => void load()}
            style={{ marginLeft: 6 }}
          >
            Retry
          </button>
        </div>
      )}
      {phase === 'ready' && filtered.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          {leads.length === 0
            ? `No leads yet for ${activeOrg?.name ?? 'this workspace'}. Start a search.`
            : 'No leads match these filters.'}
        </div>
      )}
      {phase === 'ready' && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="ld-table">
            <caption className="sr-only">Leads for {activeOrg?.name}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Company</th>
                <th scope="col">Title</th>
                <th scope="col">Email</th>
                <th
                  scope="col"
                  aria-sort={
                    stateSort === 'asc' ? 'ascending' : stateSort === 'desc' ? 'descending' : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setStateSort((s) => (s === null ? 'asc' : s === 'asc' ? 'desc' : null))
                    }
                    title="Sort by state"
                    style={{
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit',
                      letterSpacing: 'inherit',
                      textTransform: 'inherit',
                      color: 'inherit',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    State
                    <span
                      style={{ fontSize: 10, color: stateSort ? 'var(--brand)' : 'var(--muted-2)' }}
                    >
                      {stateSort === 'asc' ? '▲' : stateSort === 'desc' ? '▼' : '↕'}
                    </span>
                  </button>
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {pageLeads.map((l) => (
                <LeadRow key={l.id} lead={l} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {phase === 'ready' && pageCount > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 18px',
            borderTop: '1px solid var(--hairline)',
          }}
        >
          <span className="tnum" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Page {current} of {pageCount}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn-soft"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={current <= 1}
            >
              ← Prev
            </button>
            <button
              type="button"
              className="btn-soft"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={current >= pageCount}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const verified = lead.state === 'verified';
  const factors = lead.scoreFactors ?? [];
  const hasEvidence = verified && lead.score !== null && factors.length > 0;
  const isRejected = lead.state === 'rejected' && !!lead.rejectionReason;
  const [open, setOpen] = useState(false);
  const detailBelow = open && (hasEvidence || isRejected);
  return (
    <>
      <tr style={{ borderBottom: detailBelow ? 'none' : '1px solid #f4f4f4' }}>
        <td style={{ padding: '12px 18px', fontWeight: 600 }}>{lead.name}</td>
        <td style={{ padding: '12px 18px', color: 'var(--ink-2)' }}>{lead.company}</td>
        <td style={{ padding: '12px 18px', color: 'var(--ink-2)' }}>{lead.title}</td>
        <td style={{ padding: '12px 18px' }}>
          <a
            href={`mailto:${lead.email}`}
            className="mono"
            style={{ fontSize: 12, color: verified ? 'var(--brand)' : 'var(--muted)' }}
          >
            {lead.email}
          </a>
        </td>
        <td style={{ padding: '12px 18px' }}>
          {isRejected ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              title="Show rejection reason"
              style={{
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Badge tone={leadTone(lead.state)} label={leadLabel(lead.state)} plain />
              <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{open ? '▾' : '▸'}</span>
            </button>
          ) : (
            <Badge tone={leadTone(lead.state)} label={leadLabel(lead.state)} plain />
          )}
        </td>
        <td
          className="tnum"
          style={{
            padding: '12px 18px',
            textAlign: 'right',
            color: verified ? 'var(--ink)' : '#c4c4c4',
            fontWeight: verified ? 600 : 400,
          }}
        >
          {hasEvidence ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              title="Show score breakdown"
              className="tnum"
              style={{
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--ink)',
                fontWeight: 600,
                textDecoration: 'underline dotted',
                textUnderlineOffset: 3,
              }}
            >
              {lead.score} / 100 {open ? '▾' : '▸'}
            </button>
          ) : verified && lead.score !== null ? (
            `${lead.score} / 100`
          ) : (
            '-'
          )}
        </td>
      </tr>
      {hasEvidence && open && (
        <tr style={{ borderBottom: '1px solid #f4f4f4' }}>
          <td colSpan={6} style={{ padding: '0 18px 14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted-2)', marginRight: 2 }}>
                Why {lead.score}:
              </span>
              {factors.map((f) => {
                const pos = f.points >= 0;
                return (
                  <span
                    key={f.label}
                    style={{
                      fontSize: 12,
                      color: pos ? '#067647' : '#b42318',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.label}{' '}
                    <span className="tnum" style={{ fontWeight: 700 }}>
                      {pos ? '+' : ''}
                      {f.points}
                    </span>
                  </span>
                );
              })}
            </div>
          </td>
        </tr>
      )}
      {isRejected && open && (
        <tr style={{ borderBottom: '1px solid #f4f4f4' }}>
          <td colSpan={6} style={{ padding: '0 18px 12px 18px' }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--danger)' }}>
              reason: {lead.rejectionReason}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Leads inbox">
      <div className="card" style={{ overflow: 'hidden' }}>
        {children}
      </div>
    </section>
  );
}

function Centered({ children, spinner }: { children: React.ReactNode; spinner?: boolean }) {
  return (
    <div
      style={{
        padding: 44,
        textAlign: 'center',
        color: 'var(--muted-2)',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
      }}
    >
      {spinner && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}
