import { NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE } from '@/core/auth/session';
import { errorResponse, readSessionToken } from '@/app/api/_lib/http';

export async function POST(): Promise<NextResponse> {
  try {
    await destroySession(await readSessionToken());
    const res = new NextResponse(null, { status: 204 });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
