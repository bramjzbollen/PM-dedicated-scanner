'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faArrowTrendUp, faArrowTrendDown } from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';

interface PnLData {
  dailyPnl: number;
  dailyPnlPercent: number;
  winRate: number;
  trades24h: number;
  openTrades: number;
}

const POLL_INTERVAL = 60000; // 60s instead of 30s — PnL doesn't need sub-minute updates on home

export function DailyPnLCard() {
  const [data, setData] = useState<PnLData>({
    dailyPnl: 0, dailyPnlPercent: 0, winRate: 0, trades24h: 0, openTrades: 0,
  });
  const [source, setSource] = useState<string>('loading');
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPnL = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/papertrades?limit=200', { signal: abortRef.current.signal });
      if (!res.ok) throw new Error('API error');
      if (!mountedRef.current) return;
      const json = await res.json();

      if (json.source === 'none' || !json.stats) {
        setSource('waiting');
        return;
      }

      const stats = json.stats;
      const startingBalance = stats.startingBalance || 5000;
      const dailyPnlPercent = startingBalance > 0 ? (stats.totalPnl / startingBalance) * 100 : 0;

      if (mountedRef.current) {
        setData({
          dailyPnl: stats.totalPnl || 0,
          dailyPnlPercent,
          winRate: stats.winRate || 0,
          trades24h: stats.trades24h || 0,
          openTrades: json.openCount || 0,
        });
        setSource('live');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      if (mountedRef.current) setSource('error');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchPnL();
    const interval = setInterval(fetchPnL, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchPnL]);

  const isPositive = data.dailyPnl >= 0;

  return (
    <div className="glass-card-premium gradient-border-card rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-0.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] col-span-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${isPositive ? 'bg-emerald-500/[0.1] glow-green' : 'bg-red-500/[0.1]'}`}>
            <FontAwesomeIcon icon={isPositive ? faArrowTrendUp : faArrowTrendDown} className={`h-4 w-4 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <p className="text-sm text-white/50">Daily P&L</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/30">
          <PulsingDot status={source === 'live' ? 'online' : 'offline'} size="sm" />
          <FontAwesomeIcon icon={faChartLine} className="h-3 w-3" />
          {source === 'live' ? 'Bybit Papertrade' : source === 'waiting' ? 'Wachten op data...' : 'Trading Bot'}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className={`text-3xl font-bold tracking-tight ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}${data.dailyPnl.toFixed(2)}
          </p>
          <p className={`text-sm mt-0.5 ${isPositive ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
            {isPositive ? '+' : ''}{data.dailyPnlPercent.toFixed(2)}% totaal
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-[10px] text-white/40 uppercase">Win Rate</p>
            <p className={`text-sm font-bold ${data.winRate >= 55 ? 'text-emerald-400' : 'text-amber-400'}`}>{data.winRate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 uppercase">Trades 24h</p>
            <p className="text-sm font-bold text-white/80">{data.trades24h}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 uppercase">Open</p>
            <p className="text-sm font-bold text-cyan-400">{data.openTrades}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
