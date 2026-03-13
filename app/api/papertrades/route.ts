import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Reads Bybit papertrade log from public/papertrades.json
 * 
 * Expected format:
 * {
 *   "trades": [
 *     {
 *       "id": "trade-1",
 *       "symbol": "BTCUSDT",
 *       "direction": "LONG" | "SHORT",
 *       "entryPrice": 67450.50,
 *       "exitPrice": 67580.20,       // null if still open
 *       "quantity": 0.05,
 *       "leverage": 10,
 *       "positionSize": 50,           // $ amount
 *       "pnl": 2.59,                  // realized P&L in $
 *       "pnlPercent": 0.38,           // realized P&L %
 *       "status": "open" | "closed",
 *       "strategy": "scalp_1m" | "swing_5_15m",
 *       "entryTime": "2025-03-06T10:00:00Z",
 *       "exitTime": "2025-03-06T10:05:00Z",  // null if open
 *       "closeReason": "tp1" | "tp2" | "stop_loss" | "max_hold" | "manual" | null,
 *       "confidence": 85,
 *       "indicators": { "stochRSI_K": 28, "stochRSI_D": 22, "volumeRatio": 1.8 }
 *     }
 *   ],
 *   "stats": {
 *     "totalTrades": 150,
 *     "winRate": 58.5,
 *     "totalPnl": 245.80,
 *     "walletSize": 5245.80,
 *     "startingBalance": 5000,
 *     "maxDrawdown": 3.2,
 *     "avgHoldTimeSeconds": 154,
 *     "tradesPerHour": 12.4,
 *     "trades24h": 87,
 *     "winDays": 18,
 *     "lossDays": 7,
 *     "bestTrade": 45.20,
 *     "worstTrade": -12.50,
 *     "lastUpdated": "2025-03-06T12:00:00Z"
 *   }
 * }
 */

export interface PapertradeEntry {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  leverage: number;
  positionSize: number;
  pnl: number;
  pnlPercent: number;
  status: 'open' | 'closed';
  strategy: 'scalp_1m' | 'swing_5_15m';
  entryTime: string;
  exitTime: string | null;
  closeReason: string | null;
  confidence: number;
  indicators?: Record<string, number>;
}

export interface PapertradeStats {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  walletSize: number;
  startingBalance: number;
  maxDrawdown: number;
  avgHoldTimeSeconds: number;
  tradesPerHour: number;
  trades24h: number;
  winDays: number;
  lossDays: number;
  bestTrade: number;
  worstTrade: number;
  lastUpdated: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const strategy = searchParams.get('strategy'); // 'scalp_1m' | 'swing_5_15m' | null (all)
  const status = searchParams.get('status');      // 'open' | 'closed' | null (all)
  const limit = parseInt(searchParams.get('limit') || '50');

  const filePath = join(process.cwd(), 'public', 'papertrades.json');

  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);

    let trades: PapertradeEntry[] = data.trades || [];
    const stats: PapertradeStats | null = data.stats || null;

    // Filter by strategy
    if (strategy) {
      trades = trades.filter(t => t.strategy === strategy);
    }

    // Filter by status
    if (status) {
      trades = trades.filter(t => t.status === status);
    }

    // Normalize close reasons: map legacy keys to engine-standard values
    trades = trades.map(t => {
      if (!t.closeReason) return t;
      const reasonMap: Record<string, string> = {
        stop_loss: 'sl',
        max_hold: 'timeout',
        take_profit: 'tp',
      };
      return reasonMap[t.closeReason]
        ? { ...t, closeReason: reasonMap[t.closeReason] }
        : t;
    });

    // Sort by entryTime descending (newest first)
    trades.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());

    // Limit results
    trades = trades.slice(0, limit);

    // Compute strategy-specific stats if filtering
    let filteredStats = stats;
    if (strategy && data.trades) {
      const stratTrades = (data.trades as PapertradeEntry[]).filter(t => t.strategy === strategy);
      const closedTrades = stratTrades.filter(t => t.status === 'closed');
      const wins = closedTrades.filter(t => t.pnl > 0);
      filteredStats = {
        totalTrades: closedTrades.length,
        winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
        totalPnl: closedTrades.reduce((sum, t) => sum + t.pnl, 0),
        walletSize: stats?.walletSize || 5000,
        startingBalance: stats?.startingBalance || 5000,
        maxDrawdown: stats?.maxDrawdown || 0,
        avgHoldTimeSeconds: stats?.avgHoldTimeSeconds || 0,
        tradesPerHour: stats?.tradesPerHour || 0,
        trades24h: stratTrades.filter(t => {
          const d = new Date(t.entryTime);
          return Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
        }).length,
        winDays: stats?.winDays || 0,
        lossDays: stats?.lossDays || 0,
        bestTrade: closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.pnl)) : 0,
        worstTrade: closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.pnl)) : 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    return NextResponse.json({
      trades,
      stats: filteredStats,
      openCount: (data.trades as PapertradeEntry[]).filter(t =>
        t.status === 'open' && (!strategy || t.strategy === strategy)
      ).length,
      source: 'file',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('ENOENT')) {
      return NextResponse.json({
        trades: [],
        stats: null,
        openCount: 0,
        source: 'none',
        error: 'Papertrade log not found. Bot needs to write to public/papertrades.json',
      });
    }

    console.error('[papertrades] Read error:', message);
    return NextResponse.json({
      trades: [],
      stats: null,
      openCount: 0,
      error: `Failed to read papertrades: ${message}`,
    }, { status: 200 });
  }
}
