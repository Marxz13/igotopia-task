import { NextResponse } from 'next/server';

// Returns job status by id. Not implemented yet.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ error: 'not_implemented', id }, { status: 501 });
}
