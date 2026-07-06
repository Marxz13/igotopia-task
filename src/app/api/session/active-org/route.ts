import { NextResponse } from 'next/server';
import { switchOrgRequestSchema } from '@/core/contract';
import { switchOrg } from '@/core/services/auth-service';
import { errorResponse, requireSessionInfo } from '@/app/api/_lib/http';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await requireSessionInfo();
    const body: unknown = await req.json().catch(() => null);
    const { organizationId } = switchOrgRequestSchema.parse(body);
    return NextResponse.json(await switchOrg(session, organizationId));
  } catch (err) {
    return errorResponse(err);
  }
}
