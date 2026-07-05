import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header>Lead Discovery</header>
      <main>{children}</main>
    </div>
  );
}
