'use client';

import { useEffect, useState } from 'react';
import { MetricsCard } from './metrics-card';
import type { TradingMetrics } from '@/lib/types';
import { getMockMetrics } from '@/lib/mock-data';

function formatHoldTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function RealTimeMetrics() {
  const [metrics, setMetrics] = useState<TradingMetrics>(getMockMetrics());

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        profitLoss: prev.profitLoss + (Math.random() - 0.4) * 5,
        walletSize: prev.walletSize + (Math.random() - 0.4) * 5,
        winRate: Math.max(45, Math.min(75, prev.winRate + (Math.random() - 0.5) * 2)),
        tradesPerHour: Math.max(8, Math.min(20, prev.tradesPerHour + (Math.random() - 0.5) * 0.5)),
        avgHoldTimeSeconds: Math.max(30, Math.min(300, prev.avgHoldTimeSeconds + Math.floor((Math.random() - 0.5) * 10))),
        trades24h: Math.max(50, Math.min(200, prev.trades24h + Math.floor((Math.random() - 0.3) * 2))),
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <MetricsCard
        title="Win Rate"
        value={`${metrics.winRate.toFixed(1)}%`}
        subtitle="Target: >55%"
        trend={metrics.winRate >= 55 ? 'up' : 'down'}
      />
      <MetricsCard
        title="P&L"
        value={`$${metrics.profitLoss.toFixed(2)}`}
        subtitle="Today"
        trend={metrics.profitLoss >= 0 ? 'up' : 'down'}
      />
      <MetricsCard
        title="Trades/Hour"
        value={metrics.tradesPerHour.toFixed(1)}
        subtitle="Average"
      />
      <MetricsCard
        title="Avg Hold Time"
        value={formatHoldTime(metrics.avgHoldTimeSeconds)}
        subtitle="Per trade"
      />
      <MetricsCard
        title="Trades 24h"
        value={metrics.trades24h.toString()}
        subtitle="Last 24 hours"
        trend="up"
      />
      <MetricsCard
        title="Wallet"
        value={`$${metrics.walletSize.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        subtitle="Current balance"
        trend="up"
      />
    </>
  );
}
