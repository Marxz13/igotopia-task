import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { loadConfig } from '@/core/config';
import { getDb } from '@/core/db/client';
import { sessions } from '@/core/db/schema';

// Minimal cookie session. The cookie holds a random opaque token; the DB stores only
// its salted hash, never the raw token, so a DB read can't mint a valid cookie.
// `activeOrganizationId` on the session row is the only source of org scope for
// tenancy; no handler ever reads an org id from client input.

export const SESSION_COOKIE = 'ld_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Resolved request context; org comes only from the session.
export interface RequestContext {
  userId: string;
  orgId: string;
  sessionId: string;
}

// Session as read back; activeOrgId may be null if a multi-org user hasn't picked yet.
export interface SessionInfo {
  sessionId: string;
  userId: string;
  activeOrgId: string | null;
}

function hashToken(token: string): string {
  const { SESSION_SECRET } = loadConfig();
  return createHash('sha256').update(`${token}:${SESSION_SECRET}`).digest('hex');
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}

export async function createSession(
  userId: string,
  activeOrgId: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getDb()
    .insert(sessions)
    .values({
      tokenHash: hashToken(token),
      userId,
      activeOrganizationId: activeOrgId,
      expiresAt,
    });
  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null;
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { sessionId: row.id, userId: row.userId, activeOrgId: row.activeOrganizationId };
}

export async function setSessionActiveOrg(sessionId: string, orgId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ activeOrganizationId: orgId })
    .where(eq(sessions.id, sessionId));
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await getDb()
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)));
}
