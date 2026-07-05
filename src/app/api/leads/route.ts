import { NextResponse } from 'next/server';

// Leads list endpoint (not implemented yet).
export function GET() {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
