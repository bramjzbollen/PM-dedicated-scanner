'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faStop, faXmark, faRotateRight,
  faGear, faChevronDown, faChevronUp,
  faBolt, faWaveSquare, faList, faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';
import { cn } from '@/lib/utils';
import { useTradingEngine, TradingMode } from '@/lib/use-trading-engine';
import { TradingStatsPanel } from './trading-stats';
import { PositionCard } from './position-card';
import { QueuePanel } from './queue-panel';

interface AutoTraderProps {
  mode: TradingMode;
}

export function AutoTrader({ mode }: AutoTraderProps) {
  const engine = useTradingEngine(mode);
  const [showSettings, setShowSettings] = useState(false);
  const [sortBy, setSortBy] = useState<'pnl' | 'duration' | 'symbol'>('pnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);

  const isSwing = mode === 'swing';
  const color = isSwing ? 'violet' : 'cyan';
  const icon = isSwing ? faWaveSquare : faBolt;
  const title = isSwing ? '15m Swing Auto Trader' : '1m Scalping Auto Trader';

  // Sort positions
  const sortedPositions = [...engine.positions].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'pnl': cmp = a.pnl - b.pnl; break;
      case 'duration':
        cmp = new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
        break;
      case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Dashboard */}
      <TradingStatsPanel
        walletBalance={engine.stats.walletBalance}
        openPnl={engine.openPnl}
        realizedPnl={engine.stats.realizedPnl}
        totalPnl={engine.totalPnl}
        winRate={engine.winRate}
        totalTrades={engine.stats.totalTrades}
        closedCount={engine.stats.closedCount}
        bestTrade={engine.stats.bestTrade}
        worstTrade={engine.stats.worstTrade}
        avgDuration={engine.avgDuration}
        openPositions={engine.positions.length}
        maxPositions={engine.config.maxPositions}
        queueCount={engine.queue.length}
        color={color}
      />

      {/* Controls Bar */}
      <Card className="hover:-translate-y-0">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Engine status & toggle */}
            <div className="flex items-center gap-2">
              {engine.isRunning ? (
                <button
                  onClick={() => engine.setIsRunning(false)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25',
                  )}
                >
                  <FontAwesomeIcon icon={faStop} className="h-3 w-3" />
                  Stop Engine
                </button>
              ) : (
                <button
                  onClick={() => engine.setIsRunning(true)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    `bg-${color}-500/15 text-${color}-400 border border-${color}-500/20 hover:bg-${color}-500/25`,
                  )}
                >
                  <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                  Start Engine
                </button>
              )}

              {engine.isRunning && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <PulsingDot status="online" />
                  Running
                </div>
              )}
            </div>

            {/* Emergency controls */}
            <div className="flex items-center gap-2 ml-auto">
              {confirmCloseAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400">Close all {engine.positions.length} positions?</span>
                  <button
                    onClick={() => { engine.closeAll(); setConfirmCloseAll(false); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmCloseAll(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 hover:text-white/60"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmCloseAll(true)}
                  disabled={engine.positions.length === 0}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    'bg-red-500/10 text-red-400/60 border border-red-500/10 hover:bg-red-500/20 hover:text-red-400',
                    engine.positions.length === 0 && 'opacity-30 cursor-not-allowed',
                  )}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  Close All
                </button>
              )}

              {confirmReset ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400">Reset everything?</span>
                  <button
                    onClick={() => { engine.resetWallet(); setConfirmReset(false); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 hover:text-white/60"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/5 text-white/40 border border-white/[0.06] hover:bg-white/10 hover:text-white/60"
                >
                  <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                  Reset
                </button>
              )}

              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  showSettings
                    ? `bg-${color}-500/15 text-${color}-400 border border-${color}-500/20`
                    : 'bg-white/5 text-white/40 border border-white/[0.06] hover:text-white/60',
                )}
              >
                <FontAwesomeIcon icon={faGear} className="h-3 w-3" />
                Settings
                <FontAwesomeIcon icon={showSettings ? faChevronUp : faChevronDown} className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Auto Entry */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={engine.config.autoEntry}
                  onChange={e => engine.updateConfig({ autoEntry: e.target.checked })}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 accent-cyan-500"
                />
                <span className="text-xs text-white/60">Auto Entry</span>
              </label>

              {/* Queue toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={engine.config.queueEnabled}
                  onChange={e => engine.updateConfig({ queueEnabled: e.target.checked })}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 accent-cyan-500"
                />
                <span className="text-xs text-white/60">Queue Enabled</span>
              </label>

              {/* Min Confidence */}
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                  Min Confidence: {engine.config.minConfidence}%
                </label>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={5}
                  value={engine.config.minConfidence}
                  onChange={e => engine.updateConfig({ minConfidence: parseInt(e.target.value) })}
                  className="w-full h-1.5 rounded-lg appearance-none bg-white/10 accent-cyan-500"
                />
              </div>

              {/* Max Positions */}
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                  Max Positions: {engine.config.maxPositions}
                </label>
                <input
                  type="range"
                  min={1}
                  max={isSwing ? 20 : 100}
                  step={1}
                  value={engine.config.maxPositions}
                  onChange={e => engine.updateConfig({ maxPositions: parseInt(e.target.value) })}
                  className="w-full h-1.5 rounded-lg appearance-none bg-white/10 accent-cyan-500"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Positions */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FontAwesomeIcon icon={faLayerGroup} className={`h-4 w-4 text-${color}-400`} />
              Open Positions
              <Badge variant="secondary" className="ml-2 text-xs">
                {engine.positions.length}/{engine.config.maxPositions}
              </Badge>
            </CardTitle>

            <div className="flex items-center gap-1">
              {(['pnl', 'duration', 'symbol'] as const).map(field => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={cn(
                    'px-2 py-1 rounded text-[10px] font-medium transition-all',
                    sortBy === field
                      ? `bg-${color}-500/15 text-${color}-400`
                      : 'text-white/30 hover:text-white/50',
                  )}
                >
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                  {sortBy === field && (
                    <FontAwesomeIcon
                      icon={sortDir === 'desc' ? faChevronDown : faChevronUp}
                      className="h-2 w-2 ml-1"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sortedPositions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-white/20 text-sm">
              No open positions
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
              {sortedPositions.map(pos => (
                <PositionCard
                  key={pos.id}
                  position={pos}
                  onClose={engine.manualClose}
                  color={color}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faList} className={`h-4 w-4 text-${color}-400`} />
            Queue
            <Badge variant="secondary" className="ml-2 text-xs">
              {engine.queue.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QueuePanel queue={engine.queue} color={color} />
        </CardContent>
      </Card>

      {/* Recent Closed */}
      {engine.closedPositions.length > 0 && (
        <Card className="hover:-translate-y-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-white/60">
              Recent Closes
              <Badge variant="secondary" className="ml-2 text-xs">
                {engine.closedPositions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
              {engine.closedPositions.slice(0, 20).map(pos => {
                const isWin = (pos.pnl || 0) > 0;
                return (
                  <div
                    key={pos.id}
                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/[0.02] text-xs"
                  >
                    <span className={cn(
                      'font-bold',
                      pos.direction === 'LONG' ? 'text-emerald-400/60' : 'text-red-400/60',
                    )}>
                      {pos.direction === 'LONG' ? '🟢' : '🔴'}
                    </span>
                    <span className="text-white/60 min-w-[80px]">{pos.symbol}</span>
                    <span className={cn('font-mono font-bold', isWin ? 'text-emerald-400' : 'text-red-400')}>
                      {isWin ? '+' : ''}{(pos.pnl || 0).toFixed(2)}$
                    </span>
                    <span className="text-white/30 ml-auto">
                      {pos.closeReason?.toUpperCase()}
                    </span>
                    <span className="text-white/20">
                      {pos.closedAt ? new Date(pos.closedAt).toLocaleTimeString() : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last update */}
      {engine.lastUpdate && (
        <div className="text-[10px] text-white/20 text-center">
          Last tick: {new Date(engine.lastUpdate).toLocaleTimeString()} • 
          Engine: {engine.isRunning ? '🟢 Running' : '⚫ Stopped'} •
          Interval: {isSwing ? '15s' : '5s'}
        </div>
      )}
    </div>
  );
}
