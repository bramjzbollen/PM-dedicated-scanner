'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowTrendUp,
  faArrowTrendDown,
  faCircle,
  faTrophy,
  faChartPie,
  faCoins,
  faClock,
  faBolt,
  faSkullCrossbones,
  faMedal,
} from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';
import { cn } from '@/lib/utils';

interface PapertradeEntry {
  id: string;
  symbol?: string;
  pair?: string;        // P0-3: alternative field name for symbol
  direction?: 'LONG' | 'SHORT';
  type?: 'LONG' | 'SHORT'; // P0-3: alternative field name for direction
  entryPrice?: number;
  exitPrice?: number | null;
  quantity?: number;
  leverage?: number;
  positionSize?: number;
  size?: number;         // P0-3: alternative field name for positionSize
  pnl?: number;
  pnlPercent?: number;
  status: 'open' | 'closed';
  strategy?: string;
  entryTime: string;
  exitTime?: string | null;
  closeReason?: string | null;
  confidence?: number;
  indicators?: Record<string, number>;
}

interface PapertradeStats {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  walletSize: number;
  startingBalance: number;
  maxDrawdown: number;
  avgHoldTimeSeconds: number;
  tradesPerHour: number;
  trades24h: number;
  bestTrade: number;
  worstTrade: number;
}

