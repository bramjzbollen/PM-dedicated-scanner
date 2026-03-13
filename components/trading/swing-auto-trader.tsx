'use client';

/**
 * SwingAutoTrader â€” Full-featured 15m swing auto-trading component
 * 
 * Features:
 * - Scanner settings panel (collapsible) with swing indicator toggles & parameter sliders
 *   Indicators: EMA Trend (20/50/200), RSI (14), MACD (12,26,9), Volume
 * - Leverage slider (1x-20x) with progressive risk warnings
 * - Multi-TP partial close: TP1 3% (close 50%, SLâ†’breakeven), TP2 6% (close 25%), remaining trails
 * - Stats dashboard (wallet, P&L, win rate, trades, best/worst, avg duration)
 * - Auto-trading controls (start/stop, close all, reset)
 * - Open positions table (max 10, sortable, manual close, partial close status)
 * - Signal queue (max 5) with manual entry
 * - Real-time updates every 15s via /api/swing-scanner
 * - No position timeout (positions can run indefinitely)
 * - LocalStorage keys: swing-*
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faStop, faXmark, faRotateRight,
  faGear, faChevronDown, faChevronUp,
  faBolt, faLayerGroup, faList,
  faArrowTrendUp, faArrowTrendDown,
  faClock, faTriangleExclamation,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';
import { cn } from '@/lib/utils';
import { useTradingEngine } from '@/lib/use-trading-engine';
import { compactPairLabel, normalizeSignal, symbolKey } from '@/lib/normalize-signal';
import {
  DEFAULT_SWING_CONFIG, DEFAULT_SWING_PARAMS, DEFAULT_SWING_ENABLED_INDICATORS,
  formatDuration, INITIAL_WALLET, QUEUE_EXPIRY_MS,
  calcPnl, calcPartialPnl, getPositionStatus,
  type SwingParams, type SwingEnabledIndicators,
} from '@/lib/trading-engine';
import { StatsDashboard } from './shared/stats-dashboard';
import { AutoTradeControls } from './shared/auto-trade-controls';

// Accent color for swing = amber/orange theme
const ACCENT = 'amber';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function SwingAutoTrader() {
  const engine = useTradingEngine('swing');
  const [showSettings, setShowSettings] = useState(false);
  const [sortBy, setSortBy] = useState<'pnl' | 'duration' | 'symbol'>('pnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showHistory, setShowHistory] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...engine.positions].sort((a, b) => {
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
  }, [engine.positions, sortBy, sortDir]);

  // Filtered signals for queue display
  const filteredSignals = useMemo(() => {
    const activeSymbols = new Set([
      ...engine.positions.map(p => p.symbol),
      ...engine.queue.map(q => q.symbol),
    ]);
    return engine.latestSignals
      .filter(sig => {
        const key = symbolKey(sig);
        return (
          sig.signal !== 'NEUTRAL' &&
          key !== 'â€”' &&
          sig.confidence >= engine.config.minConfidence &&
            !activeSymbols.has(key) &&
            (sig.price > 0 || sig.indicators?.price > 0) /* price > 0 filter */
        );
      })
      .slice(0, 10);
  }, [engine.latestSignals, engine.positions, engine.queue, engine.config.minConfidence]);

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
      {/* â”€â”€ Scanner Settings Panel (collapsible) â”€â”€ */}
      <SwingScannerSettingsPanel
        show={showSettings}
        onToggle={() => setShowSettings(!showSettings)}
        params={engine.swingParams}
        enabled={engine.swingEnabledIndicators}
        config={engine.config}
        onUpdateParam={(key, value) => engine.updateSwingParams({ [key]: value })}
        onToggleIndicator={engine.toggleSwingIndicator}
        onUpdateConfig={engine.updateConfig}
        onReset={() => {
          engine.resetScannerSettings();
          engine.updateConfig({
            leverage: DEFAULT_SWING_CONFIG.leverage,
            stopLossPercent: DEFAULT_SWING_CONFIG.stopLossPercent,
            takeProfitPercent: DEFAULT_SWING_CONFIG.takeProfitPercent,
            takeProfit2Percent: DEFAULT_SWING_CONFIG.takeProfit2Percent,
            trailingStopPercent: DEFAULT_SWING_CONFIG.trailingStopPercent,
            trailingActivationPercent: DEFAULT_SWING_CONFIG.trailingActivationPercent,
            partialClosePercent1: DEFAULT_SWING_CONFIG.partialClosePercent1,
            partialClosePercent2: DEFAULT_SWING_CONFIG.partialClosePercent2,
          });
        }}
      />

      {/* â”€â”€ Stats Dashboard â”€â”€ */}
      <StatsDashboard
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
        color="amber"
      />

      {/* â”€â”€ Auto-Trading Controls â”€â”€ */}
      <AutoTradeControls
        mode="swing"
        isRunning={engine.isRunning}
        positionCount={engine.positions.length}
        config={engine.config}
        confirmReset={confirmReset}
        confirmCloseAll={confirmCloseAll}
        onStart={() => engine.setIsRunning(true)}
        onStop={() => engine.setIsRunning(false)}
        onCloseAll={() => { engine.closeAll(); setConfirmCloseAll(false); }}
        onReset={() => { engine.resetWallet(); setConfirmReset(false); }}
        onConfirmCloseAll={setConfirmCloseAll}
        onConfirmReset={setConfirmReset}
        onUpdateConfig={engine.updateConfig}
      />

      {/* â”€â”€ Open Positions Table â”€â”€ */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-amber-400" />
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
                      ? 'bg-amber-500/15 text-amber-400'
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
                <SwingPositionRow
                  key={pos.id}
                  position={pos}
                  onClose={engine.manualClose}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* â”€â”€ Queue Display â”€â”€ */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faList} className="h-4 w-4 text-amber-400" />
            Queue
            <Badge variant="secondary" className="ml-2 text-xs">
              {engine.queue.length}/5
            </Badge>
            <span className="text-[9px] text-white/25 font-normal ml-1" title="Signals that passed filters but couldn't enter because max positions was reached. They auto-fill when a slot opens (FIFO, 5min expiry).">
              â„¹ï¸ waiting for slot
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {engine.queue.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-white/20 text-sm">
              <FontAwesomeIcon icon={faList} className="h-4 w-4 mr-2" />
              Queue is empty
            </div>
          ) : (
            <div className="space-y-1.5">
              {engine.queue.map((item, idx) => {
                const age = Date.now() - new Date(item.queuedAt).getTime();
                const remaining = QUEUE_EXPIRY_MS - age;
                const isExpiring = remaining < 60000;
                const isLong = item.direction === 'LONG';

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg',
                      'bg-white/[0.02] border border-white/[0.04]',
                      isExpiring && 'border-amber-500/20 bg-amber-500/[0.03]',
                    )}
                  >
                    <span className="text-[10px] text-white/20 font-mono w-5">#{idx + 1}</span>
                    <span className={cn(
                      'text-xs font-bold px-1.5 py-0.5 rounded',
                      isLong ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10',
                    )}>
                      <FontAwesomeIcon icon={isLong ? faArrowTrendUp : faArrowTrendDown} className="h-2.5 w-2.5 mr-1" />
                      {item.direction}
                    </span>
                    <span className="text-sm font-medium text-white/80">{item.symbol}</span>
                    <span className={cn(
                      'text-[10px] font-mono px-1.5 py-0.5 rounded',
                      item.confidence >= 80 ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10',
                    )}>
                      {item.confidence}%
                    </span>
                    <span className="text-[10px] font-mono text-white/30">
                      ${item.price.toFixed(item.price < 1 ? 6 : 2)}
                    </span>
                    <button
                      onClick={() => engine.manualEntryFromQueue(item.id)}
                      disabled={engine.positions.length >= engine.config.maxPositions}
                      className={cn(
                        'ml-auto px-2 py-1 rounded text-[10px] font-medium transition-all',
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20',
                        engine.positions.length >= engine.config.maxPositions && 'opacity-30 cursor-not-allowed',
                      )}
                      title="Open position manually"
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5 mr-1" />
                      Enter
                    </button>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faClock} className={cn('h-2.5 w-2.5', isExpiring ? 'text-amber-400' : 'text-white/30')} />
                      <span className={cn('text-[10px] font-mono', isExpiring ? 'text-amber-400' : 'text-white/30')}>
                        {remaining > 0 ? formatDuration(remaining) : 'expiring...'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* â”€â”€ Pending Signals â”€â”€ */}
      {filteredSignals.length > 0 && (
        <Card className="hover:-translate-y-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FontAwesomeIcon icon={faBolt} className="h-4 w-4 text-amber-400" />
              Pending Signals
              <Badge variant="secondary" className="ml-2 text-xs">
                {filteredSignals.length}
              </Badge>
              <span className="text-[9px] text-white/25 font-normal ml-1" title="Fresh scanner signals that meet min confidence but are NOT yet queued or entered. Click Enter to manually open a position.">
                â„¹ï¸ available to enter
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {filteredSignals.map((sig, index) => {
                const normalized = normalizeSignal(sig);
                const signal = normalized.signal;
                const pair = compactPairLabel(normalized);
                const pairKey = symbolKey(normalized);
                const isLong = signal === 'LONG';
                return (
                  <div
                    key={`${pairKey}-${index}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all"
                  >
                    <span className={cn(
                      'text-xs font-bold px-1.5 py-0.5 rounded',
                      signal === 'LONG'
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : signal === 'SHORT'
                        ? 'text-red-400 bg-red-500/10'
                        : 'text-white/60 bg-white/10',
                    )}>
                      <FontAwesomeIcon icon={signal === 'LONG' ? faArrowTrendUp : signal === 'SHORT' ? faArrowTrendDown : faClock} className="h-2.5 w-2.5 mr-1" />
                      {signal || 'NEUTRAL'}
                    </span>
                    <span className="text-sm font-semibold text-white/80 min-w-[80px]">
                      {pair}
                    </span>
                    <span className={cn(
                      'text-[10px] font-mono px-1.5 py-0.5 rounded',
                      normalized.confidence >= 80 ? 'text-emerald-400 bg-emerald-500/10'
                        : normalized.confidence >= 70 ? 'text-amber-400 bg-amber-500/10'
                        : 'text-white/40 bg-white/5',
                    )}>
                      {normalized.confidence}%
                    </span>
                    <span className="text-[10px] font-mono text-white/40">
                      ${normalized.price.toFixed(normalized.price < 1 ? 6 : 2)}
                    </span>
                    {/* Swing indicator chips */}
                    <div className="hidden md:flex gap-1.5 flex-1">
                      {(sig.indicators as any).rsi != null && (
                        <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          RSI: {((sig.indicators as any).rsi as number).toFixed(1)}
                        </span>
                      )}
                      {(sig.indicators as any).macdHistogram != null && (
                        <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          MACD: {((sig.indicators as any).macdHistogram as number).toFixed(4)}
                        </span>
                      )}
                      {(sig.indicators as any).emaTrend != null && (
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded',
                          (sig.indicators as any).emaTrend === 'bullish' ? 'text-emerald-400/60 bg-emerald-500/[0.06]'
                            : (sig.indicators as any).emaTrend === 'bearish' ? 'text-red-400/60 bg-red-500/[0.06]'
                            : 'text-white/30 bg-white/[0.04]',
                        )}>
                          EMA: {(sig.indicators as any).emaTrend}
                        </span>
                      )}
                      {(sig.indicators as any).volumeRatio != null && (
                        <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          Vol: {((sig.indicators as any).volumeRatio as number).toFixed(1)}x
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => engine.manualEntryFromSignal(sig)}
                      disabled={engine.positions.length >= engine.config.maxPositions}
                      className={cn(
                        'ml-auto px-2 py-1 rounded text-[10px] font-medium transition-all',
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20',
                        engine.positions.length >= engine.config.maxPositions && 'opacity-30 cursor-not-allowed',
                      )}
                      title="Open position manually"
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5 mr-1" />
                      Enter
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trade History (collapsible) */}
      {engine.closedPositions.length > 0 && (
        <Card className="hover:-translate-y-0">
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
            <CardTitle className="text-base flex items-center gap-2 text-white/60">
              <FontAwesomeIcon icon={faList} className="h-4 w-4" />
              Trade History
              <Badge variant="secondary" className="ml-2 text-xs">{engine.closedPositions.length}</Badge>
              <span className="text-[9px] text-white/25 ml-1">W: {engine.stats.winCount} / L: {engine.stats.lossCount}</span>
              <FontAwesomeIcon icon={showHistory ? faChevronUp : faChevronDown} className="h-3 w-3 ml-auto text-white/30" />
            </CardTitle>
          </CardHeader>
          {showHistory && (
            <CardContent>
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                {engine.closedPositions.map(pos => {
                  const isWin = (pos.pnl || 0) > 0;
                  return (
                    <div key={pos.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/[0.02] text-xs">
                      <span className={pos.direction === 'LONG' ? 'text-emerald-400/60 font-bold' : 'text-red-400/60 font-bold'}>{pos.direction}</span>
                      <span className="text-white/60 min-w-[80px]">{pos.symbol}</span>
                      <span className={(isWin ? 'text-emerald-400' : 'text-red-400') + ' font-mono font-bold'}>{isWin ? '+' : ''}{(pos.pnl || 0).toFixed(2)}$</span>
                      <span className="text-white/30">{pos.closeReason?.toUpperCase()}</span>
                      <span className="text-white/20 ml-auto">{pos.closedAt ? new Date(pos.closedAt).toLocaleTimeString() : ''}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* â”€â”€ Footer â”€â”€ */}
      {engine.lastUpdate && (
        <div className="text-[10px] text-white/20 text-center">
          Last tick: {new Date(engine.lastUpdate).toLocaleTimeString()} â€¢
          Engine: {engine.isRunning ? 'ðŸŸ¢ Running' : 'âš« Stopped'} â€¢
          Interval: 15s â€¢
          Leverage: {engine.config.leverage}x â€¢
          No timeout
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Swing Scanner Settings Panel (collapsible)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SwingScannerSettingsPanel({
  show, onToggle,
  params, enabled, config,
  onUpdateParam, onToggleIndicator, onUpdateConfig, onReset,
}: {
  show: boolean;
  onToggle: () => void;
  params: SwingParams;
  enabled: SwingEnabledIndicators;
  config: {
    leverage: number;
    positionSize?: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    takeProfit2Percent?: number;
    trailingStopPercent: number;
    trailingActivationPercent: number;
    partialClosePercent1?: number;
    partialClosePercent2?: number;
  };
  onUpdateParam: (key: keyof SwingParams, value: number) => void;
  onToggleIndicator: (key: keyof SwingEnabledIndicators) => void;
  onUpdateConfig: (updates: Record<string, unknown>) => void;
  onReset: () => void;
}) {
  const activeCount = Object.values(enabled).filter(Boolean).length;
  const leverageColor = getSwingLeverageColor(config.leverage);
  const leverageWarning = getSwingLeverageWarning(config.leverage, config.positionSize ?? 100);
  const posSize = 100; // $100 position size for swing

  return (
    <Card className="hover:-translate-y-0 border-amber-500/[0.1]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="p-1.5 rounded-xl bg-amber-500/[0.1]">
              <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <span>Scanner Settings</span>
            <Badge variant="outline" className="text-[10px] text-amber-400/60 border-amber-500/20">
              15m Timeframe
            </Badge>
            <span className="text-[10px] text-white/25">
              {activeCount}/4 indicators
            </span>
          </CardTitle>
          <button
            onClick={onToggle}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              show
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                : 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.06]',
            )}
          >
            <FontAwesomeIcon icon={show ? faChevronUp : faChevronDown} className="h-3 w-3" />
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </CardHeader>

      {show && (
        <CardContent className="pt-0 space-y-5">
          {/* â”€â”€ Indicator Toggles â”€â”€ */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Active Indicators</p>
            <div className="flex flex-wrap gap-3">
              <SwingIndicatorToggle label="EMA Trend (20/50/200)" enabled={enabled.emaTrend} onChange={() => onToggleIndicator('emaTrend')} color="amber" />
              <SwingIndicatorToggle label="RSI (14)" enabled={enabled.rsi} onChange={() => onToggleIndicator('rsi')} color="violet" />
              <SwingIndicatorToggle label="MACD (12,26,9)" enabled={enabled.macd} onChange={() => onToggleIndicator('macd')} color="blue" />
              <SwingIndicatorToggle label="Volume" enabled={enabled.volume} onChange={() => onToggleIndicator('volume')} color="cyan" />
            </div>
          </div>

          {/* â”€â”€ Parameter Sliders (only for enabled indicators) â”€â”€ */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Parameters</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {enabled.emaTrend && (
                <>
                  <SwingParamSlider label="EMA Fast" value={params.emaFast} onChange={v => onUpdateParam('emaFast', v)} min={5} max={50} step={1} />
                  <SwingParamSlider label="EMA Medium" value={params.emaMedium} onChange={v => onUpdateParam('emaMedium', v)} min={20} max={100} step={5} />
                  <SwingParamSlider label="EMA Slow" value={params.emaSlow} onChange={v => onUpdateParam('emaSlow', v)} min={100} max={500} step={10} />
                </>
              )}
              {enabled.rsi && (
                <>
                  <SwingParamSlider label="RSI Period" value={params.rsiPeriod} onChange={v => onUpdateParam('rsiPeriod', v)} min={5} max={30} step={1} />
                  <SwingParamSlider label="RSI Overbought" value={params.rsiOverbought} onChange={v => onUpdateParam('rsiOverbought', v)} min={60} max={90} step={5} />
                  <SwingParamSlider label="RSI Oversold" value={params.rsiOversold} onChange={v => onUpdateParam('rsiOversold', v)} min={10} max={40} step={5} />
                </>
              )}
              {enabled.macd && (
                <>
                  <SwingParamSlider label="MACD Fast" value={params.macdFast} onChange={v => onUpdateParam('macdFast', v)} min={5} max={20} step={1} />
                  <SwingParamSlider label="MACD Slow" value={params.macdSlow} onChange={v => onUpdateParam('macdSlow', v)} min={15} max={50} step={1} />
                  <SwingParamSlider label="MACD Signal" value={params.macdSignal} onChange={v => onUpdateParam('macdSignal', v)} min={3} max={15} step={1} />
                </>
              )}
              {enabled.volume && (
                <SwingParamSlider label="Volume SMA" value={params.volumeSMA} onChange={v => onUpdateParam('volumeSMA', v)} min={5} max={50} step={1} />
              )}
            </div>
          </div>

          {/* â”€â”€ Risk Management: Position Size + Leverage + SL/TP/Trail â”€â”€ */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
              ðŸ’° Risk Management
            </p>
            <div className="space-y-4">
              {/* Position Size slider */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Position Size (Base)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-amber-400">
                      ${config.positionSize}
                    </span>
                    <span className="text-[10px] text-white/30">
                      per trade
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={25}
                  max={500}
                  step={25}
                  value={config.positionSize ?? 100}
                  onChange={e => onUpdateConfig({ positionSize: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-amber-600/20 via-amber-500/40 to-amber-400/60"
                />
                <div className="flex items-center justify-between mt-1.5 text-[9px] text-white/20">
                  <span>$25</span>
                  <span>Conservative â†â†’ Aggressive</span>
                  <span>$500</span>
                </div>
              </div>

              {/* Leverage slider (1x-20x for swing) */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Leverage</label>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-lg font-bold font-mono', leverageColor)}>
                      {config.leverage}x
                    </span>
                    <span className="text-[10px] text-white/30">
                      ${posSize} â†’ ${(posSize * config.leverage).toLocaleString()} exposure
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={config.leverage}
                  onChange={(e) => onUpdateConfig({ leverage: parseInt(e.target.value) })}
                  className={cn(
                    'w-full h-2 rounded-full appearance-none cursor-pointer',
                    'bg-gradient-to-r from-emerald-500/30 via-amber-500/30 to-orange-500/30',
                    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full',
                    config.leverage <= 3
                      ? '[&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                      : config.leverage <= 10
                      ? '[&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                      : '[&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(251,146,60,0.5)]',
                  )}
                />
                <div className="flex justify-between text-[9px] text-white/20 mt-1">
                  <span>1x</span>
                  <span>5x</span>
                  <span>10x</span>
                  <span>15x</span>
                  <span>20x</span>
                </div>
                {leverageWarning && (
                  <div className={cn(
                    'mt-2 px-3 py-2 rounded-lg text-[10px] flex items-center gap-2',
                    config.leverage > 15
                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      : config.leverage > 5
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                  )}>
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                    {leverageWarning}
                  </div>
                )}
              </div>

              {/* Max Positions slider */}<div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"><div className="flex items-center justify-between mb-2"><label className="text-xs font-medium text-white/70">Max Open Positions</label><div className="flex items-center gap-2"><span className="text-lg font-bold font-mono text-violet-400">{config.maxPositions}</span><span className="text-[10px] text-white/30">slots</span></div></div><input type="range" min={1} max={20} step={1} value={config.maxPositions} onChange={e => onUpdateConfig({ maxPositions: Number(e.target.value) })} className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-violet-600/20 via-violet-500/40 to-violet-400/60" /><div className="flex items-center justify-between mt-1.5 text-[9px] text-white/20"><span>1</span><span>20</span></div></div>{/* SL/TP1/TP2/Trailing sliders */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <SwingParamSlider
                  label="Stop Loss %"
                  value={config.stopLossPercent}
                  onChange={v => onUpdateConfig({ stopLossPercent: v })}
                  min={0.5} max={5} step={0.5}
                  colorClass="text-red-400"
                />
                <SwingParamSlider
                  label="TP1 % (close 50%)"
                  value={config.takeProfitPercent}
                  onChange={v => onUpdateConfig({ takeProfitPercent: v })}
                  min={1} max={10} step={0.5}
                  colorClass="text-emerald-400"
                />
                <SwingParamSlider
                  label="TP2 % (close 25%)"
                  value={config.takeProfit2Percent || 6}
                  onChange={v => onUpdateConfig({ takeProfit2Percent: v })}
                  min={2} max={15} step={0.5}
                  colorClass="text-emerald-400"
                />
                <SwingParamSlider
                  label="Trailing Stop %"
                  value={config.trailingStopPercent}
                  onChange={v => onUpdateConfig({ trailingStopPercent: v })}
                  min={0.5} max={5} step={0.5}
                  colorClass="text-amber-400"
                />
                <SwingParamSlider
                  label="TP1 Close %"
                  value={config.partialClosePercent1 || 50}
                  onChange={v => onUpdateConfig({ partialClosePercent1: v })}
                  min={10} max={80} step={5}
                  colorClass="text-cyan-400"
                />
                <SwingParamSlider
                  label="TP2 Close %"
                  value={config.partialClosePercent2 || 25}
                  onChange={v => onUpdateConfig({ partialClosePercent2: v })}
                  min={10} max={50} step={5}
                  colorClass="text-cyan-400"
                />
              </div>

              {/* Partial close logic summary */}
              <div className="p-3 rounded-xl bg-amber-500/[0.03] border border-amber-500/[0.08]">
                <p className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-2">ðŸ“Š Partial Close Logic</p>
                <div className="space-y-1 text-xs text-white/50">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-mono">TP1 +{config.takeProfitPercent}%:</span>
                    <span>Close {config.partialClosePercent1 || 50}% â†’ Move SL to breakeven</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-mono">TP2 +{config.takeProfit2Percent || 6}%:</span>
                    <span>Close {config.partialClosePercent2 || 25}% more â†’ Activate trailing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-mono">Remaining {100 - (config.partialClosePercent1 || 50) - (config.partialClosePercent2 || 25)}%:</span>
                    <span>Rides with {config.trailingStopPercent}% trailing stop</span>
                  </div>
                </div>
              </div>

              {/* Risk summary */}
              <div className="flex flex-wrap gap-4 text-xs text-white/50">
                <span>ðŸ›‘ SL: <span className="text-red-400 font-mono">{config.stopLossPercent ?? 0}%</span>
                  <span className="text-white/20 ml-1">(${((posSize * (config.leverage ?? 1) * (config.stopLossPercent ?? 0) / 100) || 0).toFixed(2)} max loss)</span>
                </span>
                <span>ðŸŽ¯ TP1: <span className="text-emerald-400 font-mono">{config.takeProfitPercent ?? 0}%</span>
                  <span className="text-white/20 ml-1">(${((posSize * (config.leverage ?? 1) * (config.takeProfitPercent ?? 0) / 100 * (config.partialClosePercent1 || 50) / 100) || 0).toFixed(2)})</span>
                </span>
                <span>ðŸŽ¯ TP2: <span className="text-emerald-400 font-mono">{config.takeProfit2Percent || 6}%</span>
                  <span className="text-white/20 ml-1">(${((posSize * (config.leverage ?? 1) * (config.takeProfit2Percent || 6) / 100 * (config.partialClosePercent2 || 25) / 100) || 0).toFixed(2)})</span>
                </span>
                <span>ðŸ“ Trail: <span className="text-amber-400 font-mono">{config.trailingStopPercent ?? 0}%</span></span>
              </div>
            </div>
          </div>

          {/* â”€â”€ Reset Button â”€â”€ */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
            <button
              onClick={onReset}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all text-xs"
            >
              <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />
              Reset to defaults
            </button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Swing Controls Bar
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SwingControlsBar({
  isRunning, positionCount, config,
  confirmReset, confirmCloseAll,
  onStart, onStop, onCloseAll, onReset,
  onConfirmCloseAll, onConfirmReset, onUpdateConfig,
}: {
  isRunning: boolean;
  positionCount: number;
  config: { minConfidence: number; autoEntry: boolean; queueEnabled: boolean; maxPositions: number };
  confirmReset: boolean;
  confirmCloseAll: boolean;
  onStart: () => void;
  onStop: () => void;
  onCloseAll: () => void;
  onReset: () => void;
  onConfirmCloseAll: (v: boolean) => void;
  onConfirmReset: (v: boolean) => void;
  onUpdateConfig: (updates: Record<string, unknown>) => void;
}) {
  return (
    <Card className="hover:-translate-y-0">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Engine Start/Stop */}
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={onStop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25"
              >
                <FontAwesomeIcon icon={faStop} className="h-3 w-3" />
                Stop Engine
              </button>
            ) : (
              <button
                onClick={onStart}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25"
              >
                <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                Start Engine
              </button>
            )}
            {isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <PulsingDot status="online" />
                Running
              </div>
            )}
          </div>

          {/* Min Confidence Slider */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider whitespace-nowrap">
              Min Conf: <span className="text-amber-400 font-mono">{config.minConfidence}%</span>
            </label>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={config.minConfidence}
              onChange={e => onUpdateConfig({ minConfidence: parseInt(e.target.value) })}
              className="w-24 h-1.5 rounded-lg appearance-none bg-white/10 accent-amber-500"
            />
          </div>

          {/* Toggles */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoEntry}
              onChange={e => onUpdateConfig({ autoEntry: e.target.checked })}
              className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 accent-amber-500"
            />
            <span className="text-[10px] text-white/50">Auto Entry</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.queueEnabled}
              onChange={e => onUpdateConfig({ queueEnabled: e.target.checked })}
              className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 accent-amber-500"
            />
            <span className="text-[10px] text-white/50">Queue</span>
          </label>

          {/* Emergency controls */}
          <div className="flex items-center gap-2 ml-auto">
            {confirmCloseAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">Close all {positionCount} positions?</span>
                <button onClick={onCloseAll} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30">
                  Confirm
                </button>
                <button onClick={() => onConfirmCloseAll(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 hover:text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onConfirmCloseAll(true)}
                disabled={positionCount === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  'bg-red-500/10 text-red-400/60 border border-red-500/10 hover:bg-red-500/20 hover:text-red-400',
                  positionCount === 0 && 'opacity-30 cursor-not-allowed',
                )}
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                Close All
              </button>
            )}

            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">Reset everything?</span>
                <button onClick={onReset} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30">
                  Confirm
                </button>
                <button onClick={() => onConfirmReset(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 hover:text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onConfirmReset(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/5 text-white/40 border border-white/[0.06] hover:bg-white/10 hover:text-white/60"
              >
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                Reset Wallet
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Swing Position Row (with partial close status)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SwingPositionRow({ position: pos, onClose }: { position: any; onClose: (id: string) => void }) {
  const direction = pos.direction === 'LONG' || pos.direction === 'SHORT' ? pos.direction : 'NEUTRAL';
  const isLong = direction === 'LONG';
  const [priceTick, setPriceTick] = useState<'' | 'up' | 'down'>('');

  useEffect(() => {
    if (pos.previousPrice == null || pos.currentPrice == null) return;
    if (pos.currentPrice > pos.previousPrice) setPriceTick('up');
    else if (pos.currentPrice < pos.previousPrice) setPriceTick('down');
    else return;

    const t = setTimeout(() => setPriceTick(''), 450);
    return () => clearTimeout(t);
  }, [pos.currentPrice, pos.previousPrice]);

  const { pnl, pnlPercent } = calcPnl(pos, pos.currentPrice);
  const totalPnl = pnl + calcPartialPnl(pos);
  const duration = Date.now() - new Date(pos.openedAt).getTime();
  const status = getPositionStatus(pos, pos.currentPrice);
  const pnlColor = (totalPnl ?? 0) > 0 ? 'text-emerald-400' : (totalPnl ?? 0) < 0 ? 'text-red-400' : 'text-white/60';
  const dirColor = direction === 'LONG' ? 'text-emerald-400' : direction === 'SHORT' ? 'text-red-400' : 'text-white/60';
  const dirBg = direction === 'LONG' ? 'bg-emerald-500/10' : direction === 'SHORT' ? 'bg-red-500/10' : 'bg-white/10';

  // Partial close progress
  const hasTP1 = pos.partialCloses?.some((pc: any) => pc.reason === 'tp1');
  const hasTP2 = pos.partialCloses?.some((pc: any) => pc.reason === 'tp2');
  const remainingPct = hasTP2 ? 25 : hasTP1 ? 50 : 100;

  const statusColors: Record<string, string> = {
    'Active': 'text-white/50 bg-white/5',
    'Trailing': 'text-amber-400 bg-amber-500/10',
    'Near TP': 'text-emerald-400 bg-emerald-500/10',
    'Near SL': 'text-red-400 bg-red-500/10',
  };

  return (
    <div className="group relative flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all duration-200">
      {/* Direction */}
      <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold', dirBg, dirColor)}>
        <FontAwesomeIcon icon={direction === 'LONG' ? faArrowTrendUp : direction === 'SHORT' ? faArrowTrendDown : faClock} className="h-3 w-3" />
        {direction}
      </div>
      {/* Symbol */}
      <div className="min-w-[90px]">
        <div className="text-sm font-semibold text-white/90">{pos.symbol ?? 'â€”'}</div>
        <div className="text-[10px] text-white/30 flex items-center gap-1">
          <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" />
          {formatDuration(duration)}
        </div>
      </div>
      {/* Position Size */}
      <div className="min-w-[95px]">
        <div className="text-[10px] text-white/30">Size</div>
        <div className="text-xs font-mono font-bold text-white/90">${(Number(pos.size ?? 0) / Number(pos.leverage ?? 1)).toFixed(2)}</div>
        <div className="text-[9px] text-amber-400/60">{Number(pos.leverage ?? 1)}x leverage</div>
      </div>
      {/* Entry */}
      <div className="hidden sm:block min-w-[90px]">
        <div className="text-[10px] text-white/30">Entry</div>
        <div className="text-xs font-mono text-white/70">${(pos.entryPrice ?? 0).toFixed((pos.entryPrice ?? 0) < 1 ? 6 : 2)}</div>
      </div>
      {/* Current */}
      <div className="hidden sm:block min-w-[90px]">
        <div className="text-[10px] text-white/30">Current</div>
        <div className={cn(
          'text-xs font-mono transition-colors duration-300',
          priceTick === 'up' ? 'text-emerald-300' : priceTick === 'down' ? 'text-red-300' : 'text-white/70'
        )}>${(pos.currentPrice ?? 0).toFixed((pos.currentPrice ?? 0) < 1 ? 6 : 2)}</div>
      </div>
      {/* P&L */}
      <div className="min-w-[110px]">
        <div className={cn('text-base font-bold font-mono', pnlColor)}>
          {(totalPnl ?? 0) > 0 ? '+' : ''}{(totalPnl ?? 0).toFixed(2)}$
        </div>
        <div className={cn('text-xs font-mono font-semibold', pnlColor)}>
          ({(pnlPercent ?? 0) > 0 ? '+' : ''}{(pnlPercent ?? 0).toFixed(2)}%)
        </div>
      </div>
      {/* SL/TP with partial close indicators */}
      <div className="hidden md:block min-w-[100px]">
        <div className="text-[10px] text-red-400/70">
          SL: ${(pos.stopLoss ?? 0).toFixed((pos.stopLoss ?? 0) < 1 ? 6 : 2)}
          {hasTP1 && <span className="text-amber-400/50 ml-1">(BE)</span>}
        </div>
        <div className={cn('text-[10px]', hasTP1 ? 'text-emerald-400/40 line-through' : 'text-emerald-400/70')}>
          TP1: ${(pos.takeProfit ?? 0).toFixed((pos.takeProfit ?? 0) < 1 ? 6 : 2)}
        </div>
        {pos.takeProfit2 && (
          <div className={cn('text-[10px]', hasTP2 ? 'text-emerald-400/40 line-through' : 'text-emerald-400/70')}>
            TP2: ${(pos.takeProfit2 ?? 0).toFixed((pos.takeProfit2 ?? 0) < 1 ? 6 : 2)}
          </div>
        )}
        {pos.trailingStop && (
          <div className="text-[10px] text-amber-400/70">TS: ${(pos.trailingStop ?? 0).toFixed((pos.trailingStop ?? 0) < 1 ? 6 : 2)}</div>
        )}
      </div>
      {/* Partial close progress + Status */}
      <div className="flex flex-col items-end gap-0.5">
        <div className={cn('px-2 py-0.5 rounded text-[10px] font-medium', statusColors[status] || 'text-white/50 bg-white/5')}>
          {status}
        </div>
        <div className="flex items-center gap-1">
          {hasTP1 && <span className="text-[9px] text-emerald-400/60 bg-emerald-500/10 px-1 rounded">TP1 âœ“</span>}
          {hasTP2 && <span className="text-[9px] text-emerald-400/60 bg-emerald-500/10 px-1 rounded">TP2 âœ“</span>}
          <span className="text-[9px] text-white/25">{remainingPct}% open</span>
        </div>
      </div>
      {/* Close */}
      <button
        onClick={() => onClose(pos.id)}
        className="ml-auto p-1.5 rounded-lg opacity-40 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all duration-200"
        title="Close position"
      >
        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shared sub-components
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SwingIndicatorToggle({ label, enabled, onChange, color }: {
  label: string;
  enabled: boolean;
  onChange: () => void;
  color: 'amber' | 'violet' | 'blue' | 'cyan';
}) {
  const colors = {
    amber: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
    violet: { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400' },
    blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
    cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
  };
  const c = colors[color];

  return (
    <label className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all',
      enabled ? `${c.bg} ${c.border}` : 'bg-white/[0.02] border-white/[0.08]'
    )}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={onChange}
        className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
      />
      <span className={cn('text-xs font-medium', enabled ? c.text : 'text-white/40')}>
        {label}
      </span>
    </label>
  );
}

function SwingParamSlider({ label, value, onChange, min, max, step, colorClass }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  colorClass?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-white/40">{label}</label>
        <span className={cn('text-xs font-mono', colorClass || 'text-white/70')}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.1] accent-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(251,191,36,0.5)]"
      />
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Swing Leverage helpers (1x-20x max)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getSwingLeverageColor(leverage: number): string {
  if (leverage <= 3) return 'text-emerald-400';
  if (leverage <= 10) return 'text-amber-400';
  return 'text-orange-400';
}

function getSwingLeverageWarning(leverage: number, positionSize: number = 100): string | null {
  if (leverage > 15) {
    const liqMove = (100 / leverage).toFixed(1);
    return `âš ï¸ HIGH RISK â€” ${leverage}x leverage on swing trades. A ${liqMove}% adverse move = total loss. Max SL loss: $${(positionSize * leverage * 1.5 / 100).toFixed(2)}`;
  }
  if (leverage > 10) {
    return `âš ï¸ Elevated Risk â€” ${leverage}x on swing trades amplifies both gains AND losses. Max SL loss: $${(positionSize * leverage * 1.5 / 100).toFixed(2)}`;
  }
  if (leverage > 5) {
    return `âš ï¸ Moderate Risk â€” ${leverage}x leverage. Max SL loss per trade: $${(positionSize * leverage * 1.5 / 100).toFixed(2)}`;
  }
  return null;
}








