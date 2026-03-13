import { NextRequest, NextResponse } from 'next/server';
import { getPMHistory, getPMOpenBets } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status') || 'open';
    if (status === 'closed') {
      const limit = Number(req.nextUrl.searchParams.get('limit') || '100');
      return NextResponse.json(await getPMHistory(limit), { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
    }
    return NextResponse.json(await getPMOpenBets(), { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch {
    return NextResponse.json({ error: 'Failed to load PM bets' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  }
}
