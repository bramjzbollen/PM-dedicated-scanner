/**
 * INTEGRATION PATCH — server-trade-state-hft.ts (v2 — with Adaptive Tuner)
 * 
 * Extended version of server-trade-state.ts with:
 *  1. ExecutionAdapter integration (paper ↔ live)
 *  2. Kill switch system
 *  3. Micro-profit optimized defaults
 *  4. Fee-realistic PnL calculation
 *  5. HFT metrics
 *  6. ADAPTIVE TUNER — auto-learns from trades
 */

import {
  loadState, saveState, closePosition, updatePricesAndCheckExits,
  processSignals, createPosition, resetState,
  type TradeState, type ServerPosition, type ServerConfig,
} from './server-trade-state';

import {
  ExecutionAdapter, getExecutionAdapter,
  type ExecutionConfig, type OrderRequest, type OrderResult,
} from './execution-adapter';

import {
  checkKillSwitches, makeDefaultKillSwitchState,
  DEFAULT_KILL_SWITCH_CONFIG, MICRO_PROFIT_CONFIG,
  SPREAD_GATE,
  type KillSwitchState, type KillSwitchConfig,
} from './micro-profit-config';

import {
  recordTrade, runAnalysisCycle, getTuningStatus,
  toggleTuning, resetTuning, setAnalysisInterval,
} from './adaptive-tuner';

// ── Extended State ──

export interface HFTState extends TradeState {
  killSwitch: KillSwitchState;
  killSwitchConfig: KillSwitchConfig;
  executionMode: 'paper' | 'live';
  hftMetrics: HFTMetrics;
}

export interface HFTMetrics {
  tradesThisHour: number;
  tradesThisHourResetAt: number;
  avgTradeLatencyMs: number;
  avgSlippagePct: number;
  fillRate: number;
  totalFeePaid: number;
  grossPnl: number;
  netPnl: number;
  profitFactor: number;
  lastTradeAt: number;
}

function makeDefaultHFTMetrics(): HFTMetrics {
  return {
    tradesThisHour: 0, tradesThisHourResetAt: Date.now() + 3600000,
    avgTradeLatencyMs: 0, avgSlippagePct: 0, fillRate: 100,
    totalFeePaid: 0, grossPnl: 0, netPnl: 0, profitFactor: 0, lastTradeAt: 0,
  };
}

// ── Fee-Aware Position Creation ──

export function createPositionHFT(
  state: TradeState, symbol: string, direction: 'LONG' | 'SHORT',
  price: number, fillResult: OrderResult, trade?: any,
  confidence?: number, reason?: string,
): ServerPosition {
  const effectivePrice = fillResult.filledPrice || price;
  const pos = createPosition(state, symbol, direction, effectivePrice, trade, confidence, reason);
  
  const adapter = getExecutionAdapter();
  const fees = adapter.getFeeRates();
  const roundTripFeePct = (fees.maker + fees.taker) * 100;
  const minTpPct = roundTripFeePct * 2.5;
  
  const currentTpDistance = Math.abs(pos.takeProfit - pos.entryPrice) / pos.entryPrice * 100;
  if (currentTpDistance < minTpPct) {
    const adjustedTpPct = minTpPct / 100;
    pos.takeProfit = direction === 'LONG'
      ? effectivePrice * (1 + adjustedTpPct)
      : effectivePrice * (1 - adjustedTpPct);
  }
  
  return pos;
}

// ── Spread Gate ──

export function checkSpreadGate(bid: number, ask: number): { pass: boolean; spread: number } {
  if (!SPREAD_GATE.enabled || bid <= 0 || ask <= 0) return { pass: true, spread: 0 };
  const spread = ((ask - bid) / bid) * 100;
  return { pass: spread <= SPREAD_GATE.maxSpreadPercent, spread };
}

// ── HFT Process Signals ──

