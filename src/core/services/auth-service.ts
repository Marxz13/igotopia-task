import type { Me } from '@/core/contract';
import { NotFoundError, UnauthorizedError } from '@/core/errors';
import { createSession, setSessionActiveOrg, type SessionInfo } from '@/core/auth/session';
import { isMember, listOrgIdsForUser } from '@/core/repositories/membership-repository';
import { listOrgsByIds } from '@/core/repositories/org-repository';
import { findUserByEmail, findUserById } from '@/core/repositories/user-repository';

// Auth logic over the repos and session. Org scope always comes from the session;
// nothing here trusts a client-supplied org id.

export async function buildMe(userId: string, activeOrgId: string | null): Promise<Me> {
  const user = await findUserById(userId);
  if (!user) throw new UnauthorizedError();
  const orgIds = await listOrgIdsForUser(userId);
  const orgs = await listOrgsByIds(orgIds);
  return {
    user: { id: user.id, email: user.email, name: user.name },
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, credits: o.credits })),
    activeOrgId,
  };
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  me: Me;
}

// Demo login (no password). A single-org user gets an active org right away; a
// multi-org user starts with none and must pick one.
export async function loginUser(email: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  if (!user) throw new UnauthorizedError('Invalid credentials');
  const orgIds = await listOrgIdsForUser(user.id);
  const activeOrgId = orgIds.length === 1 ? (orgIds[0] ?? null) : null;
  const { token, expiresAt } = await createSession(user.id, activeOrgId);
  const me = await buildMe(user.id, activeOrgId);
  return { token, expiresAt, me };
}

// Switch the active org. A non-member gets 404, same as a missing org.
export async function switchOrg(session: SessionInfo, orgId: string): Promise<Me> {
  if (!(await isMember(session.userId, orgId))) {
    throw new NotFoundError('Organization not found');
  }
  await setSessionActiveOrg(session.sessionId, orgId);
  return buildMe(session.userId, orgId);
}
