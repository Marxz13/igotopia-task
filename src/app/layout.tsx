import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MswProvider } from '@/app/providers/MswProvider';
import { SessionProvider } from '@/app/providers/SessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lead Discovery',
  description: 'Multi-tenant lead discovery pipeline',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#ld-main">
          Skip to content
        </a>
        {/* MswProvider waits for the mock worker; SessionProvider seeds session from /api/me */}
        <MswProvider>
          <SessionProvider>{children}</SessionProvider>
        </MswProvider>
      </body>
    </html>
  );
}
