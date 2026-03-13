'use client';

/**
 * ScalpingAutoTrader — Full-featured 1m scalping auto-trading component
 * 
 * Features:
 * - Scanner settings panel (collapsible) with indicator toggles & parameter sliders
 * - Leverage slider (1x-100x) with progressive risk warnings
 * - SL/TP/Trailing configuration
 * - Stats dashboard (wallet, P&L, win rate, trades, best/worst, avg duration)
 * - Auto-trading controls (start/stop, close all, reset)
 * - Open positions table (max 50, sortable, manual close)
 * - Signal queue with manual entry
 * - Real-time updates every 5s
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
  DEFAULT_SCALPING_CONFIG, DEFAULT_SCALP_PARAMS, DEFAULT_ENABLED_INDICATORS,
  formatDuration, INITIAL_WALLET, QUEUE_EXPIRY_MS,
  calcPnl, calcPartialPnl, getPositionStatus,
  type ScalpParams, type EnabledIndicators,
} from '@/lib/trading-engine';
import { StatsDashboard } from './shared/stats-dashboard';
import { AutoTradeControls } from './shared/auto-trade-controls';

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
export function ScalpingAutoTrader() {
  const engine = useTradingEngine('scalping');
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

  // Filtered signals for queue display (non-neutral, above confidence, not already in positions/queue)
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
          key !== '—' &&
          sig.confidence >= engine.config.minConfidence &&
          !activeSymbols.has(key) &&
          (sig.price > 0 || (sig.indicators?.price ?? 0) > 0)
        );
      })
      .slice(0, 20);
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
      {/* ── Scanner Settings Panel (collapsible) ── */}
      <ScannerSettingsPanel
        show={showSettings}
        onToggle={() => setShowSettings(!showSettings)}
        params={engine.scalpParams}
        enabled={engine.enabledIndicators}
        config={engine.config}
        onUpdateParam={(key, value) => engine.updateScalpParams({ [key]: value })}
        onToggleIndicator={engine.toggleIndicator}
        onUpdateConfig={engine.updateConfig}
        onReset={() => {
          engine.resetScannerSettings();
          engine.updateConfig({
            leverage: DEFAULT_SCALPING_CONFIG.leverage,
            stopLossPercent: DEFAULT_SCALPING_CONFIG.stopLossPercent,
            takeProfitPercent: DEFAULT_SCALPING_CONFIG.takeProfitPercent,
            trailingStopPercent: DEFAULT_SCALPING_CONFIG.trailingStopPercent,
            trailingActivationPercent: DEFAULT_SCALPING_CONFIG.trailingActivationPercent,
          });
        }}
      />

      {/* ── Stats Dashboard ── */}
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
        color="cyan"
      />

      {/* ── Auto-Trading Controls ── */}
      <AutoTradeControls
        mode="scalping"
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

      {/* ── Open Positions Table ── */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-cyan-400" />
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
                      ? 'bg-cyan-500/15 text-cyan-400'
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
                <PositionRow
                  key={pos.id}
                  position={pos}
                  onClose={engine.manualClose}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Queue Display ── */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faList} className="h-4 w-4 text-cyan-400" />
            Queue
            <Badge variant="secondary" className="ml-2 text-xs">
              {engine.queue.length}
            </Badge>
            <span className="text-[9px] text-white/25 font-normal ml-1" title="Signals that passed filters but couldn't enter because max positions was reached. They auto-fill when a slot opens (FIFO, 5min expiry).">
              ℹ️ waiting for slot
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
                    {/* Manual entry button */}
                    <button
                      onClick={() => engine.manualEntryFromQueue(item.id)}
                      disabled={engine.positions.length >= engine.config.maxPositions}
                      className={cn(
                        'ml-auto px-2 py-1 rounded text-[10px] font-medium transition-all',
                        'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20',
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

      {/* ── Pending Signals (manual entry candidates) ── */}
      {filteredSignals.length > 0 && (
        <Card className="hover:-translate-y-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FontAwesomeIcon icon={faBolt} className="h-4 w-4 text-cyan-400" />
              Pending Signals
              <Badge variant="secondary" className="ml-2 text-xs">
                {filteredSignals.length}
              </Badge>
              <span className="text-[9px] text-white/25 font-normal ml-1" title="Fresh scanner signals that meet min confidence but are NOT yet queued or entered. Click Enter to manually open a position.">
                ℹ️ available to enter
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
                    {/* Indicator chips */}
                    <div className="hidden md:flex gap-1.5 flex-1">
                      {(sig.indicators as any).stochRsiK != null && (
                        <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          StochK: {((sig.indicators as any).stochRsiK as number).toFixed(1)}
                        </span>
                      )}
                      {(sig.indicators as any).volumeRatio != null && (
                        <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          Vol: {((sig.indicators as any).volumeRatio as number).toFixed(1)}x
                        </span>
                      )}
                      {(sig.indicators as any).atrPercent != null && (
                        <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          ATR: {((sig.indicators as any).atrPercent as number).toFixed(2)}%
                        </span>
                      )}
                    </div>
                    {/* Manual entry button */}
                    <button
                      onClick={() => engine.manualEntryFromSignal(sig)}
                      disabled={engine.positions.length >= engine.config.maxPositions}
                      className={cn(
                        'ml-auto px-2 py-1 rounded text-[10px] font-medium transition-all',
                        'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20',
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

      {/* ── Footer ── */}
      {engine.lastUpdate && (
        <div className="text-[10px] text-white/20 text-center">
          Last tick: {new Date(engine.lastUpdate).toLocaleTimeString()} •
          Engine: {engine.isRunning ? '🟢 Running' : '⚫ Stopped'} •
          Interval: 5s •
          Leverage: {engine.config.leverage}x
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Scanner Settings Panel (collapsible)
// ──────────────────────────────────────────────
function ScannerSettingsPanel({
  show, onToggle,
  params, enabled, config,
  onUpdateParam, onToggleIndicator, onUpdateConfig, onReset,
}: {
  show: boolean;
  onToggle: () => void;
  params: ScalpParams;
  enabled: EnabledIndicators;
  config: { leverage: number; positionSize?: number; stopLossPercent: number; takeProfitPercent: number; trailingStopPercent: number; trailingActivationPercent: number };
  onUpdateParam: (key: keyof ScalpParams, value: number) => void;
  onToggleIndicator: (key: keyof EnabledIndicators) => void;
  onUpdateConfig: (updates: Record<string, unknown>) => void;
  onReset: () => void;
}) {
  const activeCount = Object.values(enabled).filter(Boolean).length;
  const leverageColor = getLeverageColor(config.leverage);
  const leverageWarning = getLeverageWarning(config.leverage, config.positionSize ?? 20);

  return (
    <Card className="hover:-translate-y-0 border-cyan-500/[0.1]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="p-1.5 rounded-xl bg-cyan-500/[0.1]">
              <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <span>Scanner Settings</span>
            <Badge variant="outline" className="text-[10px] text-cyan-400/60 border-cyan-500/20">
              1m Timeframe
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
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
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
          {/* ── Indicator Toggles ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Active Indicators</p>
            <div className="flex flex-wrap gap-3">
              <IndicatorToggle label="Stochastic RSI" enabled={enabled.stochRsi} onChange={() => onToggleIndicator('stochRsi')} color="emerald" />
              <IndicatorToggle label="Bollinger Bands" enabled={enabled.bb} onChange={() => onToggleIndicator('bb')} color="blue" />
              <IndicatorToggle label="Volume Spike" enabled={enabled.volume} onChange={() => onToggleIndicator('volume')} color="cyan" />
              <IndicatorToggle label="ATR Filter" enabled={enabled.atr} onChange={() => onToggleIndicator('atr')} color="violet" />
            </div>
          </div>

          {/* ── Parameter Sliders (only for enabled indicators) ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Parameters</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {enabled.stochRsi && (
                <>
                  <ParamSlider label="Stoch RSI Period" value={params.stochRsiPeriod} onChange={v => onUpdateParam('stochRsiPeriod', v)} min={2} max={30} step={1} />
                  <ParamSlider label="Stoch Period" value={params.stochRsiStochPeriod} onChange={v => onUpdateParam('stochRsiStochPeriod', v)} min={5} max={30} step={1} />
                  <ParamSlider label="%K Smoothing" value={params.stochRsiKSmoothing} onChange={v => onUpdateParam('stochRsiKSmoothing', v)} min={1} max={10} step={1} />
                  <ParamSlider label="%D Smoothing" value={params.stochRsiDSmoothing} onChange={v => onUpdateParam('stochRsiDSmoothing', v)} min={1} max={10} step={1} />
                  <ParamSlider label="Bottom Threshold" value={params.stochRsiBottomThreshold} onChange={v => onUpdateParam('stochRsiBottomThreshold', v)} min={5} max={30} step={5} />
                  <ParamSlider label="Top Threshold" value={params.stochRsiTopThreshold} onChange={v => onUpdateParam('stochRsiTopThreshold', v)} min={70} max={95} step={5} />
                  <ParamSlider label="Cross Level" value={params.stochRsiCrossLevel} onChange={v => onUpdateParam('stochRsiCrossLevel', v)} min={30} max={70} step={5} />
                </>
              )}
              {enabled.bb && (
                <>
                  <ParamSlider label="BB Period" value={params.bbPeriod} onChange={v => onUpdateParam('bbPeriod', v)} min={5} max={50} step={1} />
                  <ParamSlider label="BB Std Dev" value={params.bbStdDev} onChange={v => onUpdateParam('bbStdDev', v)} min={1} max={4} step={0.5} />
                </>
              )}
              {enabled.volume && (
                <ParamSlider label="Volume SMA" value={params.volumeSMA} onChange={v => onUpdateParam('volumeSMA', v)} min={5} max={50} step={1} />
              )}
              {enabled.atr && (
                <>
                  <ParamSlider label="ATR Period" value={params.atrPeriod} onChange={v => onUpdateParam('atrPeriod', v)} min={5} max={50} step={1} />
                  <ParamSlider label="Min ATR %" value={params.minATR} onChange={v => onUpdateParam('minATR', v)} min={0.05} max={1} step={0.05} />
                </>
              )}
            </div>
          </div>

          {/* ── Risk Management: Position Size + Leverage + SL/TP/Trail ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
              💰 Risk Management
            </p>
            <div className="space-y-4">
              {/* Position Size slider */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Position Size (Base)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-cyan-400">
                      ${config.positionSize}
                    </span>
                    <span className="text-[10px] text-white/30">
                      per trade
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={config.positionSize ?? 20}
                  onChange={e => onUpdateConfig({ positionSize: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-cyan-600/20 via-cyan-500/40 to-cyan-400/60"
                />
                <div className="flex items-center justify-between mt-1.5 text-[9px] text-white/20">
                  <span>$5</span>
                  <span>Conservative ←→ Aggressive</span>
                  <span>$100</span>
                </div>
              </div>

              {/* Leverage slider */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Leverage</label>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-lg font-bold font-mono', leverageColor)}>
                      {config.leverage}x
                    </span>
                    <span className="text-[10px] text-white/30">
                      ${config.positionSize ?? 20} → ${((config.positionSize ?? 20) * (config.leverage ?? 1)).toLocaleString()} exposure
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={config.leverage}
                  onChange={(e) => onUpdateConfig({ leverage: parseInt(e.target.value) })}
                  className={cn(
                    'w-full h-2 rounded-full appearance-none cursor-pointer',
                    'bg-gradient-to-r from-emerald-500/30 via-amber-500/30 via-orange-500/30 to-red-500/30',
                    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full',
                    config.leverage <= 5
                      ? '[&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                      : config.leverage <= 20
                      ? '[&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                      : config.leverage <= 50
                      ? '[&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(251,146,60,0.5)]'
                      : '[&::-webkit-slider-thumb]:bg-red-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(248,113,113,0.5)]',
                  )}
                />
                <div className="flex justify-between text-[9px] text-white/20 mt-1">
                  <span>1x</span>
                  <span>25x</span>
                  <span>50x</span>
                  <span>75x</span>
                  <span>100x</span>
                </div>
                {/* Risk warnings */}
                {leverageWarning && (
                  <div className={cn(
                    'mt-2 px-3 py-2 rounded-lg text-[10px] flex items-center gap-2',
                    config.leverage > 50
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : config.leverage > 10
                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                  )}>
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                    {leverageWarning}
                  </div>
                )}
              </div>

              {/* Max Positions slider */}<div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"><div className="flex items-center justify-between mb-2"><label className="text-xs font-medium text-white/70">Max Open Positions</label><div className="flex items-center gap-2"><span className="text-lg font-bold font-mono text-violet-400">{config.maxPositions}</span><span className="text-[10px] text-white/30">slots</span></div></div><input type="range" min={1} max={50} step={1} value={config.maxPositions} onChange={e => onUpdateConfig({ maxPositions: Number(e.target.value) })} className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-violet-600/20 via-violet-500/40 to-violet-400/60" /><div className="flex items-center justify-between mt-1.5 text-[9px] text-white/20"><span>1</span><span>50</span></div></div>
              {/* SL/TP/Trailing sliders */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ParamSlider
                  label="Stop Loss %"
                  value={config.stopLossPercent}
                  onChange={v => onUpdateConfig({ stopLossPercent: v })}
                  min={0.1} max={2} step={0.1}
                  colorClass="text-red-400"
                />
                <ParamSlider
                  label="Take Profit %"
                  value={config.takeProfitPercent}
                  onChange={v => onUpdateConfig({ takeProfitPercent: v })}
                  min={0.2} max={5} step={0.1}
                  colorClass="text-emerald-400"
                />
                <ParamSlider
                  label="Trailing Stop %"
                  value={config.trailingStopPercent}
                  onChange={v => onUpdateConfig({ trailingStopPercent: v })}
                  min={0.1} max={2} step={0.1}
                  colorClass="text-amber-400"
                />
                <ParamSlider
                  label="Trail Activation %"
                  value={config.trailingActivationPercent}
                  onChange={v => onUpdateConfig({ trailingActivationPercent: v })}
                  min={0.2} max={3} step={0.1}
                  colorClass="text-cyan-400"
                />
              </div>

              {/* Risk summary */}
              <div className="flex flex-wrap gap-4 text-xs text-white/50">
                <span>🛑 SL: <span className="text-red-400 font-mono">{config.stopLossPercent ?? 0}%</span>
                  <span className="text-white/20 ml-1">(${(((config.positionSize ?? 20) * (config.leverage ?? 1) * (config.stopLossPercent ?? 0) / 100) || 0).toFixed(2)} max loss)</span>
                </span>
                <span>🎯 TP: <span className="text-emerald-400 font-mono">{config.takeProfitPercent ?? 0}%</span>
                  <span className="text-white/20 ml-1">(${(((config.positionSize ?? 20) * (config.leverage ?? 1) * (config.takeProfitPercent ?? 0) / 100) || 0).toFixed(2)} max gain)</span>
                </span>
                <span>📏 Trail: <span className="text-cyan-400 font-mono">{config.trailingStopPercent ?? 0}%</span> after +{config.trailingActivationPercent ?? 0}%</span>
              </div>
            </div>
          </div>

          {/* ── Reset Button ── */}
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

// ──────────────────────────────────────────────
// Controls Bar (Start/Stop, Close All, Reset, Min Confidence)
// ──────────────────────────────────────────────
function ControlsBar({
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/25"
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
              Min Conf: <span className="text-cyan-400 font-mono">{config.minConfidence}%</span>
            </label>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={config.minConfidence}
              onChange={e => onUpdateConfig({ minConfidence: parseInt(e.target.value) })}
              className="w-24 h-1.5 rounded-lg appearance-none bg-white/10 accent-cyan-500"
            />
          </div>

          {/* Toggles */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoEntry}
              onChange={e => onUpdateConfig({ autoEntry: e.target.checked })}
              className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 accent-cyan-500"
            />
            <span className="text-[10px] text-white/50">Auto Entry</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.queueEnabled}
              onChange={e => onUpdateConfig({ queueEnabled: e.target.checked })}
              className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 accent-cyan-500"
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

// ──────────────────────────────────────────────
// Position Row (inline in table)
// ──────────────────────────────────────────────
function PositionRow({ position: pos, onClose }: { position: any; onClose: (id: string) => void }) {
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
        <div className="text-sm font-semibold text-white/90">{pos.symbol ?? '—'}</div>
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
      {/* SL/TP */}
      <div className="hidden md:block min-w-[80px]">
        <div className="text-[10px] text-red-400/70">SL: ${(pos.stopLoss ?? 0).toFixed((pos.stopLoss ?? 0) < 1 ? 6 : 2)}</div>
        <div className="text-[10px] text-emerald-400/70">TP: ${(pos.takeProfit ?? 0).toFixed((pos.takeProfit ?? 0) < 1 ? 6 : 2)}</div>
        {pos.trailingStop && (
          <div className="text-[10px] text-amber-400/70">TS: ${(pos.trailingStop ?? 0).toFixed((pos.trailingStop ?? 0) < 1 ? 6 : 2)}</div>
        )}
      </div>
      {/* Status */}
      <div className={cn('px-2 py-0.5 rounded text-[10px] font-medium', statusColors[status] || 'text-white/50 bg-white/5')}>
        {status}
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

// ──────────────────────────────────────────────
// Shared sub-components
// ──────────────────────────────────────────────

function IndicatorToggle({ label, enabled, onChange, color }: {
  label: string;
  enabled: boolean;
  onChange: () => void;
  color: 'emerald' | 'blue' | 'cyan' | 'violet';
}) {
  const colors = {
    emerald: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
    blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
    cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
    violet: { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400' },
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
        className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
      />
      <span className={cn('text-xs font-medium', enabled ? c.text : 'text-white/40')}>
        {label}
      </span>
    </label>
  );
}

function ParamSlider({ label, value, onChange, min, max, step, colorClass }: {
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
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.1] accent-cyan-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(34,211,238,0.5)]"
      />
    </div>
  );
}

// ──────────────────────────────────────────────
// Leverage helpers
// ──────────────────────────────────────────────

function getLeverageColor(leverage: number): string {
  if (leverage <= 5) return 'text-emerald-400';
  if (leverage <= 20) return 'text-amber-400';
  if (leverage <= 50) return 'text-orange-400';
  return 'text-red-400';
}

function getLeverageWarning(leverage: number, positionSize: number = 20): string | null {
  if (leverage > 50) {
    const liqMove = (100 / leverage).toFixed(2);
    return `⚠️ LIQUIDATION RISK — ${leverage}x leverage. A ${liqMove}% adverse move = total loss. Max SL loss per trade: $${(positionSize * leverage * 0.4 / 100).toFixed(2)}`;
  }
  if (leverage > 10) {
    return `⚠️ Extreme Risk — ${leverage}x amplifies both gains AND losses. Max SL loss per trade: $${(positionSize * leverage * 0.4 / 100).toFixed(2)}`;
  }
  if (leverage > 5) {
    return `⚠️ High Risk — ${leverage}x leverage. Max SL loss per trade: $${(positionSize * leverage * 0.4 / 100).toFixed(2)}`;
  }
  return null;
}






