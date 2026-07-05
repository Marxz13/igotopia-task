'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

// Shape of the session value shared through React context.
export interface SessionValue {
  activeOrgId: string | null;
  credits: number;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  return <SessionContext.Provider value={null}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue | null {
  return useContext(SessionContext);
}