function formatPrice(price: number): string {
  if (price >= 10000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatHoldTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeAgo(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
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

interface Props {
  strategy: string;
  label: string;
  color: string;
}

export function PapertradeTab({ strategy, label, color }: Props) {
  const [openTrades, setOpenTrades] = useState<PapertradeEntry[]>([]);
  const [closedTrades, setClosedTrades] = useState<PapertradeEntry[]>([]);
  const [stats, setStats] = useState<PapertradeStats | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [openRes, closedRes] = await Promise.all([
        fetch(`/api/papertrades?strategy=${strategy}&status=open&limit=20`),
        fetch(`/api/papertrades?strategy=${strategy}&status=closed&limit=30`),
      ]);

      if (!openRes.ok || !closedRes.ok) throw new Error('API error');

      const openData = await openRes.json();
      const closedData = await closedRes.json();

      setOpenTrades(openData.trades || []);
      setClosedTrades(closedData.trades || []);
      setStats(closedData.stats || openData.stats || null);
      setOpenCount(openData.openCount || 0);
      setError(openData.error || closedData.error || null);
      setLastUpdate(new Date());
    } catch {
      setError('Kon papertrades niet ophalen');
    } finally {
      setLoading(false);
    }
  }, [strategy]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // 5s refresh for trades
    return () => clearInterval(interval);
  }, [fetchData]);

  const isPositive = stats ? stats.totalPnl >= 0 : true;
  const colorPrefix = color === 'cyan' ? 'cyan' : 'violet';

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl shimmer" />
          ))}
        </div>
        <div className="h-64 rounded-xl shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {stats && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatsCard
            title="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            subtitle={`Target: >55%`}
            icon={faTrophy}
            iconColor={stats.winRate >= 55 ? 'text-emerald-400' : 'text-red-400'}
            trend={stats.winRate >= 55 ? 'up' : 'down'}
          />
          <StatsCard
            title="Total P&L"
            value={`$${stats.totalPnl.toFixed(2)}`}
            subtitle={`${stats.totalTrades} trades`}
            icon={faCoins}
            iconColor={isPositive ? 'text-emerald-400' : 'text-red-400'}
            valueColor={isPositive ? 'text-emerald-400' : 'text-red-400'}
            trend={isPositive ? 'up' : 'down'}
          />
          <StatsCard
            title="Trades/Hour"
            value={stats.tradesPerHour.toFixed(1)}
            subtitle="Average"
            icon={faBolt}
            iconColor={`text-${colorPrefix}-400`}
          />
          <StatsCard
            title="Avg Hold Time"
            value={formatHoldTime(stats.avgHoldTimeSeconds)}
            subtitle="Per trade"
            icon={faClock}
            iconColor="text-amber-400"
          />
          <StatsCard
            title="Best Trade"
            value={`+$${stats.bestTrade.toFixed(2)}`}
            subtitle="All time"
            icon={faMedal}
            iconColor="text-emerald-400"
            valueColor="text-emerald-400"
          />
          <StatsCard
            title="Max Drawdown"
            value={`-${stats.maxDrawdown.toFixed(1)}%`}
            subtitle="From peak"
            icon={faSkullCrossbones}
            iconColor="text-red-400"
            valueColor="text-red-400"
          />
        </div>
      )}

      {/* Open Trades */}
      <Card className={`border-${colorPrefix}-500/[0.1]`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-xl bg-${colorPrefix}-500/[0.1]`}>
                <FontAwesomeIcon icon={faCircle} className={`h-3 w-3 text-${colorPrefix}-400 animate-pulse`} />
              </div>
              <span>Open Trades</span>
              <Badge className={`bg-${colorPrefix}-500/20 text-${colorPrefix}-400 border-${colorPrefix}-500/30 text-xs`}>
                {openCount}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <PulsingDot status="online" size="sm" />
              <span className="text-[11px] text-white/40">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && openTrades.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <FontAwesomeIcon icon={faChartPie} className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Geen open trades</p>
              <p className="text-xs mt-1 text-white/20">{error}</p>
            </div>
          ) : openTrades.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <p className="text-sm">Geen open {label.toLowerCase()} trades</p>
              <p className="text-xs mt-1">Wachten op signalen...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-white/35 border-b border-white/[0.06]">
                    <th className="text-left pb-2 px-2">Pair</th>
                    <th className="text-left pb-2 px-2">Side</th>
                    <th className="text-right pb-2 px-2">Entry</th>
                    <th className="text-right pb-2 px-2">Leverage</th>
                    <th className="text-right pb-2 px-2">Size</th>
                    <th className="text-right pb-2 px-2">Confidence</th>
                    <th className="text-right pb-2 px-2">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {openTrades.map((trade) => (
                    <tr key={trade.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-2 font-mono font-bold text-white/90">
                        {(trade.symbol ?? trade.pair ?? '—').replace('USDT', '')}
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge className={cn(
                          'text-[10px] font-bold',
                          (trade.direction ?? trade.type) === 'LONG'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/15 text-red-400 border-red-500/20'
                        )}>
                          <FontAwesomeIcon
                            icon={(trade.direction ?? trade.type) === 'LONG' ? faArrowTrendUp : faArrowTrendDown}
                            className="h-2.5 w-2.5 mr-1"
                          />
                          {trade.direction ?? trade.type ?? '—'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-white/70">
                        {formatPrice(trade.entryPrice ?? 0)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-amber-400">
                        {trade.leverage ?? 1}×
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-white/60">
                        ${trade.positionSize ?? trade.size ?? 0}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={cn(
                          'font-mono text-xs',
                          (trade.confidence ?? 0) >= 80 ? 'text-emerald-400' :
                          (trade.confidence ?? 0) >= 60 ? 'text-amber-400' : 'text-red-400'
                        )}>
                          {trade.confidence ?? 0}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-white/40 text-xs">
                        {timeAgo(trade.entryTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trade History */}
      <Card className="border-white/[0.06]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5">
              <span>Trade History</span>
              <Badge variant="outline" className="text-xs text-white/45 border-white/10">
                {closedTrades.length} trades
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {closedTrades.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <p className="text-sm">Nog geen afgesloten trades</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-white/35 border-b border-white/[0.06]">
                    <th className="text-left pb-2 px-2">Pair</th>
                    <th className="text-left pb-2 px-2">Side</th>
                    <th className="text-right pb-2 px-2">Entry</th>
                    <th className="text-right pb-2 px-2">Exit</th>
                    <th className="text-right pb-2 px-2">P&L</th>
                    <th className="text-right pb-2 px-2">P&L %</th>
                    <th className="text-center pb-2 px-2">Reason</th>
                    <th className="text-right pb-2 px-2">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((trade) => {
                    const isWin = (trade.pnl ?? 0) > 0;
                    const reason = closeReasonLabels[trade.closeReason || ''] || { label: '-', color: 'text-white/30' };
                    return (
                      <tr key={trade.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-2 font-mono font-bold text-white/90">
                          {(trade.symbol ?? trade.pair ?? '—').replace('USDT', '')}
                        </td>
                        <td className="py-2.5 px-2">
                          <Badge className={cn(
                            'text-[10px] font-bold',
                            (trade.direction ?? trade.type) === 'LONG'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/15 text-red-400 border-red-500/20'
                          )}>
                            {trade.direction ?? trade.type ?? '—'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-white/60 text-xs">
                          {formatPrice(trade.entryPrice ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-white/60 text-xs">
                          {trade.exitPrice ? formatPrice(trade.exitPrice) : '-'}
                        </td>
                        <td className={cn(
                          'py-2.5 px-2 text-right font-mono font-semibold',
                          isWin ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {isWin ? '+' : ''}${(trade.pnl ?? 0).toFixed(2)}
                        </td>
                        <td className={cn(
                          'py-2.5 px-2 text-right font-mono text-xs',
                          isWin ? 'text-emerald-400/80' : 'text-red-400/80'
                        )}>
                          {isWin ? '+' : ''}{(trade.pnlPercent ?? 0).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge variant="outline" className={`text-[9px] ${reason.color}`}>
                            {reason.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right text-white/40 text-xs">
                          {trade.exitTime ? timeAgo(trade.exitTime) : '-'}
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

// ─── Stats Card Sub-component ───

function StatsCard({ title, value, subtitle, icon, iconColor, valueColor, trend }: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof faTrophy;
  iconColor: string;
  valueColor?: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="glass-card-premium rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-4 transition-all duration-200 hover:bg-white/[0.06]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-white/40">{title}</p>
        <FontAwesomeIcon icon={icon} className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <p className={`text-xl font-bold ${valueColor || 'text-white/90'}`}>{value}</p>
      <p className="text-[10px] text-white/35 mt-0.5">{subtitle}</p>
    </div>
  );
}
