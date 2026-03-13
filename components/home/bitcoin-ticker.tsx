'use client';

import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBitcoin } from '@fortawesome/free-brands-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';

interface BTCData {
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
  sparkline: { time: number; value: number }[];
}

// Memoized chart component to prevent re-rendering on every price update
const SparklineChart = memo(function SparklineChart({ 
  data, isPositive, id, height = 56 
}: { 
  data: { time: number; value: number }[]; isPositive: boolean; id: string; height?: number 
}) {
  if (data.length === 0) return null;
  return (
    <div className={`h-${height === 56 ? '14' : '32'} ${height === 56 ? 'w-32' : 'w-full'} rounded-lg overflow-hidden bg-white/[0.02]`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <Area type="monotone" dataKey="value" stroke={isPositive ? '#22c55e' : '#ef4444'} fill={`url(#${id})`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

const FETCH_INTERVAL = 60000; // 60s instead of 10s — CoinGecko rate limits anyway
const CHART_INTERVAL = 5 * 60 * 1000; // Refresh chart every 5 min

export function BitcoinTicker({ compact = false }: { compact?: boolean } = {}) {
  const [data, setData] = useState<BTCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sparklineRef = useRef<{ time: number; value: number }[]>([]);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBTC = useCallback(async (includeChart = false) => {
    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const fetches: Promise<Response>[] = [
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true', { signal }),
      ];

      if (includeChart) {
        fetches.push(
          fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1', { signal })
        );
      }

      const results = await Promise.all(fetches);
      if (!mountedRef.current) return;

      const priceJson = await results[0].json();
      const btc = priceJson.bitcoin;

      let sparkline = sparklineRef.current;
      let high24h = btc.usd * 1.015;
      let low24h = btc.usd * 0.985;

      if (includeChart && results[1]?.ok) {
        const chartJson = await results[1].json();
        const prices: [number, number][] = chartJson.prices || [];
        // Downsample chart data to max 100 points (from ~290) to reduce memory
        const step = Math.max(1, Math.floor(prices.length / 100));
        sparkline = [];
        for (let i = 0; i < prices.length; i += step) {
          sparkline.push({ time: prices[i][0], value: prices[i][1] });
        }
        sparklineRef.current = sparkline;
        const chartPrices = prices.map(p => p[1]);
        high24h = Math.max(...chartPrices);
        low24h = Math.min(...chartPrices);
      }

      if (!mountedRef.current) return;
      setData({
        price: btc.usd,
        change24h: btc.usd * (btc.usd_24h_change / 100),
        changePercent24h: btc.usd_24h_change,
        high24h,
        low24h,
        marketCap: btc.usd_market_cap || 0,
        sparkline,
      });
      setError(null);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      if (!data) setError('Could not load BTC price');
      else setError('Using cached data');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchBTC(true); // Initial fetch with chart

    // Price-only refresh every 60s
    const priceInterval = setInterval(() => fetchBTC(false), FETCH_INTERVAL);
    // Chart refresh every 5 min
    const chartInterval = setInterval(() => fetchBTC(true), CHART_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(priceInterval);
      clearInterval(chartInterval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchBTC]);

  if (loading) {
    return (
      <Card className="h-full border-orange-500/[0.15]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faBitcoin} className="h-6 w-6 text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" /> Bitcoin
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 rounded-xl shimmer" />
            <div className="h-24 rounded-xl shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const isPositive = data.changePercent24h >= 0;

  if (compact) {
    return (
      <Card className="h-full border-orange-500/[0.15] hover:shadow-[0_12px_48px_0_rgba(249,115,22,0.1),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
        <CardHeader className="pb-1 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-orange-500/[0.1] glow-orange">
                <FontAwesomeIcon icon={faBitcoin} className="h-4 w-4 text-orange-400" />
              </div>
              <span className="text-sm">Bitcoin</span>
              <span className="text-[10px] text-white/30">24h</span>
            </CardTitle>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              {error ? (
                <Badge variant="outline" className="text-[10px] text-white/40">{error}</Badge>
              ) : (
                <>
                  <PulsingDot status="online" size="sm" />
                  <span>60s</span>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-3xl font-bold tracking-tight text-white/95">
                ${data.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  className={cn(
                    'text-xs font-semibold backdrop-blur-sm',
                    isPositive
                      ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.2]'
                      : 'bg-red-500/[0.12] text-red-400 border-red-500/[0.2]'
                  )}
                >
                  {isPositive ? '▲' : '▼'} {Math.abs(data.changePercent24h).toFixed(2)}%
                </Badge>
                <span className={cn('text-xs', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                  {isPositive ? '+' : ''}${data.change24h.toFixed(0)}
                </span>
              </div>
            </div>
            <SparklineChart data={data.sparkline} isPositive={isPositive} id="btcGradientCompact" />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-white/40">
            <span>H: <span className="text-white/60">${data.high24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></span>
            <span>L: <span className="text-white/60">${data.low24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></span>
            <span>MCap: <span className="text-white/60">${(data.marketCap / 1e9).toFixed(1)}B</span></span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full mode (unchanged layout, just using memoized chart)
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

  return (
    <Card className="h-full border-orange-500/[0.15] hover:shadow-[0_12px_48px_0_rgba(249,115,22,0.1),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-orange-500/[0.1] glow-orange">
              <FontAwesomeIcon icon={faBitcoin} className="h-5 w-5 text-orange-400" />
            </div>
            <span>Bitcoin</span>
            <span className="text-xs text-white/30 font-normal">24h</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {error ? (
              <Badge variant="outline" className="text-xs text-white/40">{error}</Badge>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <PulsingDot status="online" size="sm" />
                <span>60s</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-5xl font-bold tracking-tight text-white/95">
            ${data.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge className={cn('text-sm font-semibold backdrop-blur-sm', isPositive ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.2]' : 'bg-red-500/[0.12] text-red-400 border-red-500/[0.2]')}>
              {isPositive ? '▲' : '▼'} {Math.abs(data.changePercent24h).toFixed(2)}%
            </Badge>
            <span className={cn('text-sm font-medium', isPositive ? 'text-emerald-400' : 'text-red-400')}>
              {isPositive ? '+' : ''}${data.change24h.toFixed(0)}
            </span>
          </div>
        </div>
        {data.sparkline.length > 0 && (
          <div className="h-32 w-full rounded-xl overflow-hidden bg-white/[0.02] p-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.sparkline}>
                <defs>
                  <linearGradient id="btcGradient24h" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
                <YAxis domain={['dataMin', 'dataMax']} hide />
                <Tooltip contentStyle={{ background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.9)', fontSize: '12px' }} labelFormatter={(ts) => formatTime(ts as number)} formatter={(val) => [`$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'BTC']} />
                <Area type="monotone" dataKey="value" stroke={isPositive ? '#22c55e' : '#ef4444'} fill="url(#btcGradient24h)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <p className="text-white/45 text-xs">24h High</p>
            <p className="font-semibold text-white/90 mt-0.5">${data.high24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <p className="text-white/45 text-xs">24h Low</p>
            <p className="font-semibold text-white/90 mt-0.5">${data.low24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="col-span-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <p className="text-white/45 text-xs">Market Cap</p>
            <p className="font-semibold text-white/90 mt-0.5">${(data.marketCap / 1e9).toFixed(1)}B</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
