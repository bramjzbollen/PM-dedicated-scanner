import { NextResponse } from 'next/server';
import { getPMDecisions } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const decisions = await getPMDecisions();
    return NextResponse.json(decisions, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch {
    return NextResponse.json({ error: 'Failed to load PM decisions' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  }
}
