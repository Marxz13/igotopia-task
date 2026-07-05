'use client';

import type { ReactNode } from 'react';

// Remounts the child subtree when activeOrgId changes.
export function OrgScope({
  activeOrgId,
  children,
}: {
  activeOrgId: string | null;
  children: ReactNode;
}) {
  return (
    <div key={activeOrgId ?? 'none'} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
