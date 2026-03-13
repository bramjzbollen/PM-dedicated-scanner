'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowTrendUp,
  faArrowTrendDown,
  faTrophy,
  faCoins,
  faClock,
  faMedal,
  faChartLine,
  faSkullCrossbones,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

interface ClosedTrade {
  id: string;
  symbol?: string;
  direction?: 'LONG' | 'SHORT';
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitTime: string;
  closeReason?: string | null;
}

interface StrategyStats {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  avgHoldTimeSeconds: number;
  bestTrade: number;
  worstTrade: number;
}

interface StrategyData {
  trades: ClosedTrade[];
  stats: StrategyStats | null;
}

function formatPrice(price: number): string {
  if (price >= 10000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatHoldTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeAgo(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const closeReasonLabels: Record<string, { label: string; color: string }> = {
  // Engine-produced reasons (primary)
  tp: { label: 'TP', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  sl: { label: 'SL', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  trailing: { label: 'TRAIL', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  timeout: { label: 'TIME', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  manual: { label: 'MANUAL', color: 'text-white/60 bg-white/5 border-white/10' },
  // Swing partial close reasons
  tp1: { label: 'TP1', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  tp2: { label: 'TP2', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25' },
  // Legacy aliases (old API format)
  stop_loss: { label: 'SL', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  max_hold: { label: 'TIME', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  take_profit: { label: 'TP', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
};

export function TradeHistoryOverview() {
  const [scalpingData, setScalpingData] = useState<StrategyData>({ trades: [], stats: null });
  const [swingData, setSwingData] = useState<StrategyData>({ trades: [], stats: null });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [scalpRes, swingRes] = await Promise.all([
        fetch('/api/papertrades?strategy=scalping&status=closed&limit=50'),
        fetch('/api/papertrades?strategy=swing&status=closed&limit=50'),
      ]);

      if (scalpRes.ok && swingRes.ok) {
        const scalpData = await scalpRes.json();
        const swingData = await swingRes.json();
        
        setScalpingData({
          trades: scalpData.trades || [],
          stats: scalpData.stats || null,
        });
        
        setSwingData({
          trades: swingData.trades || [],
          stats: swingData.stats || null,
        });
      }
    } catch (error) {
      console.error('Failed to fetch trade history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-4">
            <div className="grid gap-3 grid-cols-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-20 rounded-xl shimmer" />
              ))}
            </div>
            <div className="h-96 rounded-xl shimmer" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Scalping Column */}
      <StrategyColumn
        title="Scalping (1m)"
        color="cyan"
        data={scalpingData}
      />

      {/* Swing Column */}
      <StrategyColumn
        title="Swing (15m)"
        color="violet"
        data={swingData}
      />
    </div>
  );
}

function StrategyColumn({ title, color, data }: {
  title: string;
  color: 'cyan' | 'violet';
  data: StrategyData;
}) {
  const stats = data.stats;
  const trades = data.trades;
  
  const colorClasses = {
    cyan: {
      border: 'border-cyan-500/[0.15]',
      bg: 'bg-cyan-500/[0.1]',
      text: 'text-cyan-400',
      badgeBg: 'bg-cyan-500/20 border-cyan-500/30',
    },
    violet: {
      border: 'border-violet-500/[0.15]',
      bg: 'bg-violet-500/[0.1]',
      text: 'text-violet-400',
      badgeBg: 'bg-violet-500/20 border-violet-500/30',
    },
  };

  const c = colorClasses[color];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <div className={`p-1.5 rounded-xl ${c.bg}`}>
            <FontAwesomeIcon icon={faChartLine} className={`h-4 w-4 ${c.text}`} />
          </div>
          {title}
        </h3>
        {stats && (
          <Badge className={`${c.badgeBg} ${c.text}`}>
            {stats.totalTrades} trades
          </Badge>
        )}
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid gap-3 grid-cols-3">
          <StatsCard
            title="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            icon={faTrophy}
            iconColor={stats.winRate >= 55 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatsCard
            title="Total P&L"
            value={`$${stats.totalPnl.toFixed(2)}`}
            icon={faCoins}
            iconColor={stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
            valueColor={stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatsCard
            title="Avg Hold"
            value={formatHoldTime(stats.avgHoldTimeSeconds)}
            icon={faClock}
            iconColor="text-amber-400"
          />
          <StatsCard
            title="Best Trade"
            value={`+$${stats.bestTrade.toFixed(2)}`}
            icon={faMedal}
            iconColor="text-emerald-400"
            valueColor="text-emerald-400"
          />
          <StatsCard
            title="Worst Trade"
            value={`-$${Math.abs(stats.worstTrade).toFixed(2)}`}
            icon={faSkullCrossbones}
            iconColor="text-red-400"
            valueColor="text-red-400"
          />
          <StatsCard
            title="Avg P&L"
            value={`$${(stats.totalPnl / Math.max(1, stats.totalTrades)).toFixed(2)}`}
            icon={faChartLine}
            iconColor={c.text}
          />
        </div>
      )}

      {/* Closed Trades Table */}
      <Card className={c.border}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Closed Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <p className="text-sm">Nog geen afgesloten trades</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0a0f] z-10">
                  <tr className="text-[10px] uppercase tracking-wider text-white/35 border-b border-white/[0.06]">
                    <th className="text-left pb-2 px-2">Pair</th>
                    <th className="text-left pb-2 px-2">Side</th>
                    <th className="text-right pb-2 px-2">Entry</th>
                    <th className="text-right pb-2 px-2">Exit</th>
                    <th className="text-right pb-2 px-2">P&L</th>
                    <th className="text-center pb-2 px-2">Reason</th>
                    <th className="text-right pb-2 px-2">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => {
                    const isWin = (trade.pnl ?? 0) > 0;
                    const reason = closeReasonLabels[trade.closeReason || ''] || { label: '-', color: 'text-white/30' };
                    return (
                      <tr key={trade.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-2 font-mono font-bold text-white/90 text-xs">
                          {(trade.symbol ?? '—').replace('USDT', '')}
                        </td>
                        <td className="py-2.5 px-2">
                          <Badge className={cn(
                            'text-[10px] font-bold',
                            trade.direction === 'LONG'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/15 text-red-400 border-red-500/20'
                          )}>
                            {trade.direction ?? '—'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-white/60 text-xs">
                          {formatPrice(trade.entryPrice ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-white/60 text-xs">
                          {formatPrice(trade.exitPrice ?? 0)}
                        </td>
                        <td className={cn(
                          'py-2.5 px-2 text-right font-mono font-semibold text-xs',
                          isWin ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {isWin ? '+' : ''}${(trade.pnl ?? 0).toFixed(2)}
                          <span className="ml-1 opacity-60">
                            ({isWin ? '+' : ''}{(trade.pnlPercent ?? 0).toFixed(1)}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge variant="outline" className={`text-[9px] ${reason.color}`}>
                            {reason.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right text-white/40 text-xs">
                          {timeAgo(trade.exitTime)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({ title, value, icon, iconColor, valueColor }: {
  title: string;
  value: string;
  icon: typeof faTrophy;
  iconColor: string;
  valueColor?: string;
}) {
  return (
    <div className="glass-card-premium rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-3 transition-all duration-200 hover:bg-white/[0.06]">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[9px] uppercase tracking-wider text-white/40">{title}</p>
        <FontAwesomeIcon icon={icon} className={`h-3 w-3 ${iconColor}`} />
      </div>
      <p className={`text-lg font-bold ${valueColor || 'text-white/90'}`}>{value}</p>
    </div>
  );
}
