'use client';

import type { FinanceKPIs } from '@/lib/types';

function formatEUR(value: number): string {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

interface KPICardsProps {
  data: FinanceKPIs | null;
  loading: boolean;
}

export function KPICards({ data, loading }: KPICardsProps) {
  if (loading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <ShimmerCard key={i} />)}
      </div>
    );
  }

  const cards = [
    {
      label: 'Totale Omzet YTD',
      value: formatEUR(data.totalRevenueYTD),
      sub: `${data.totalInvoicesThisYear} facturen`,
      emoji: '💰',
      color: 'text-emerald-400',
    },
    {
      label: 'Openstaand',
      value: formatEUR(data.outstandingAmount),
      sub: `${data.openCount} open · ${data.overdueCount} verlopen`,
      emoji: '📄',
      color: data.overdueCount > 0 ? 'text-orange-400' : 'text-blue-400',
    },
    {
      label: 'Offertes in Behandeling',
      value: formatEUR(data.pendingEstimatesAmount),
      sub: `${data.pendingEstimatesCount} offerte${data.pendingEstimatesCount !== 1 ? 's' : ''}`,
      emoji: '📝',
      color: 'text-blue-400',
    },
    {
      label: 'Gem. Betaaltermijn',
      value: `${data.avgPaymentDays} dagen`,
      sub: `Gem. factuurwaarde ${formatEUR(data.avgInvoiceValue)}`,
      emoji: '⏱️',
      color: data.avgPaymentDays > 30 ? 'text-orange-400' : 'text-purple-400',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-0.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[0_12px_48px_0_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/50">{card.label}</p>
            <span className="text-xl">{card.emoji}</span>
          </div>
          <p className={`text-3xl font-bold mt-2 tracking-tight ${card.color}`}>{card.value}</p>
          <p className="text-xs text-white/35 mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
