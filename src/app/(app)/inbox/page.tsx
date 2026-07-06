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

  const showing = `showing ${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}`;

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
                <th scope="col">State</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <LeadRow key={l.id} lead={l} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const verified = lead.state === 'verified';
  return (
    <>
      <tr style={{ borderBottom: lead.rejectionReason ? 'none' : '1px solid #f4f4f4' }}>
        <td style={{ padding: '12px 18px', fontWeight: 600 }}>{lead.name}</td>
        <td style={{ padding: '12px 18px', color: 'var(--ink-2)' }}>{lead.company}</td>
        <td style={{ padding: '12px 18px', color: 'var(--ink-2)' }}>{lead.title}</td>
        <td style={{ padding: '12px 18px' }}>
          <Badge tone={leadTone(lead.state)} label={leadLabel(lead.state)} />
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
          {verified && lead.score !== null ? `${lead.score} / 100` : '—'}
        </td>
      </tr>
      {lead.state === 'rejected' && lead.rejectionReason && (
        <tr style={{ borderBottom: '1px solid #f4f4f4' }}>
          <td colSpan={5} style={{ padding: '0 18px 12px 18px' }}>
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
