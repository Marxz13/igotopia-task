'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Job, Lead } from '@/core/contract';
import { listJobs, listLeads } from '@/app/lib/api';
import { jobCriteria, percent, timeAgo } from '@/app/lib/format';
import { jobLabel, jobTone } from '@/app/lib/tones';
import { useSession } from '@/app/providers/SessionProvider';
import { Badge } from '@/app/components/Badge';
import { CheckIcon, CrossIcon, InboxIcon, SparkIcon } from '@/app/components/icons';

// Loads the org's jobs and leads, derives KPIs client-side. Remounts on
// workspace switch (via OrgScope) so numbers match the active workspace.
export default function OverviewPage() {
  const { credits } = useSession();
  const router = useRouter();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading');
    try {
      const [j, l] = await Promise.all([listJobs(signal), listLeads({}, signal)]);
      setJobs(j);
      setLeads(l);
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

  const verified = leads.filter((l) => l.state === 'verified').length;
  const rejected = leads.filter((l) => l.state === 'rejected').length;
  const unverified = leads.filter((l) => l.state === 'unverified_raw').length;
  const total = leads.length;
  const rate = percent(verified, verified + rejected);

  if (phase === 'error') {
    return (
      <div className="card" style={{ padding: 30, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
          Couldn&apos;t load your overview.{' '}
          <button
            type="button"
            className="btn-soft"
            onClick={() => void load()}
            style={{ marginLeft: 6 }}
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Overview" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14 }}>
        <KpiCard
          label="Credits"
          value={credits}
          accent={credits <= 0 ? 'var(--danger)' : 'var(--brand)'}
          sub="1 credit per search"
          icon={<SparkIcon size={17} />}
          iconBg="#fff4ed"
          iconFg="var(--brand)"
        />
        <KpiCard
          label="Total leads"
          value={total}
          sub={`across ${jobs.length} search${jobs.length === 1 ? '' : 'es'}`}
          icon={<InboxIcon size={17} />}
          iconBg="#eff4ff"
          iconFg="#2563eb"
        />
        <KpiCard
          label="Verified"
          value={verified}
          accent="var(--success)"
          sub={`${rate} verified rate`}
          icon={<CheckIcon size={17} />}
          iconBg="#ecfdf3"
          iconFg="var(--success)"
        />
        <KpiCard
          label="Rejected"
          value={rejected}
          accent="var(--danger)"
          sub="filtered before outreach"
          icon={<CrossIcon size={15} />}
          iconBg="#fef3f2"
          iconFg="#dc2626"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.65fr) minmax(0,1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <RecentSearches
          jobs={jobs}
          loading={phase === 'loading'}
          onView={(id) => router.push(`/inbox?job=${id}`)}
          onViewAll={() => router.push('/inbox')}
          onStart={() => router.push('/search')}
        />
        <PipelineBreakdown
          verified={verified}
          unverified={unverified}
          rejected={rejected}
          total={total}
          rate={rate}
        />
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  iconFg,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  icon: ReactNode;
  iconBg: string;
  iconFg: string;
  accent?: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: iconBg,
            color: iconFg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      </div>
      <div
        className="tnum"
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-.02em',
          color: accent ?? 'var(--ink)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

const PANEL_HEAD: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '15px 18px',
  borderBottom: '1px solid var(--hairline)',
};

function RecentSearches({
  jobs,
  loading,
  onView,
  onViewAll,
  onStart,
}: {
  jobs: Job[];
  loading: boolean;
  onView: (id: string) => void;
  onViewAll: () => void;
  onStart: () => void;
}) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={PANEL_HEAD}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Recent searches</span>
        <button className="row-link" onClick={onViewAll}>
          View all
        </button>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-2)', fontSize: 14 }}>
          <span className="spinner" aria-hidden="true" /> Loading…
        </div>
      ) : jobs.length === 0 ? (
        <div
          style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}
        >
          No searches yet for this workspace.{' '}
          <button className="row-link" onClick={onStart}>
            Start your first search →
          </button>
        </div>
      ) : (
        <div>
          {jobs.map((j) => (
            <div
              key={j.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 18px',
                borderBottom: '1px solid #f6f6f6',
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--muted-2)', flex: 'none' }}
              >
                #{j.id.slice(0, 6)}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {jobCriteria(j)}
                </div>
                <div
                  className="tnum"
                  style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 1 }}
                >
                  {j.discoveredCount} discovered · {j.verifiedCount} verified ·{' '}
                  {timeAgo(j.createdAt)}
                </div>
              </div>
              <Badge tone={jobTone(j.status)} label={jobLabel(j.status)} />
              <button className="row-link" onClick={() => onView(j.id)}>
                View
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineBreakdown({
  verified,
  unverified,
  rejected,
  total,
  rate,
}: {
  verified: number;
  unverified: number;
  rejected: number;
  total: number;
  rate: string;
}) {
  const denom = total || 1;
  const bar = (n: number, color: string): CSSProperties => ({
    width: `${Math.round((n / denom) * 100)}%`,
    height: '100%',
    background: color,
    borderRadius: 4,
  });
  const rows = [
    { label: 'Verified', value: verified, color: '#12b76a', text: 'var(--success)' },
    { label: 'Unverified', value: unverified, color: '#98a2b3', text: '#525252' },
    { label: 'Rejected', value: rejected, color: '#f04438', text: 'var(--danger)' },
  ];
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Pipeline breakdown</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{r.label}</span>
              <span className="tnum" style={{ fontWeight: 600, color: r.text }}>
                {r.value}
              </span>
            </div>
            <div style={{ height: 8, background: '#f3f3f3', borderRadius: 4, overflow: 'hidden' }}>
              <div style={bar(r.value, r.color)} />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Verified rate</span>
        <span className="tnum" style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>
          {rate}
        </span>
      </div>
    </div>
  );
}
