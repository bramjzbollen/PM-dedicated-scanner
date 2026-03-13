'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyRevenue } from '@/lib/types';
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
} from 'recharts';

function ShimmerChart() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-64 rounded-md bg-white/[0.06] animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-72 rounded-xl bg-white/[0.03] animate-pulse flex items-end gap-2 p-4">
          {[40, 65, 50, 80, 30, 70, 55, 90, 45, 75, 60, 85].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-white/[0.06]"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface RevenueChartProps {
  data: MonthlyRevenue[] | null;
  loading: boolean;
}

export function RevenueChart({ data, loading }: RevenueChartProps) {
  if (loading || !data) {
    return <ShimmerChart />;
  }

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">📊 Omzet Overzicht 2026</CardTitle>
          <span className="text-sm text-white/40">
            Totaal: €{totalRevenue.toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`}
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
                }}
                formatter={(value) => [`€${Number(value).toLocaleString('nl-BE', { minimumFractionDigits: 2 })}`, 'Omzet']}
              />
              <Bar dataKey="revenue" fill="rgba(99, 102, 241, 0.6)" radius={[6, 6, 0, 0]} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
