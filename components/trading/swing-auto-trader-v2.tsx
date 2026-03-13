'use client';

/**
 * SwingAutoTraderV2 — 15m Pullback Continuation
 *
 * Uses EMA 20/50, RSI(14), MACD(12,26,9) with 1h EMA200 HTF bias.
 * R-based SL/TP (1.10R / 1.30R strong), break-even at 0.75R, 8-candle time stop.
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faStop, faXmark, faRotateRight,
  faChevronDown, faChevronUp,
  faBolt, faLayerGroup, faList,
  faArrowTrendUp, faArrowTrendDown,
  faClock, faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';
import { cn } from '@/lib/utils';
import { useTradingEngineV2 } from '@/lib/use-trading-engine-v2';
import { compactPairLabel, symbolKey } from '@/lib/normalize-signal';
import { formatDuration, calcPnl, calcPartialPnl, getPositionStatus, QUEUE_EXPIRY_MS } from '@/lib/trading-engine';
import { StatsDashboard } from './shared/stats-dashboard';
import { AutoTradeControls } from './shared/auto-trade-controls';
import { V2SwingSettingsPanel } from './shared/v2-settings-panels';
import { DEFAULT_V2_SWING_PARAMS, DEFAULT_V2_SWING_ENABLED } from '@/lib/use-trading-engine-v2';

export function SwingAutoTraderV2() {
  const engine = useTradingEngineV2('v2-swing');
  const [showSettings, setShowSettings] = useState(false);
  const [sortBy, setSortBy] = useState<'pnl' | 'duration' | 'symbol'>('pnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showHistory, setShowHistory] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);

  const sortedPositions = useMemo(() => {
    return [...engine.positions].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'pnl': cmp = a.pnl - b.pnl; break;
        case 'duration': cmp = new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime(); break;
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [engine.positions, sortBy, sortDir]);

  const filteredSignals = useMemo(() => {
    const activeSymbols = new Set([
      ...engine.positions.map(p => p.symbol),
      ...engine.queue.map(q => q.symbol),
    ]);
    return engine.latestSignals
      .filter(sig => {
        const key = symbolKey(sig);
        return sig.signal !== 'NEUTRAL' && key !== '—' && !sig.skipTrade &&
          sig.confidence >= engine.config.minConfidence && !activeSymbols.has(key) &&
          (sig.price > 0 || (sig.indicators?.price ?? 0) > 0);
      })
      .slice(0, 10);
  }, [engine.latestSignals, engine.positions, engine.queue, engine.config.minConfidence]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  return (
    <div className="space-y-4">
      {/* Strategy Info Banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/[0.12]">
        <FontAwesomeIcon icon={faArrowTrendUp} className="h-4 w-4 text-amber-400" />
        <div className="text-xs text-amber-400/80">
          <span className="font-semibold">V2 Pullback Continuation</span> — EMA 20/50 + RSI(14) + MACD(12,26,9) | 1h EMA200 bias | R-based TP (1.10R / 1.30R) | BE at 0.75R
        </div>
        <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-400/60 ml-auto">15m</Badge>
      </div>

      {/* V2 Scanner Settings Panel */}
      <V2SwingSettingsPanel
        show={showSettings}
        onToggle={() => setShowSettings(!showSettings)}
        params={engine.v2SwingParams}
        enabled={engine.v2SwingEnabled}
        config={engine.config}
        onUpdateParam={(key, value) => engine.updateV2SwingParams({ [key]: value })}
        onToggleIndicator={engine.toggleV2SwingIndicator}
        onUpdateConfig={engine.updateConfig}
        onReset={() => engine.resetV2ScannerSettings()}
        walletSize={engine.initialWalletSize}
        onUpdateWalletSize={engine.updateWalletSize}
      />

      {/* Stats */}
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
        maxPositions={engine.effectiveMaxPositions}
        queueCount={engine.queue.length}
        color="amber"
      />

      {/* Controls */}
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

      {/* Open Positions — Fixed Column Layout */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-amber-400" />
              Open Positions
              <Badge variant="secondary" className="ml-2 text-xs">{engine.positions.length}/{engine.effectiveMaxPositions}</Badge>
            </CardTitle>
            <div className="flex items-center gap-1">
              {(['pnl', 'duration', 'symbol'] as const).map(field => (
                <button key={field} onClick={() => toggleSort(field)}
                  className={cn('px-2 py-1 rounded text-[10px] font-medium transition-all',
                    sortBy === field ? 'bg-amber-500/15 text-amber-400' : 'text-white/30 hover:text-white/50')}>
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                  {sortBy === field && <FontAwesomeIcon icon={sortDir === 'desc' ? faChevronDown : faChevronUp} className="h-2 w-2 ml-1" />}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sortedPositions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-white/20 text-sm">No open positions</div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 mb-1 text-[9px] uppercase tracking-wider text-white/25 border-b border-white/[0.04]">
                <div className="w-[60px]">Dir</div>
                <div className="w-[100px]">Pair</div>
                <div className="w-[80px]">Size</div>
                <div className="w-[90px] hidden sm:block">Entry</div>
                <div className="w-[90px] hidden sm:block">Current</div>
                <div className="w-[100px]">P&L</div>
                <div className="w-[90px] hidden md:block">SL / TP</div>
                <div className="w-[60px]">Status</div>
                <div className="w-[32px] ml-auto"></div>
              </div>
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                {sortedPositions.map(pos => (
                  <V2SwingPositionRow key={pos.id} position={pos} onClose={engine.manualClose} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Queue */}
      <Card className="hover:-translate-y-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faList} className="h-4 w-4 text-amber-400" />
            Queue <Badge variant="secondary" className="ml-2 text-xs">{engine.queue.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {engine.queue.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-white/20 text-sm">Queue is empty</div>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {engine.queue.map((item, idx) => {
                const remaining = QUEUE_EXPIRY_MS - (Date.now() - new Date(item.queuedAt).getTime());
                return (
                  <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-white/20 font-mono w-5">#{idx + 1}</span>
                    <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded', item.direction === 'LONG' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10')}>{item.direction}</span>
                    <span className="text-sm font-medium text-white/80">{item.symbol}</span>
                    <button onClick={() => engine.manualEntryFromQueue(item.id)}
                      className="ml-auto px-2 py-1 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5 mr-1" />Enter
                    </button>
                    <span className="text-[10px] font-mono text-white/30">{remaining > 0 ? formatDuration(remaining) : 'exp'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signals */}
      {filteredSignals.length > 0 && (
        <Card className="hover:-translate-y-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FontAwesomeIcon icon={faBolt} className="h-4 w-4 text-amber-400" />
              V2 Signals <Badge variant="secondary" className="ml-2 text-xs">{filteredSignals.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {filteredSignals.map((sig, i) => {
                const pair = compactPairLabel(sig);
                const ind = sig.indicators as any;
                return (
                  <div key={`${symbolKey(sig)}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded', sig.signal === 'LONG' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10')}>{sig.signal}</span>
                    <span className="text-sm font-semibold text-white/80 w-[80px]">{pair}</span>
                    <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded', sig.confidence >= 75 ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10')}>{sig.confidence}%</span>
                    <div className="hidden md:flex gap-1 flex-1">
                      {ind?.rsi14 != null && <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">RSI: {ind.rsi14}</span>}
                      {ind?.volumeRatio != null && <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">Vol: {ind.volumeRatio}x</span>}
                      {ind?.pullbackDetected && <span className="text-[9px] text-amber-400/60 bg-amber-500/[0.06] px-1.5 py-0.5 rounded">PULLBACK</span>}
                      {sig.trade?.isStrongSetup && <span className="text-[9px] text-emerald-400/60 bg-emerald-500/[0.06] px-1.5 py-0.5 rounded">STRONG 1.30R</span>}
                    </div>
                    <button onClick={() => engine.manualEntryFromSignal(sig)}
                      className="ml-auto px-2 py-1 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5 mr-1" />Enter
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {engine.closedPositions.length > 0 && (
        <Card className="hover:-translate-y-0">
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
            <CardTitle className="text-base flex items-center gap-2 text-white/60">
              <FontAwesomeIcon icon={faList} className="h-4 w-4" /> Trade History
              <Badge variant="secondary" className="ml-2 text-xs">{engine.closedPositions.length}</Badge>
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
                      <span className="text-white/60 w-[80px]">{pos.symbol}</span>
                      <span className={cn('font-mono font-bold', isWin ? 'text-emerald-400' : 'text-red-400')}>{isWin ? '+' : ''}{(pos.pnl || 0).toFixed(2)}$</span>
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

      {engine.lastUpdate && (
        <div className="text-[10px] text-white/20 text-center">
          Last tick: {new Date(engine.lastUpdate).toLocaleTimeString()} •
          V2 Engine: {engine.isRunning ? '🟢 Running' : '⚫ Stopped'} •
          Strategy: 15m Pullback Continuation
        </div>
      )}
    </div>
  );
}

// ── Position Row ──
function V2SwingPositionRow({ position: pos, onClose }: { position: any; onClose: (id: string) => void }) {
  const direction = pos.direction === 'LONG' || pos.direction === 'SHORT' ? pos.direction : 'NEUTRAL';
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
  const pnlColor = totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-white/60';
  const fmt = (v: number) => v < 1 ? v.toFixed(6) : v.toFixed(2);

  return (
    <div className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all duration-200">
      <div className={cn('w-[60px] flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold',
        direction === 'LONG' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10')}>
        <FontAwesomeIcon icon={direction === 'LONG' ? faArrowTrendUp : faArrowTrendDown} className="h-3 w-3" />
        {direction}
      </div>
      <div className="w-[100px]">
        <div className="text-sm font-semibold text-white/90 truncate">{pos.symbol ?? '—'}</div>
        <div className="text-[10px] text-white/30">{formatDuration(duration)}</div>
      </div>
      <div className="w-[80px]">
        <div className="text-xs font-mono font-bold text-white/90">${(Number(pos.size ?? 0) / Number(pos.leverage ?? 1)).toFixed(0)}</div>
        <div className="text-[9px] text-amber-400/60">{Number(pos.leverage ?? 1)}x</div>
      </div>
      <div className="w-[90px] hidden sm:block">
        <div className="text-[10px] text-white/30">Entry</div>
        <div className="text-xs font-mono text-white/70">${fmt(pos.entryPrice ?? 0)}</div>
      </div>
      <div className="w-[90px] hidden sm:block">
        <div className="text-[10px] text-white/30">Now</div>
        <div className={cn('text-xs font-mono transition-colors duration-300',
          priceTick === 'up' ? 'text-emerald-300' : priceTick === 'down' ? 'text-red-300' : 'text-white/70')}>
          ${fmt(pos.currentPrice ?? 0)}
        </div>
      </div>
      <div className="w-[100px]">
        <div className={cn('text-sm font-bold font-mono', pnlColor)}>{totalPnl > 0 ? '+' : ''}{totalPnl.toFixed(2)}$</div>
        <div className={cn('text-[10px] font-mono', pnlColor)}>({pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)</div>
      </div>
      <div className="w-[90px] hidden md:block">
        <div className="text-[10px] text-red-400/70">SL: ${fmt(pos.stopLoss ?? 0)}</div>
        <div className="text-[10px] text-emerald-400/70">TP: ${fmt(pos.takeProfit ?? 0)}</div>
        {pos.trailingStop && <div className="text-[10px] text-amber-400/70">TS: ${fmt(pos.trailingStop)}</div>}
        {pos._breakEvenApplied && <span className="text-[9px] text-amber-400/50">(BE)</span>}
      </div>
      <div className={cn('w-[60px] px-2 py-0.5 rounded text-[10px] font-medium text-center',
        status === 'Trailing' ? 'text-amber-400 bg-amber-500/10' :
        status === 'Near TP' ? 'text-emerald-400 bg-emerald-500/10' :
        status === 'Near SL' ? 'text-red-400 bg-red-500/10' : 'text-white/50 bg-white/5')}>
        {status}
      </div>
      <button onClick={() => onClose(pos.id)}
        className="w-[32px] ml-auto p-1.5 rounded-lg opacity-40 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all">
        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
