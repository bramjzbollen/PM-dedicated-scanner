import { NextResponse } from 'next/server';
import { getPMRuntimeState } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getPMRuntimeState();
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch (error) {
    console.error('[pm-bot/state] fallback due to runtime error:', error);
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        ageMs: 0,
        stale: true,
        feedTimestamp: null,
        feedAgeMs: null,
        enabled: false,
        mode: 'paper',
        executionStatus: 'BLOCKED',
        statusReason: 'Runtime fallback actief',
        paperModeOnly: false,
        sourceLabel: 'Bybit v2 scalp signals feed (public market data)',
        roadmapTag: 'Fallback: PAPER/BLOCKED',
        events: [],
        stats: {
          openBets: 0,
          closedBets: 0,
          wins: 0,
          losses: 0,
          winRatePct: 0,
          totalPnlUsd: 0,
          todayPnlUsd: 0,
        },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } }
    );
  }
}
