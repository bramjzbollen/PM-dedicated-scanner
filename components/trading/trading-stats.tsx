'use client';

import { Card, CardContent } from '@/components/ui/card';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWallet, faChartLine, faTrophy, faSkull,
  faClock, faLayerGroup, faList, faPercent,
  faArrowUp, faArrowDown,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { formatDuration, INITIAL_WALLET } from '@/lib/trading-engine';

interface TradingStatsProps {
  walletBalance: number;
  openPnl: number;
  realizedPnl: number;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  closedCount: number;
  bestTrade: number;
  worstTrade: number;
  avgDuration: number;
  openPositions: number;
  maxPositions: number;
  queueCount: number;
  color: 'cyan' | 'violet' | 'amber';
}

export function TradingStatsPanel({
  walletBalance, openPnl, realizedPnl, totalPnl,
  winRate, totalTrades, closedCount, bestTrade, worstTrade,
  avgDuration, openPositions, maxPositions, queueCount, color,
}: TradingStatsProps) {
  const accent = color;
  const pnlColor = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-white/60';
  const pnlSign = (v: number) => v > 0 ? '+' : '';

  const stats = [
    {
      label: 'Wallet',
      value: `$${(walletBalance ?? 0).toFixed(2)}`,
      icon: faWallet,
      color: walletBalance >= INITIAL_WALLET ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Open P&L',
      value: `${pnlSign(openPnl)}$${(openPnl ?? 0).toFixed(2)}`,
      icon: faChartLine,
      color: pnlColor(openPnl),
    },
    {
      label: 'Realized P&L',
      value: `${pnlSign(realizedPnl)}$${(realizedPnl ?? 0).toFixed(2)}`,
      icon: faArrowUp,
      color: pnlColor(realizedPnl),
    },
    {
      label: 'Total P&L',
      value: `${pnlSign(totalPnl)}$${(totalPnl ?? 0).toFixed(2)}`,
      icon: faChartLine,
      color: pnlColor(totalPnl),
      highlight: true,
    },
    {
      label: 'Win Rate',
      value: closedCount > 0 ? `${(winRate ?? 0).toFixed(1)}%` : '-',
      icon: faPercent,
      color: winRate >= 50 ? 'text-emerald-400' : winRate > 0 ? 'text-amber-400' : 'text-white/60',
    },
    {
      label: 'Trades',
      value: `${openPositions} / ${closedCount}`,
      icon: faLayerGroup,
      color: `text-${accent}-400`,
      sub: `open / closed`,
    },
    {
      label: 'Best Trade',
      value: bestTrade > 0 ? `+$${(bestTrade ?? 0).toFixed(2)}` : '-',
      icon: faTrophy,
      color: 'text-emerald-400',
    },
    {
      label: 'Worst Trade',
      value: worstTrade < 0 ? `$${(worstTrade ?? 0).toFixed(2)}` : '-',
      icon: faSkull,
      color: 'text-red-400',
    },
    {
      label: 'Avg Duration',
      value: avgDuration > 0 ? formatDuration(avgDuration) : '-',
      icon: faClock,
      color: 'text-white/60',
    },
    {
      label: 'Slots',
      value: `${openPositions}/${maxPositions}`,
      icon: faLayerGroup,
      color: openPositions >= maxPositions ? 'text-amber-400' : `text-${accent}-400`,
    },
    {
      label: 'Queue',
      value: `${queueCount}`,
      icon: faList,
      color: queueCount > 0 ? 'text-amber-400' : 'text-white/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2">
      {stats.map((stat, i) => (
        <Card
          key={stat.label}
          className={cn(
            'hover:-translate-y-0 p-0',
            stat.highlight && `ring-1 ring-${accent}-500/20`
          )}
        >
          <CardContent className="p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={stat.icon} className={cn('h-3 w-3', stat.color)} />
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{stat.label}</span>
            </div>
            <div className={cn('text-sm font-bold font-mono', stat.color)}>
              {stat.value}
            </div>
            {stat.sub && (
              <span className="text-[9px] text-white/30">{stat.sub}</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}



