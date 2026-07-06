'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/app/providers/SessionProvider';
import { initials } from '@/app/lib/tones';
import {
  CheckIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  GridIcon,
  InboxIcon,
  LogoutIcon,
  SearchIcon,
  SparkIcon,
} from '@/app/components/icons';

const NAV = [
  { href: '/', label: 'Overview', Icon: GridIcon },
  { href: '/search', label: 'New search', Icon: SearchIcon },
  { href: '/inbox', label: 'Inbox', Icon: InboxIcon },
] as const;

export function Sidebar() {
  const { me, activeOrg, credits, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { chooseOrg } = useSession();
  const [wsOpen, setWsOpen] = useState(false);

  const orgs = me?.orgs ?? [];
  const multiOrg = orgs.length > 1;
  const orgName = activeOrg?.name ?? '';
  const zero = credits <= 0;

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  async function selectOrg(orgId: string) {
    setWsOpen(false);
    if (orgId === activeOrg?.id) return;
    await chooseOrg(orgId);
  }

  return (
    <aside
      style={{
        width: 264,
        flex: 'none',
        background: '#fff',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        padding: 14,
      }}
    >
      {/* Workspace */}
      <div style={{ position: 'relative' }}>
        {multiOrg ? (
          <button
            className="ws-btn clickable"
            onClick={() => setWsOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={wsOpen}
          >
            <WorkspaceLabel initial={orgName[0] ?? ''} name={orgName} />
            <span style={{ color: '#b4b4b4', flex: 'none' }}>
              <ChevronUpDownIcon />
            </span>
          </button>
        ) : (
          <div className="ws-btn">
            <WorkspaceLabel initial={orgName[0] ?? ''} name={orgName} />
          </div>
        )}

        {wsOpen && (
          <>
            <div
              onClick={() => setWsOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            />
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: 56,
                left: 0,
                right: 0,
                zIndex: 60,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: 'var(--shadow-pop)',
                padding: 6,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '.05em',
                  color: 'var(--muted-2)',
                  textTransform: 'uppercase',
                  padding: '8px 10px 6px',
                }}
              >
                Switch workspace
              </div>
              {orgs.map((o) => (
                <button
                  key={o.id}
                  role="menuitem"
                  onClick={() => void selectOrg(o.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    border: 0,
                    background: 'transparent',
                    borderRadius: 10,
                    textAlign: 'left',
                  }}
                >
                  <span
                    className="org-avatar"
                    style={{ width: 30, height: 30, borderRadius: 8, fontSize: 12 }}
                  >
                    {o.name[0]}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {o.name}
                    </span>
                    <span
                      className="tnum"
                      style={{ display: 'block', fontSize: 12, color: 'var(--muted-2)' }}
                    >
                      {o.credits} credits
                    </span>
                  </span>
                  {o.id === activeOrg?.id && (
                    <span style={{ color: 'var(--brand)', flex: 'none', display: 'flex' }}>
                      <CheckIcon />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main nav */}
      <div style={{ marginTop: 18 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.07em',
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            padding: '0 12px',
            marginBottom: 8,
          }}
        >
          Main
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {NAV.map(({ href, label, Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className="nav-item" data-active={active}>
                <span className="nav-ic">
                  <Icon />
                </span>
                {label}
                {active && (
                  <span style={{ marginLeft: 'auto', color: 'var(--brand)', display: 'flex' }}>
                    <ChevronRightIcon />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div style={{ flex: 1 }} />

      {/* User footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: 14,
          marginTop: 14,
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            flex: 'none',
            borderRadius: 9,
            background: '#e9e9eb',
            color: 'var(--ink-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {initials(me?.user.name ?? '')}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {me?.user.name}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 12,
              color: 'var(--muted-2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {me?.user.email}
          </div>
        </div>
        <button
          onClick={() => void handleSignOut()}
          aria-label="Log out"
          title="Log out"
          style={{
            width: 32,
            height: 32,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #eaeaea',
            borderRadius: 8,
            background: '#fff',
            color: 'var(--muted)',
          }}
        >
          <LogoutIcon />
        </button>
      </div>

      {/* Credits - tucked under the user section; clipped so only the head and
          upper half of the card peeks up from the bottom edge. */}
      <div
        aria-label={`${credits} credits remaining`}
        style={{ marginTop: 12, height: 62, overflow: 'hidden' }}
      >
        <div
          style={{
            border: '1px solid #f1ede9',
            borderBottom: 0,
            borderRadius: '14px 14px 0 0',
            padding: '12px 14px 16px',
            background: 'linear-gradient(#fff,#fffbf7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ color: 'var(--brand)', display: 'flex' }}>
              <SparkIcon size={16} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Credits</span>
          </div>
          <div
            className="tnum"
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-.02em',
              color: zero ? 'var(--danger)' : 'var(--ink)',
              marginTop: 2,
            }}
          >
            {credits}
          </div>
          <div
            style={{
              height: 6,
              background: '#f1efec',
              borderRadius: 3,
              marginTop: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (credits / 10) * 100))}%`,
                height: '100%',
                background: zero ? 'var(--danger)' : 'var(--brand)',
                borderRadius: 3,
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 8 }}>
            {zero ? 'Out of credits - switch workspace' : '1 credit per search'}
          </div>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceLabel({ initial, name }: { initial: string; name: string }) {
  return (
    <>
      <span className="org-avatar" style={{ width: 38, height: 38, fontSize: 15 }}>
        {initial}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted-2)' }}>
          Lead Discovery
        </span>
      </span>
    </>
  );
}
