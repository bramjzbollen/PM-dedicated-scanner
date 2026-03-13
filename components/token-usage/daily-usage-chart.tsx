'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
} from 'recharts';
import { BarChart3 } from 'lucide-react';

interface DailyData {
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

function ShimmerChart() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-64 rounded-md bg-white/[0.06] animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-80 rounded-xl bg-white/[0.03] animate-pulse flex items-end gap-2 p-4">
          {[40, 65, 50, 80, 30, 70, 55, 90, 45, 75, 60, 85, 50, 70, 40, 65, 55, 75, 60, 80, 45, 70, 50, 85, 55, 65, 70, 60, 75, 50].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-md bg-white/[0.06]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface DailyUsageChartProps {
  data: DailyData[] | null;
  loading: boolean;
}

function formatTokensShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

export function DailyUsageChart({ data, loading }: DailyUsageChartProps) {
  if (loading || !data) {
    return <ShimmerChart />;
  }

  const chartData = data.map(d => ({
    date: new Date(d.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' }),
    'Input Tokens': d.inputTokens,
    'Output Tokens': d.outputTokens,
    'Kosten ($)': Number(d.costUSD.toFixed(2)),
  }));

  const totalCost = data.reduce((sum, d) => sum + d.costUSD, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
            Dagelijks Token Gebruik
            <span className="text-sm font-normal text-white/30 ml-1">30 dagen</span>
          </CardTitle>
          <span className="text-sm text-white/40">
            Totaal: ${totalCost.toFixed(2)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(99, 102, 241, 0.8)" />
                  <stop offset="100%" stopColor="rgba(99, 102, 241, 0.3)" />
                </linearGradient>
                <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(139, 92, 246, 0.8)" />
                  <stop offset="100%" stopColor="rgba(139, 92, 246, 0.3)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                interval={4}
              />
              <YAxis
                yAxisId="tokens"
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                tickFormatter={(v) => formatTokensShort(v)}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              />
              <YAxis
                yAxisId="cost"
                orientation="right"
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(13, 13, 36, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                  fontSize: '12px',
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: any, name: any) => {
                  const v = Number(value) || 0;
                  const n = String(name ?? '');
                  if (n === 'Kosten ($)') return [`$${v.toFixed(2)}`, n];
                  return [formatTokensShort(v), n];
                }) as any}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}
              />
              <Bar
                yAxisId="tokens"
                dataKey="Input Tokens"
                stackId="tokens"
                fill="url(#inputGrad)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                yAxisId="tokens"
                dataKey="Output Tokens"
                stackId="tokens"
                fill="url(#outputGrad)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="cost"
                type="monotone"
                dataKey="Kosten ($)"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
