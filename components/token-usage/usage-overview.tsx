'use client';

import { Activity, TrendingUp, TrendingDown, DollarSign, Zap } from 'lucide-react';

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function ShimmerCard() {
  return (
    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-6 w-6 rounded-md bg-white/[0.06] animate-pulse" />
      </div>
      <div className="h-9 w-36 rounded-md bg-white/[0.06] animate-pulse mt-3" />
      <div className="h-3 w-20 rounded-md bg-white/[0.04] animate-pulse mt-2" />
    </div>
  );
}

interface UsageOverviewProps {
  data: {
    todayInputTokens: number;
    todayOutputTokens: number;
    todayCostUSD: number;
    monthInputTokens: number;
    monthOutputTokens: number;
    monthCostUSD: number;
    prevMonthCostUSD: number;
  } | null;
  loading: boolean;
}

export function UsageOverview({ data, loading }: UsageOverviewProps) {
  if (loading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <ShimmerCard key={i} />)}
      </div>
    );
  }

  const monthChange = data.prevMonthCostUSD > 0
    ? ((data.monthCostUSD - data.prevMonthCostUSD) / data.prevMonthCostUSD) * 100
    : 0;
  const isUp = monthChange >= 0;

  const cards = [
    {
      label: 'Tokens Vandaag',
      value: formatTokens(data.todayInputTokens + data.todayOutputTokens),
      sub: `${formatTokens(data.todayInputTokens)} in · ${formatTokens(data.todayOutputTokens)} out`,
      icon: Zap,
      iconColor: 'text-amber-400',
      glowClass: 'glow-orange',
      bgClass: 'bg-amber-500/[0.1]',
    },
    {
      label: 'Tokens Deze Maand',
      value: formatTokens(data.monthInputTokens + data.monthOutputTokens),
      sub: `${formatTokens(data.monthInputTokens)} in · ${formatTokens(data.monthOutputTokens)} out`,
      icon: Activity,
      iconColor: 'text-cyan-400',
      glowClass: 'glow-cyan',
      bgClass: 'bg-cyan-500/[0.1]',
    },
    {
      label: 'Kosten Deze Maand',
      value: formatUSD(data.monthCostUSD),
      sub: `Vandaag: ${formatUSD(data.todayCostUSD)}`,
      icon: DollarSign,
      iconColor: 'text-emerald-400',
      glowClass: 'glow-green',
      bgClass: 'bg-emerald-500/[0.1]',
    },
    {
      label: 'vs. Vorige Maand',
      value: `${isUp ? '+' : ''}${monthChange.toFixed(1)}%`,
      sub: `Vorig: ${formatUSD(data.prevMonthCostUSD)}`,
      icon: isUp ? TrendingUp : TrendingDown,
      iconColor: isUp ? 'text-rose-400' : 'text-emerald-400',
      glowClass: isUp ? '' : 'glow-green',
      bgClass: isUp ? 'bg-rose-500/[0.1]' : 'bg-emerald-500/[0.1]',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-0.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[0_12px_48px_0_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50">{card.label}</p>
              <div className={`p-1.5 rounded-lg ${card.bgClass} ${card.glowClass}`}>
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </div>
            <p className={`text-3xl font-bold mt-2 tracking-tight ${card.iconColor}`}>{card.value}</p>
            <p className="text-xs text-white/35 mt-1">{card.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
