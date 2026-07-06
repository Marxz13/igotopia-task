'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Me, Org } from '@/core/contract';
import { ApiError, getMe, login, logout, switchOrg } from '@/app/lib/api';

// Client session state. Seeds from GET /api/me on mount. Credit balance is read
// from the active org, so it can't drift. refreshMe() runs after a charge and on job settle.

export type SessionStatus = 'loading' | 'authed' | 'anon';

export interface SessionValue {
  status: SessionStatus;
  me: Me | null;
  activeOrgId: string | null;
  activeOrg: Org | null;
  credits: number;
  needsOrgPick: boolean;
  refreshMe: () => Promise<void>;
  signIn: (email: string) => Promise<Me>;
  chooseOrg: (organizationId: string) => Promise<Me>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const adopt = useCallback((next: Me) => {
    setMe(next);
    setStatus('authed');
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      adopt(await getMe());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
        setStatus('anon');
        return;
      }
      throw err;
    }
  }, [adopt]);

  // Hydrate once on mount.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await getMe();
        if (active) adopt(next);
      } catch {
        if (active) {
          setMe(null);
          setStatus('anon');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [adopt]);

  const signIn = useCallback(
    async (email: string) => {
      const next = await login(email);
      adopt(next);
      return next;
    },
    [adopt],
  );

  const chooseOrg = useCallback(
    async (organizationId: string) => {
      const next = await switchOrg(organizationId);
      adopt(next);
      return next;
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setMe(null);
      setStatus('anon');
    }
  }, []);

  const value = useMemo<SessionValue>(() => {
    const activeOrgId = me?.activeOrgId ?? null;
    const activeOrg = activeOrgId ? (me?.orgs.find((o) => o.id === activeOrgId) ?? null) : null;
    return {
      status,
      me,
      activeOrgId,
      activeOrg,
      credits: activeOrg?.credits ?? 0,
      needsOrgPick: status === 'authed' && activeOrgId === null,
      refreshMe,
      signIn,
      chooseOrg,
      signOut,
    };
  }, [status, me, refreshMe, signIn, chooseOrg, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
