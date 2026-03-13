import { NextRequest, NextResponse } from 'next/server';
import { buildPMPreflight } from '@/lib/pm-preflight';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const market = request.nextUrl.searchParams.get('market');
    const preflight = await buildPMPreflight(market);
    return NextResponse.json(preflight, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch (error: any) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        mode: 'paper',
        liveOrdersEnabled: false,
        paperOnlyLock: true,
        overallState: 'UNKNOWN',
        readinessScorePct: 0,
        error: error?.message || 'Failed to build PM preflight status',
        checks: [],
      },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
    );
  }
}