export async function processSignalsHFT(
  state: TradeState,
  signals: Array<{
    symbol: string; signal: string; confidence: number;
    reason: string; price: number; skipTrade?: boolean; trade?: any;
    bid?: number; ask?: number; indicators?: any; criteriaDetails?: any;
    scanner?: string;
  }>,
  prices: Record<string, number>,
  cooldownMs: number,
): Promise<TradeState> {
  if (!state.isRunning || !state.config.autoEntry) return state;
  
  const adapter = getExecutionAdapter();
  const hftState = state as HFTState;
  const ks = hftState.killSwitch || makeDefaultKillSwitchState();
  const ksConfig = hftState.killSwitchConfig || DEFAULT_KILL_SWITCH_CONFIG;
  
  if (ks.isPaused && Date.now() < ks.pauseUntil) return state;
  
  const metrics = hftState.hftMetrics || makeDefaultHFTMetrics();
  if (Date.now() >= metrics.tradesThisHourResetAt) {
    metrics.tradesThisHour = 0;
    metrics.tradesThisHourResetAt = Date.now() + 3600000;
  }
  
  if (adapter.isPaper) {
    adapter.syncPaperBalance(state.stats.walletBalance);
    
    // Spread gate filter
    const filteredSignals = signals.filter(sig => {
      if (sig.bid && sig.ask) return checkSpreadGate(sig.bid, sig.ask).pass;
      return true;
    });
    
    const prevClosedCount = state.stats.closedCount;
    
    let newState = processSignals(state, filteredSignals, prices, cooldownMs);
    
    // Track new closes for kill switch + adaptive tuner
    const newCloses = newState.stats.closedCount - prevClosedCount;
    if (newCloses > 0) {
      const recentClosed = newState.closedPositions?.slice(0, newCloses) || [];
      
      for (const pos of recentClosed) {
        // ── Kill Switch ──
        const ksResult = checkKillSwitches(ks, ksConfig, {
          pnl: pos.pnl, isWin: pos.pnl > 0, wasFilled: true,
        }, newState.stats.walletBalance, (newState as HFTState).initialWalletSize || 1000);
        
        Object.assign(ks, ksResult.state);
        if (!ksResult.canTrade) {
          console.log(`[KillSwitch] ${ksResult.action}`);
          newState.isRunning = false;
        }
        
        // ── Adaptive Tuner — Record Trade ──
        const matchingSignal = signals.find(s => s.symbol === pos.symbol);
        const scannerType = matchingSignal?.scanner === '15m-pullback' ? '15m' : '1m';
        
        try {
          const { shouldAnalyze } = await recordTrade(
            pos,
            matchingSignal?.indicators || {},
            matchingSignal?.criteriaDetails || {},
            scannerType as '1m' | '15m',
          );
          
          if (shouldAnalyze) {
            const cycles = await runAnalysisCycle();
            if (cycles.length > 0) {
              for (const cycle of cycles) {
                console.log(`[AdaptiveTuner] ${cycle.scanner} — WR: ${cycle.winRateBefore.toFixed(1)}% — Adjustments: ${cycle.adjustmentsMade.length}`);
                for (const adj of cycle.adjustmentsMade) {
                  console.log(`  -> ${adj}`);
                }
              }
            }
          }
        } catch (e) {
          console.error('[AdaptiveTuner] Error:', e);
        }
        
        // ── Metrics ──
        metrics.tradesThisHour++;
        metrics.lastTradeAt = Date.now();
        metrics.netPnl += pos.pnl;
        if (pos.pnl > 0) metrics.grossPnl += pos.pnl;
      }
    }
    
    (newState as HFTState).killSwitch = ks;
    (newState as HFTState).killSwitchConfig = ksConfig;
    (newState as HFTState).hftMetrics = metrics;
    
    return newState;
  }
  
  return processSignals(state, signals, prices, cooldownMs);
}

// ── Enhanced Close with Fee Tracking ──

export function closePositionHFT(
  state: TradeState, posId: string, reason: string,
  currentPrice: number, fillResult?: OrderResult,
): TradeState {
  const pos = state.positions.find(p => p.id === posId);
  if (!pos) return state;
  
  const exitPrice = fillResult?.filledPrice || currentPrice;
  const fee = fillResult?.fee || 0;
  
  let newState = closePosition(state, posId, reason, exitPrice);
  
  if (fee > 0) {
    newState.stats.walletBalance -= fee;
    const m = (newState as HFTState).hftMetrics || makeDefaultHFTMetrics();
    m.totalFeePaid += fee;
    (newState as HFTState).hftMetrics = m;
  }
  
  return newState;
}

// ── Route Handler Extension ──

export function handleHFTAction(
  state: TradeState, action: string, params: Record<string, any>,
): TradeState | null {
  switch (action) {
    case 'setMicroProfitMode':
      state.config = { ...state.config, ...MICRO_PROFIT_CONFIG };
      return state;
    
    case 'setPreset': {
      const { MICRO_PROFIT_PRESETS } = require('./micro-profit-config');
      const preset = MICRO_PROFIT_PRESETS[params.preset as keyof typeof MICRO_PROFIT_PRESETS];
      if (preset) state.config = { ...state.config, ...preset.config };
      return state;
    }
    
    case 'resetKillSwitch': {
      const hft = state as HFTState;
      hft.killSwitch = makeDefaultKillSwitchState();
      hft.isRunning = true;
      return state;
    }
    
    case 'updateKillSwitchConfig': {
      const hft = state as HFTState;
      hft.killSwitchConfig = { ...(hft.killSwitchConfig || DEFAULT_KILL_SWITCH_CONFIG), ...params.config };
      return state;
    }
    
    case 'switchExecutionMode': {
      const hft = state as HFTState;
      hft.executionMode = params.mode || 'paper';
      const { resetExecutionAdapter } = require('./execution-adapter');
      resetExecutionAdapter();
      return state;
    }
    
    // ── Adaptive Tuner Actions ──
    case 'toggleAdaptiveTuning':
      toggleTuning(params.enabled !== false);
      return state;
    
    case 'resetAdaptiveTuning':
      resetTuning();
      return state;
    
    case 'setTuningInterval':
      setAnalysisInterval(params.interval || 50);
      return state;
    
    case 'runTuningCycle':
      runAnalysisCycle().then(cycles => {
        if (cycles.length > 0) {
          console.log(`[AdaptiveTuner] Manual cycle: ${cycles.map(c => `${c.scanner}: ${c.adjustmentsMade.length} adj`).join(', ')}`);
        } else {
          console.log('[AdaptiveTuner] Not enough trades yet');
        }
      }).catch(e => console.error('[AdaptiveTuner]', e));
      return state;
    
    case 'getTuningStatus':
      // This is read-only — handled in GET, not POST
      return state;
    
    default:
      return null;
  }
}

// ── Re-exports ──

export {
  loadState, saveState, closePosition, updatePricesAndCheckExits,
  processSignals, createPosition, resetState,
  type TradeState, type ServerPosition, type ServerConfig,
} from './server-trade-state';

export {
  MICRO_PROFIT_CONFIG, MICRO_PROFIT_SCALP_PARAMS, MICRO_PROFIT_SCALP_ENABLED,
  MICRO_PROFIT_PRESETS, SPREAD_GATE, DEFAULT_KILL_SWITCH_CONFIG,
  type KillSwitchState, type KillSwitchConfig,
} from './micro-profit-config';

export {
  ExecutionAdapter, getExecutionAdapter,
  type ExecutionConfig, type OrderResult,
} from './execution-adapter';

export { getTuningStatus } from './adaptive-tuner';
