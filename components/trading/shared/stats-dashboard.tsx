'use client';

import { TradingStatsPanel } from '../trading-stats';

interface StatsDashboardProps {
  color: 'cyan' | 'amber';
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
}

export function StatsDashboard(props: StatsDashboardProps) {
  return <TradingStatsPanel {...props} />;
}
