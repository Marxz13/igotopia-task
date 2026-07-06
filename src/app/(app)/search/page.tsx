'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, createSearch } from '@/app/lib/api';
import { getIdemKey, rotateIdemKey } from '@/app/lib/idempotency';
import { useSession } from '@/app/providers/SessionProvider';
import { JobProgress } from '@/app/components/JobProgress';

type FormError = { kind: 'validation' | 'alert'; text: string } | null;

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Credit-spending write. Guards against double charges: submitting flag, per-org
// idempotency key that rides retries, and rotating the key only after the server acks.
export default function SearchPage() {
  const { credits, activeOrgId, activeOrg, refreshMe } = useSession();
  const router = useRouter();

  const [companies, setCompanies] = useState('');
  const [roles, setRoles] = useState('');
  const [region, setRegion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<FormError>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // Rate-limit cooldown: set on a 429, counted down and cleared when it elapses.
  const [rateLimit, setRateLimit] = useState<{ message: string; until: number } | null>(null);
  const [rlNow, setRlNow] = useState(0);

  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (formError?.kind === 'alert') alertRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (!rateLimit) return;
    setRlNow(Date.now());
    const t = setInterval(() => setRlNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [rateLimit]);
  const rlSecondsLeft = rateLimit ? Math.max(0, Math.ceil((rateLimit.until - rlNow) / 1000)) : 0;
  useEffect(() => {
    if (rateLimit && rlNow && rlSecondsLeft <= 0) setRateLimit(null);
  }, [rateLimit, rlNow, rlSecondsLeft]);

  const noCredits = credits < 1;
  const submitDisabled = submitting || noCredits;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !activeOrgId) return;

    const companyList = parseCsv(companies);
    if (companyList.length < 1) {
      setFormError({ kind: 'validation', text: 'Enter at least one company.' });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const idemKey = getIdemKey(activeOrgId);
    const request = { companies: companyList, roles: parseCsv(roles), region: region.trim() };

    try {
      const res = await createSearch(request, idemKey);
      rotateIdemKey(activeOrgId); // server acknowledged - safe to start a fresh key
      setJobId(res.jobId); // search succeeded - commit it before the best-effort refresh
      setRateLimit(null); // a success clears any lingering cooldown banner
      try {
        await refreshMe(); // reflect the charge in the credits pill
      } catch {
        // a credits-refresh failure must not surface as a failed search
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        await refreshMe();
        setFormError({
          kind: 'alert',
          text: `Insufficient credits for ${activeOrg?.name ?? 'this workspace'}. Switch workspace to continue.`,
        });
      } else if (err instanceof ApiError && err.status === 429) {
        setRateLimit({ message: err.message, until: Date.now() + (err.retryAfterMs ?? 10_000) });
      } else {
        setFormError({
          kind: 'alert',
          text: 'Something went wrong starting the search. Try again.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setJobId(null);
    setFormError(null);
  }

  return (
    <section aria-label="New search" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 22 }}>
        <form onSubmit={submit}>
          <fieldset
            style={{
              border: 0,
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <legend className="sr-only">Search criteria</legend>
            <div>
              <label htmlFor="ld-co" className="field-label">
                Companies <span className="hint">- at least one, comma-separated</span>
              </label>
              <input
                id="ld-co"
                type="text"
                value={companies}
                onChange={(e) => {
                  setCompanies(e.target.value);
                  if (formError?.kind === 'validation') setFormError(null);
                }}
                placeholder="Marriott, Hilton"
                className="text-input"
              />
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label htmlFor="ld-roles" className="field-label">
                  Roles <span className="hint">- comma-separated</span>
                </label>
                <input
                  id="ld-roles"
                  type="text"
                  value={roles}
                  onChange={(e) => setRoles(e.target.value)}
                  placeholder="Director of Sales"
                  className="text-input"
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label htmlFor="ld-region" className="field-label">
                  Region
                </label>
                <input
                  id="ld-region"
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Malaysia"
                  className="text-input"
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitDisabled}
                style={{ padding: '10px 18px' }}
              >
                {submitting && (
                  <span
                    className="spinner"
                    aria-hidden="true"
                    style={{ borderColor: '#FDD9C4', borderTopColor: '#fff' }}
                  />
                )}
                {submitting ? 'Starting…' : 'Start search'}
              </button>
              {noCredits && (
                <span style={{ fontSize: 13, color: 'var(--danger)' }}>
                  No credits left for {activeOrg?.name ?? 'this workspace'}. Switch workspace to
                  continue.
                </span>
              )}
            </div>
          </fieldset>
        </form>

        {formError?.kind === 'validation' && (
          <div
            role="status"
            aria-live="assertive"
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 8,
              padding: '10px 12px',
              border: '1px solid #e9e9e9',
              background: '#fafafa',
              borderRadius: 10,
              fontSize: 13,
              color: 'var(--ink-2)',
            }}
          >
            <span aria-hidden="true">!</span>
            <span>{formError.text}</span>
          </div>
        )}
        {formError?.kind === 'alert' && (
          <div
            role="alert"
            tabIndex={-1}
            ref={alertRef}
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 8,
              padding: '10px 12px',
              border: '1px solid var(--danger-border)',
              background: 'var(--danger-tint)',
              borderRadius: 10,
              fontSize: 13,
              color: 'var(--danger)',
            }}
          >
            <span aria-hidden="true">✕</span>
            <span>{formError.text}</span>
          </div>
        )}
        {rateLimit && rlSecondsLeft > 0 && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 8,
              padding: '10px 12px',
              border: '1px solid #fedf89',
              background: '#fffaeb',
              borderRadius: 10,
              fontSize: 13,
              color: '#b54708',
            }}
          >
            <span aria-hidden="true">⏳</span>
            <span>
              {rateLimit.message} Try again in {rlSecondsLeft}s.
            </span>
          </div>
        )}
      </div>

      {jobId && (
        <JobProgress
          jobId={jobId}
          onSettled={() => void refreshMe()}
          onReset={reset}
          onViewInbox={(id) => router.push(`/inbox?job=${id}`)}
        />
      )}
    </section>
  );
}
