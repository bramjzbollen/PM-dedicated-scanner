'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartArea } from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';

interface EquityPoint {
  time: string;
  equity: number;
  pnl: number;
  trades: number;
}

function generateEquityCurve(days: number, startingBalance: number): EquityPoint[] {
  const points: EquityPoint[] = [];
  let equity = startingBalance;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Simulate daily P&L: slight upward bias (profitable bot)
    const dailyTrades = Math.floor(Math.random() * 40) + 20;
    const dailyPnl = equity * ((Math.random() - 0.42) * 0.025); // slight positive edge
    equity += dailyPnl;

    points.push({
      time: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      equity: Math.round(equity * 100) / 100,
      pnl: Math.round(dailyPnl * 100) / 100,
      trades: dailyTrades,
    });
  }

  return points;
}

type TimeRange = '7d' | '14d' | '30d' | '90d';

export function EquityCurve() {
  const [range, setRange] = useState<TimeRange>('30d');
  const [data, setData] = useState<EquityPoint[]>([]);

  const startingBalance = 10000;

  useEffect(() => {
    const days = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[range];
    setData(generateEquityCurve(days, startingBalance));
  }, [range]);

  // Recalc stats
  const stats = useMemo(() => {
    if (data.length < 2) return null;

    const first = data[0].equity;
    const last = data[data.length - 1].equity;
    const totalPnl = last - first;
    const totalPnlPct = ((last - first) / first) * 100;
    const peak = Math.max(...data.map(d => d.equity));
    const trough = Math.min(...data.map(d => d.equity));
    const maxDrawdown = ((peak - trough) / peak) * 100;
    const totalTrades = data.reduce((sum, d) => sum + d.trades, 0);
    const winDays = data.filter(d => d.pnl > 0).length;
    const winDayRate = (winDays / data.length) * 100;

    return {
      currentEquity: last,
      totalPnl,
      totalPnlPct,
      maxDrawdown,
      totalTrades,
      winDayRate,
      peak,
    };
  }, [data]);

  const isPositive = stats ? stats.totalPnl >= 0 : true;

  return (
    <Card className="border-cyan-500/[0.1] hover:shadow-[0_12px_48px_0_rgba(6,182,212,0.08),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-cyan-500/[0.1] glow-cyan">
              <FontAwesomeIcon icon={faChartArea} className="h-4 w-4 text-cyan-400" />
            </div>
            <span>Account Equity</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Time Range Buttons */}
            <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5">
              {(['7d', '14d', '30d', '90d'] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                    range === r
                      ? 'bg-cyan-500/[0.15] text-cyan-400 shadow-sm'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <PulsingDot status="online" size="sm" />
              <span>Live</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Balance</p>
              <p className="text-lg font-bold text-white/90 mt-0.5">
                ${stats.currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-white/35">P&L ({range})</p>
              <p className={`text-lg font-bold mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}${stats.totalPnl.toFixed(2)}
              </p>
              <p className={`text-[10px] ${isPositive ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                {isPositive ? '+' : ''}{stats.totalPnlPct.toFixed(2)}%
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Max Drawdown</p>
              <p className="text-lg font-bold text-amber-400 mt-0.5">
                -{stats.maxDrawdown.toFixed(2)}%
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-white/35">Win Days</p>
              <p className="text-lg font-bold text-white/90 mt-0.5">
                {stats.winDayRate.toFixed(0)}%
              </p>
              <p className="text-[10px] text-white/35">{stats.totalTrades} trades</p>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="h-64 w-full rounded-xl overflow-hidden bg-white/[0.02] p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.25} />
                  <stop offset="50%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.05} />
                  <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => `$${(val / 1000).toFixed(1)}k`}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 15, 25, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(12px)',
                  padding: '10px 14px',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}
                itemStyle={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: any, name: any) => {
                  if (name === 'equity') return [`$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Equity'];
                  return [value, name];
                }) as any}
              />
              <ReferenceLine
                y={startingBalance}
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="4 4"
                label={{
                  value: 'Start',
                  position: 'right',
                  fill: 'rgba(255,255,255,0.25)',
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={isPositive ? '#22c55e' : '#ef4444'}
                fill="url(#equityGradient)"
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  stroke: isPositive ? '#22c55e' : '#ef4444',
                  strokeWidth: 2,
                  fill: 'rgba(15, 15, 25, 0.95)',
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Bottom info */}
        <div className="flex items-center justify-between text-[10px] text-white/30">
          <span>Paper Trading • Bybit Testnet</span>
          <span>Starting Balance: ${startingBalance.toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
