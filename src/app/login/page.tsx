'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/app/lib/api';
import { useSession } from '@/app/providers/SessionProvider';
import { SparkIcon } from '@/app/components/icons';

// Two-step sign-in: enter email, then pick an org (only if you're in more than one).
// Need an active org before hitting the app - it gates every scoped read.
export default function LoginPage() {
  const { status, needsOrgPick, activeOrgId, me, signIn, chooseOrg } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authed' && activeOrgId) router.replace('/');
  }, [status, activeOrgId, router]);

  if (status === 'loading' || (status === 'authed' && activeOrgId)) {
    return <CenterShell>{null}</CenterShell>;
  }

  if (status === 'authed' && needsOrgPick && me) {
    return <OrgPicker orgs={me.orgs} onContinue={chooseOrg} />;
  }

  return <SignInForm onSignIn={signIn} />;
}

function CenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 20px',
        background: 'radial-gradient(1200px 600px at 50% -10%,#FFF6F0,#F4F4F5)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 410 }}>{children}</div>
    </div>
  );
}

const PANEL: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #ececec',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 1px 2px rgba(16,24,40,.04)',
};

const STEP_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.07em',
  color: 'var(--muted-2)',
  textTransform: 'uppercase',
  marginBottom: 10,
};

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        marginTop: 12,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        padding: '10px 12px',
        border: '1px solid var(--danger-border)',
        background: 'var(--danger-tint)',
        borderRadius: 10,
        color: 'var(--danger)',
        fontSize: 13,
      }}
    >
      <span aria-hidden="true">✕</span>
      <span>{message}</span>
    </div>
  );
}

function SignInForm({ onSignIn }: { onSignIn: (email: string) => Promise<unknown> }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || pending) return;
    setPending(true);
    setError('');
    try {
      await onSignIn(value);
      // keep spinning - success re-renders into the picker or redirects
    } catch (err) {
      setPending(false);
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Invalid credentials.'
          : 'Could not sign in. Try again.',
      );
    }
  }

  return (
    <CenterShell>
      <div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 22 }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg,#FF8A3D,#FB6514)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(251,101,20,.28)',
            color: '#fff',
          }}
        >
          <SparkIcon size={24} />
        </span>
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>
          Lead Discovery
        </div>
      </div>

      <div style={STEP_LABEL}>Step 1 - Sign in</div>
      <form onSubmit={submit} style={PANEL}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend
            style={{
              padding: 0,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--muted-2)',
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              marginBottom: 12,
            }}
          >
            Demo login - no password
          </legend>
          <label htmlFor="ld-email" className="field-label">
            Email
          </label>
          <input
            id="ld-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="you@company.test"
            className="text-input mono"
          />
        </fieldset>
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || !email.trim()}
          style={{ marginTop: 16, width: '100%', padding: 11 }}
        >
          {pending && (
            <span
              className="spinner"
              aria-hidden="true"
              style={{ borderColor: '#FDD9C4', borderTopColor: '#fff' }}
            />
          )}
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <ErrorBanner message={error} />}
      </form>

      <div style={{ marginTop: 14, ...PANEL, padding: 16 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            marginBottom: 10,
          }}
        >
          Demo users - click to fill
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DemoUser
            email="marz@test.com"
            note="Marz Labs · 10 credits"
            onClick={() => {
              setEmail('marz@test.com');
              setError('');
            }}
          />
          <DemoUser
            email="allan@test.com"
            note="Marz Labs + Allan Inc · picks org"
            onClick={() => {
              setEmail('allan@test.com');
              setError('');
            }}
          />
        </div>
      </div>
    </CenterShell>
  );
}

function DemoUser({ email, note, onClick }: { email: string; note: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        border: '1px solid #ededed',
        borderRadius: 10,
        background: '#fafafa',
        textAlign: 'left',
      }}
    >
      <span className="mono" style={{ fontSize: 13 }}>
        {email}
      </span>
      <span className="tnum" style={{ fontSize: 12, color: 'var(--muted)' }}>
        {note}
      </span>
    </button>
  );
}

function OrgPicker({
  orgs,
  onContinue,
}: {
  orgs: { id: string; name: string; credits: number }[];
  onContinue: (id: string) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!selected || pending) return;
    setPending(true);
    setError('');
    try {
      await onContinue(selected);
      // Success -> activeOrgId set -> LoginPage effect redirects to the app.
    } catch {
      setPending(false);
      setError('Could not select that workspace. Try again.');
    }
  }

  return (
    <CenterShell>
      <div style={STEP_LABEL}>Step 2 - Choose workspace</div>
      <div style={PANEL}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>
          Choose active workspace
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--muted)' }}>
          Your session is scoped to one workspace at a time.
        </p>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Workspaces</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orgs.map((o) => (
              <label
                key={o.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 14px',
                  border: '1px solid #e9e9e9',
                  borderRadius: 12,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <input
                    type="radio"
                    name="ld-org"
                    checked={selected === o.id}
                    onChange={() => {
                      setSelected(o.id);
                      setError('');
                    }}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                  />
                  <span
                    className="org-avatar"
                    style={{ width: 32, height: 32, borderRadius: 9, fontSize: 13 }}
                  >
                    {o.name[0]}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{o.name}</span>
                </span>
                <span className="tnum" style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Credits: {o.credits}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void submit()}
          disabled={pending || !selected}
          style={{ marginTop: 16, width: '100%', padding: 11 }}
        >
          {pending ? 'Switching…' : 'Continue'}
        </button>
        {error && <ErrorBanner message={error} />}
      </div>
    </CenterShell>
  );
}
