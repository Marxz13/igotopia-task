import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { ErrorResponse } from '@/core/contract';
import { AppError, UnauthorizedError } from '@/core/errors';
import { getLogger } from '@/core/logger';
import {
  resolveSession,
  SESSION_COOKIE,
  type RequestContext,
  type SessionInfo,
} from '@/core/auth/session';

// Shared API-route helpers. `_lib` is a private folder that Next never routes.

/** Map any thrown value to the contract's { error, message } envelope and status. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const body: ErrorResponse = { error: err.code, message: err.message };
    return NextResponse.json(body, { status: err.status });
  }
  if (err instanceof ZodError) {
    const body: ErrorResponse = {
      error: 'validation_error',
      message: err.issues[0]?.message ?? 'Invalid request',
    };
    return NextResponse.json(body, { status: 400 });
  }
  getLogger().error({ err }, 'unhandled_error');
  const body: ErrorResponse = { error: 'internal_error', message: 'Internal error' };
  return NextResponse.json(body, { status: 500 });
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/** Session for /me and active-org switch; activeOrgId may still be null. */
export async function requireSessionInfo(): Promise<SessionInfo> {
  const session = await resolveSession(await readSessionToken());
  if (!session) throw new UnauthorizedError('Not signed in');
  return session;
}

/** Full org-scoped context for tenant routes; requires a picked active org. */
export async function requireContext(): Promise<RequestContext> {
  const session = await requireSessionInfo();
  if (!session.activeOrgId) throw new UnauthorizedError('No active organization selected');
  return { userId: session.userId, orgId: session.activeOrgId, sessionId: session.sessionId };
}
