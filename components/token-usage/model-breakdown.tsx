'use client';

import { Cpu } from 'lucide-react';

interface ModelData {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  percentage: number;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

const MODEL_META: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  'claude-opus-4': {
    label: 'Claude Opus 4',
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/[0.15]',
    borderColor: 'border-rose-500/[0.2]',
  },
  'claude-sonnet-4': {
    label: 'Claude Sonnet 4',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/[0.15]',
    borderColor: 'border-indigo-500/[0.2]',
  },
  'claude-haiku-3.5': {
    label: 'Claude Haiku 3.5',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/[0.15]',
    borderColor: 'border-emerald-500/[0.2]',
  },
};

const BAR_COLORS: Record<string, string> = {
  'claude-opus-4': 'bg-rose-500/80',
  'claude-sonnet-4': 'bg-indigo-500/80',
  'claude-haiku-3.5': 'bg-emerald-500/80',
};

function ShimmerBreakdown() {
  return (
    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="h-6 w-48 rounded-md bg-white/[0.06] animate-pulse mb-6" />
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-5 w-40 rounded-md bg-white/[0.06] animate-pulse" />
            <div className="h-3 w-full rounded-full bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-32 rounded-md bg-white/[0.04] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ModelBreakdownProps {
  data: ModelData[] | null;
  loading: boolean;
}

export function ModelBreakdown({ data, loading }: ModelBreakdownProps) {
  if (loading || !data) {
    return <ShimmerBreakdown />;
  }

  const totalCost = data.reduce((sum, m) => sum + m.costUSD, 0);

  return (
    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-6 transition-all duration-300 hover:bg-white/[0.05] shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <h3 className="text-lg font-semibold text-white/90 mb-6 flex items-center gap-2">
        <Cpu className="h-5 w-5 text-violet-400" />
        Model Breakdown
        <span className="text-sm font-normal text-white/30 ml-1">deze maand</span>
      </h3>

      {/* Combined progress bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-6 bg-white/[0.04]">
        {data.map((m) => (
          <div
            key={m.model}
            className={`${BAR_COLORS[m.model] || 'bg-white/20'} transition-all duration-500`}
            style={{ width: `${m.percentage}%` }}
          />
        ))}
      </div>

      <div className="space-y-5">
        {data.map((model) => {
          const meta = MODEL_META[model.model] || {
            label: model.model,
            color: 'text-white/80',
            bgColor: 'bg-white/[0.08]',
            borderColor: 'border-white/[0.12]',
          };
          const costPct = totalCost > 0 ? (model.costUSD / totalCost) * 100 : 0;

          return (
            <div
              key={model.model}
              className={`rounded-xl ${meta.bgColor} border ${meta.borderColor} p-4 transition-all duration-200 hover:scale-[1.01]`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
                <span className="text-sm text-white/50">{model.percentage.toFixed(1)}% tokens</span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-white/40 text-xs">Input</p>
                  <p className="text-white/80 font-medium">{formatTokens(model.inputTokens)}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Output</p>
                  <p className="text-white/80 font-medium">{formatTokens(model.outputTokens)}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Kosten</p>
                  <p className={`font-medium ${meta.color}`}>{formatUSD(model.costUSD)}</p>
                  <p className="text-white/30 text-[10px]">{costPct.toFixed(1)}% van totaal</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
