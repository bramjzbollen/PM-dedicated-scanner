import { NextResponse } from 'next/server';
import { getPMBets, getPMHistory, getPMOpenBets } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  try {
    const [allBets, openBets, closedBets] = await Promise.all([
      getPMBets(),
      getPMOpenBets(),
      getPMHistory(1),
    ]);

    const latestAny = [...allBets].sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0] || null;
    const latestOpen = openBets[0] || null;
    const latestClosed = closedBets[0] || null;

    return NextResponse.json(
      {
        ok: true,
        counts: {
          total: allBets.length,
          open: openBets.length,
          closed: allBets.length - openBets.length,
        },
        latestAny,
        latestOpen,
        latestClosed,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Failed to load PM debug-latest',
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
