import { NextResponse } from 'next/server';
import { buildMe } from '@/core/services/auth-service';
import { errorResponse, requireSessionInfo } from '@/app/api/_lib/http';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await requireSessionInfo();
    return NextResponse.json(await buildMe(session.userId, session.activeOrgId));
  } catch (err) {
    return errorResponse(err, { req });
  }
}
