'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/app/providers/SessionProvider';
import { PlusIcon, SparkIcon } from '@/app/components/icons';

function pageMeta(pathname: string, orgName: string): { title: string; subtitle: string } {
  if (pathname.startsWith('/search')) {
    return { title: 'New search', subtitle: 'Discover and verify decision-makers' };
  }
  if (pathname.startsWith('/inbox')) {
    return { title: 'Inbox', subtitle: `Leads for ${orgName}` };
  }
  return { title: 'Overview', subtitle: 'Your lead pipeline at a glance' };
}

export function Topbar() {
  const { activeOrg, credits } = useSession();
  const pathname = usePathname();
  const { title, subtitle } = pageMeta(pathname, activeOrg?.name ?? '');
  const zero = credits <= 0;
  const onSearch = pathname.startsWith('/search');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '8px 6px 18px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-.02em',
            color: 'var(--ink)',
          }}
        >
          {title}
        </h1>
        <p style={{ margin: '3px 0 0', fontSize: 14, color: 'var(--muted)' }}>{subtitle}</p>
      </div>
      <div style={{ flex: 1 }} />
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          border: `1px solid ${zero ? 'var(--danger-border)' : 'var(--brand-tint-border)'}`,
          background: zero ? 'var(--danger-tint)' : 'var(--brand-tint)',
          color: zero ? 'var(--danger)' : 'var(--brand-700)',
        }}
      >
        <SparkIcon size={14} />
        <span className="tnum">{credits}</span> credits
      </div>
      {!onSearch && (
        <Link className="btn-primary" href="/search">
          <PlusIcon />
          New search
        </Link>
      )}
    </div>
  );
}
