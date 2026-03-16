import { NextRequest, NextResponse } from 'next/server';
import { getPMHistory, getPMRuntimeState } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

function pct(n: number) {
  return `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
}

export async function GET(req: NextRequest) {
  try {
    const hours = Number(req.nextUrl.searchParams.get('hours') || '1');
    const now = Date.now();
    const sinceMs = now - Math.max(1, hours) * 60 * 60 * 1000;

    const runtime = await getPMRuntimeState();
    const closed = await getPMHistory(200);
    const recent = closed.filter((b) => {
      const t = b.settledAt ? new Date(b.settledAt).getTime() : 0;
      return t >= sinceMs;
    });

    const recentWins = recent.filter((b) => b.exit === 'WIN').length;
    const recentLosses = recent.filter((b) => b.exit === 'LOSS').length;
    const recentPnl = recent.reduce((s, b) => s + (b.pnlUsd || 0), 0);

    const summary = [
      `PM Report (${hours}u)`,
      `• Balance: $${(runtime.walletBalance?.balanceUsd || 0).toFixed(2)}`,
      `• Mode: ${runtime.mode.toUpperCase()} / ${runtime.executionStatus}`,
      `• Trades: ${recent.length} (W ${recentWins} / L ${recentLosses})`,
      `• Winrate ${hours}u: ${pct(recent.length ? (recentWins / recent.length) * 100 : 0)}`,
      `• PnL ${hours}u: $${recentPnl.toFixed(2)}`,
      `• Overall winrate: ${pct(runtime.stats.winRatePct)}`,
      `• Overall live PnL: $${(runtime.stats.livePnlUsd || 0).toFixed(2)}`,
    ].join('\n');

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        hours,
        summary,
        data: {
          balanceUsd: runtime.walletBalance?.balanceUsd || 0,
          mode: runtime.mode,
          executionStatus: runtime.executionStatus,
          recentCount: recent.length,
          recentWins,
          recentLosses,
          recentPnlUsd: Number(recentPnl.toFixed(2)),
          recentWinRatePct: Number((recent.length ? (recentWins / recent.length) * 100 : 0).toFixed(2)),
          overallWinRatePct: Number((runtime.stats.winRatePct || 0).toFixed(2)),
          overallLivePnlUsd: Number((runtime.stats.livePnlUsd || 0).toFixed(2)),
        },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', Pragma: 'no-cache', Expires: '0' } }
    );
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to generate PM report' }, { status: 500 });
  }
}
