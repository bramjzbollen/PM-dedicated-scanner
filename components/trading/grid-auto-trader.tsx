'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical, faPlay, faStop, faRotateRight, faChevronDown, faChevronUp, faCoins } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

interface GridConfig {
  pairs: string[];
  gridLevels: number;
  spacingPct: number;
  positionSizeUsd: number;
  leverage: number;
  maxOpenPerPair: number;
  maxOpenTotal: number;
  tickIntervalMs: number;
  rebuildDriftPct: number;
  roundtripFeePct: number;
}

interface GridState {
  isRunning: boolean;
  positions: any[];
  closedPositions: any[];
  stats: {
    walletBalance: number;
    realizedPnl: number;
    closedCount: number;
    winCount: number;
    lossCount: number;
  };
  config: any;
  winRate: number;
  openPnl: number;
}

const DEFAULT_CONFIG: GridConfig = {
  pairs: ['BTC/USDT', 'ETH/USDT'],
  gridLevels: 15,
  spacingPct: 0.15,
  positionSizeUsd: 50,
  leverage: 10,
  maxOpenPerPair: 5,
  maxOpenTotal: 10,
  tickIntervalMs: 3000,
  rebuildDriftPct: 1.5,
  roundtripFeePct: 0.11,
};

function Slider({ label, value, onChange, min, max, step, unit, colorClass }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit?: string; colorClass?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-white/40">{label}</label>
        <span className={cn('text-xs font-mono font-bold', colorClass || 'text-white/70')}>{value}{unit || ''}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.1] accent-cyan-500" />
    </div>
  );
}

