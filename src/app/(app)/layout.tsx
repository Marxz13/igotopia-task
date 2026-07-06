'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/app/providers/SessionProvider';
import { OrgScope } from '@/app/providers/OrgScope';
import { Sidebar } from '@/app/components/Sidebar';
import { Topbar } from '@/app/components/Topbar';

// Auth gate for the app. Bounces to /login if signed out or no active workspace.
// OrgScope is keyed on org id, so switching workspace remounts the page and refetches.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, needsOrgPick, activeOrgId } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anon' || needsOrgPick) router.replace('/login');
  }, [status, needsOrgPick, router]);

  if (status !== 'authed' || needsOrgPick) {
    return <FullScreenLoader />;
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--canvas)',
        padding: 14,
        gap: 14,
      }}
    >
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar />
        <div id="ld-main" style={{ flex: 1, overflow: 'auto', padding: '2px 6px 44px' }}>
          <OrgScope activeOrgId={activeOrgId}>{children}</OrgScope>
        </div>
      </main>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted-2)',
        gap: 10,
        fontSize: 14,
      }}
    >
      <span className="spinner" aria-hidden="true" />
      Loading…
    </div>
  );
}
