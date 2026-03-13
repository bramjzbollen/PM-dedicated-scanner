'use client';

import { useState, useEffect, useCallback } from 'react';
import { UsageOverview } from '@/components/token-usage/usage-overview';
import { DailyUsageChart } from '@/components/token-usage/daily-usage-chart';
import { ModelBreakdown } from '@/components/token-usage/model-breakdown';
import { UsageTable } from '@/components/token-usage/usage-table';
import { Activity, RefreshCw, FlaskConical } from 'lucide-react';

interface TokenUsageData {
  daily: {
    date: string;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
    models: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUSD: number;
    }[];
  }[];
  summary: {
    todayInputTokens: number;
    todayOutputTokens: number;
    todayCostUSD: number;
    monthInputTokens: number;
    monthOutputTokens: number;
    monthCostUSD: number;
    prevMonthCostUSD: number;
    models: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUSD: number;
      percentage: number;
    }[];
  };
  lastUpdated: string;
  isLive?: boolean;
}

export default function TokenUsagePage() {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/token-usage');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kan token usage data niet laden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-fade-in-up flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3 tracking-tight">
              <div className="p-2.5 rounded-xl bg-violet-500/[0.1] glow-purple">
                <Activity className="h-6 w-6 text-violet-400" />
              </div>
              <span className="bg-gradient-to-r from-white via-violet-200 to-white/60 bg-clip-text text-transparent">
                Token Usage
              </span>
            </h1>
            <p className="text-white/50 mt-1">
              Anthropic API token verbruik en kosten
              {data?.lastUpdated && (
                <span className="ml-2 text-white/30">
                  · {new Date(data.lastUpdated).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Data source indicator */}
            {data && !data.isLive && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.12] text-amber-400/70 text-xs">
                <FlaskConical className="h-3 w-3" />
                Demo data
              </div>
            )}
            {data?.isLive && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/[0.12] text-emerald-400/70 text-xs">
                <Activity className="h-3 w-3" />
                Live
              </div>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:text-white/90 transition-all duration-300 disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Laden...' : 'Vernieuwen'}
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && !data && (
          <div className="rounded-2xl bg-red-500/[0.06] backdrop-blur-2xl border border-red-500/[0.15] p-8 text-center">
            <p className="text-red-400 text-lg font-semibold mb-2">Fout bij laden</p>
            <p className="text-white/50 text-sm mb-4">{error}</p>
            <button
              onClick={() => fetchData()}
              className="px-4 py-2 rounded-xl bg-red-500/[0.1] border border-red-500/[0.2] text-red-400 hover:bg-red-500/[0.2] transition-all text-sm"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <UsageOverview data={data?.summary ?? null} loading={loading} />

        {/* Chart */}
        <DailyUsageChart data={data?.daily ?? null} loading={loading} />

        {/* Model Breakdown + Table side by side */}
        <div className="grid gap-8 lg:grid-cols-2">
          <ModelBreakdown data={data?.summary.models ?? null} loading={loading} />
          <UsageTable data={data?.daily ?? null} loading={loading} />
        </div>
      </div>
    </main>
  );
}