export function GridAutoTrader() {
  const [state, setState] = useState<GridState | null>(null);
  const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  // Poll grid state
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/v2-trade-state?mode=v2-grid');
        const data = await res.json();
        if (data && !data.error) setState(data);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load grid config
  useEffect(() => {
    fetch('/api/grid-config')
      .then(r => r.json())
      .then(data => { if (data && !data.error) setConfig(data); })
      .catch(() => {});
  }, []);

  const saveConfig = useCallback(async (updates: Partial<GridConfig>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/grid-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch {}
    setSaving(false);
  }, []);

  const apiAction = async (action: string, params: any = {}) => {
    try {
      await fetch('/api/v2-trade-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'v2-grid', action, ...params }),
      });
    } catch {}
  };

  const pnl = state?.stats?.realizedPnl || 0;
  const openPnl = state?.openPnl || 0;
  const totalPnl = pnl + openPnl;
  const trades = state?.stats?.closedCount || 0;
  const wr = state?.winRate || 0;
  const wallet = state?.stats?.walletBalance || 1000;
  const openCount = state?.positions?.length || 0;
  const isRunning = state?.isRunning || false;

  // Fee calculation
  const notional = config.positionSizeUsd * config.leverage;
  const grossTpProfit = notional * (config.spacingPct / 100);
  const fees = notional * (config.roundtripFeePct / 100);
  const netTpProfit = grossTpProfit - fees;
  const isProfitable = netTpProfit > 0;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border-cyan-500/[0.15]">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/[0.1]">
                <FontAwesomeIcon icon={faGripVertical} className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white/90">Grid Bot</h2>
                <p className="text-xs text-white/40">Adaptive ATR-based grid trading</p>
              </div>
              <Badge variant="outline" className={cn('text-[10px] ml-2',
                isRunning ? 'text-emerald-400 border-emerald-500/30' : 'text-white/30 border-white/10')}>
                {isRunning ? 'RUNNING' : 'STOPPED'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => apiAction(isRunning ? 'stop' : 'start')}
                className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all',
                  isRunning
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25')}>
                <FontAwesomeIcon icon={isRunning ? faStop : faPlay} className="h-3 w-3 mr-1.5" />
                {isRunning ? 'Stop' : 'Start'}
              </button>
              <button onClick={() => apiAction('reset')}
                className="px-3 py-2 rounded-lg text-xs text-white/40 bg-white/[0.04] border border-white/[0.08] hover:text-white/60">
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Trades</div>
              <div className="text-xl font-bold font-mono text-white/90">{trades}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Win Rate</div>
              <div className={cn('text-xl font-bold font-mono', wr > 50 ? 'text-emerald-400' : wr > 0 ? 'text-amber-400' : 'text-white/40')}>
                {wr.toFixed(1)}%
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Realized PnL</div>
              <div className={cn('text-xl font-bold font-mono', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                ${pnl.toFixed(2)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Open</div>
              <div className="text-xl font-bold font-mono text-cyan-400">{openCount}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Wallet</div>
              <div className="text-xl font-bold font-mono text-white/90">${wallet.toFixed(0)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Open Positions */}
      {state?.positions && state.positions.length > 0 && (
        <Card className="border-cyan-500/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/60">Open Grid Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {state.positions.map((pos: any) => (
                <div key={pos.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('text-[9px]',
                      pos.direction === 'LONG' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30')}>
                      {pos.direction}
                    </Badge>
                    <span className="text-xs font-mono text-white/70">{pos.symbol}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-white/30">entry: {pos.entryPrice}</span>
                    <span className={cn('text-xs font-mono font-bold', pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      ${pos.pnl?.toFixed(2) || '0.00'}
                    </span>
                    <button onClick={() => apiAction('closePosition', { positionId: pos.id })}
                      className="text-[9px] text-white/20 hover:text-red-400 transition-colors">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Trades */}
      {state?.closedPositions && state.closedPositions.length > 0 && (
        <Card className="border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/60">Recent Grid Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {state.closedPositions.slice(0, 10).map((pos: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-white/[0.01]">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('text-[8px]',
                      pos.direction === 'LONG' ? 'text-emerald-400/60 border-emerald-500/20' : 'text-red-400/60 border-red-500/20')}>
                      {pos.direction}
                    </Badge>
                    <span className="text-[10px] font-mono text-white/50">{pos.symbol}</span>
                    <span className="text-[9px] text-white/20">{pos.closeReason}</span>
                  </div>
                  <span className={cn('text-xs font-mono font-bold', pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    ${pos.pnl?.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Settings */}
      <Card className="border-cyan-500/[0.08]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-white/60 flex items-center gap-2">
              Grid Settings
              {saving && <span className="text-[9px] text-amber-400 animate-pulse">saving...</span>}
            </CardTitle>
            <button onClick={() => setShowSettings(!showSettings)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                showSettings ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'bg-white/[0.04] border border-white/[0.08] text-white/60')}>
              <FontAwesomeIcon icon={showSettings ? faChevronUp : faChevronDown} className="h-3 w-3 mr-1" />
              {showSettings ? 'Hide' : 'Show'}
            </button>
          </div>
        </CardHeader>

        {showSettings && (
          <CardContent className="pt-0 space-y-5">
            {/* Grid Parameters */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Grid Parameters</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Slider label="Spacing" value={config.spacingPct}
                  onChange={v => { setConfig(c => ({...c, spacingPct: v})); saveConfig({spacingPct: v}); }}
                  min={0.1} max={2.0} step={0.05} unit="%" colorClass="text-cyan-400" />
                <Slider label="Grid Levels" value={config.gridLevels}
                  onChange={v => { setConfig(c => ({...c, gridLevels: v})); saveConfig({gridLevels: v}); }}
                  min={5} max={30} step={1} colorClass="text-cyan-400" />
                <Slider label="Rebuild Drift" value={config.rebuildDriftPct}
                  onChange={v => { setConfig(c => ({...c, rebuildDriftPct: v})); saveConfig({rebuildDriftPct: v}); }}
                  min={0.5} max={5.0} step={0.5} unit="%" />
              </div>
            </div>

            {/* Position Sizing */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Position Sizing</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Slider label="Size per Level" value={config.positionSizeUsd}
                  onChange={v => { setConfig(c => ({...c, positionSizeUsd: v})); saveConfig({positionSizeUsd: v}); }}
                  min={10} max={200} step={10} unit="$" />
                <Slider label="Leverage" value={config.leverage}
                  onChange={v => { setConfig(c => ({...c, leverage: v})); saveConfig({leverage: v}); }}
                  min={1} max={20} step={1} unit="x" colorClass={config.leverage <= 5 ? 'text-emerald-400' : config.leverage <= 10 ? 'text-amber-400' : 'text-red-400'} />
                <Slider label="Max Open/Pair" value={config.maxOpenPerPair}
                  onChange={v => { setConfig(c => ({...c, maxOpenPerPair: v})); saveConfig({maxOpenPerPair: v}); }}
                  min={1} max={10} step={1} />
              </div>
            </div>

            {/* Fee Profitability */}
            <div className={cn('px-3 py-2 rounded-lg border text-xs font-mono',
              isProfitable ? 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400' : 'bg-red-500/[0.06] border-red-500/20 text-red-400')}>
              <FontAwesomeIcon icon={faCoins} className="h-3 w-3 mr-2" />
              Notional: ${notional} | Gross TP: ${grossTpProfit.toFixed(2)} | Fees: ${fees.toFixed(2)} | 
              Net: ${netTpProfit.toFixed(2)} per trade |
              {isProfitable ? ' ✓ Profitable' : ' ✗ NOT profitable — widen spacing'}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
