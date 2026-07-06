import { NextResponse } from 'next/server';
import { loginRequestSchema } from '@/core/contract';
import { SESSION_COOKIE, sessionCookieOptions } from '@/core/auth/session';
import { loginUser } from '@/core/services/auth-service';
import { getLogger } from '@/core/logger';
import { errorResponse } from '@/app/api/_lib/http';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json().catch(() => null);
    const { email } = loginRequestSchema.parse(body);
    const { token, expiresAt, me } = await loginUser(email);
    const res = NextResponse.json(me);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    getLogger().info({ userId: me.user.id }, 'login');
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
