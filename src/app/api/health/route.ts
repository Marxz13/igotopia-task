import { NextResponse } from 'next/server';

// Liveness probe.
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'lead-discovery' });
}
