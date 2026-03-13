/**
 * Adaptive Tuner — Active Learning for Scanner Parameters
 * 
 * Analyzes closed trades to find which indicator conditions lead to wins vs losses,
 * then automatically adjusts scanner thresholds to improve winrate.
 * 
 * HOW IT WORKS:
 *   1. Every N closed trades (default 50), the tuner runs an analysis cycle
 *   2. Groups trades by: direction, criteria met, indicator ranges
 *   3. Calculates winrate per condition bucket
 *   4. Shifts parameters toward conditions with higher winrate
 *   5. Saves adjustments to a tuning state file
 *   6. Scanner reads adjustments on next cycle
 * 
 * SAFETY:
 *   - Max adjustment per cycle is capped (no wild swings)
 *   - Minimum sample size required before adjusting
 *   - All changes are logged and reversible
 *   - Manual override always takes precedence
 * 
 * INTEGRATION:
 *   Called from server-trade-state-hft.ts after trade closes
 *   Scanner reads tuning overrides from public/adaptive-tuning.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// ── Types ──

export interface TradeRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  isWin: boolean;
  closeReason: string;
  holdTimeMs: number;
  confidence: number;
  // Indicator values at entry
  indicators: {
    rsi?: number;
    ema_fast_vs_mid?: number;    // % distance between fast and mid EMA
    ema_mid_vs_slow?: number;    // % distance between mid and slow EMA
    volumeRatio?: number;
    atrPercent?: number;
    bodyRatio?: number;
    macdHist?: number;
    spreadPct?: number;
  };
  // Which criteria were met
  criteria: {
    bias?: boolean;
    emaStack?: boolean;
    pullback?: boolean;
    rsi?: boolean;
    macd?: boolean;
    volume?: boolean;
    atr?: boolean;
    body?: boolean;
    entry?: boolean;
  };
  scanner: '1m' | '15m';
  timestamp: number;
}

export interface TuningState {
  // Current parameter adjustments (deltas from base config)
  adjustments_1m: ParameterAdjustments;
  adjustments_15m: ParameterAdjustments;
  
  // Learning history
  cycleCount: number;
  lastCycleAt: number;
  totalTradesAnalyzed: number;
  
  // Performance tracking per cycle
  history: CycleResult[];
  
  // Trade buffer (raw data for next analysis)
  tradeBuffer: TradeRecord[];
  
  // Safety
  isEnabled: boolean;
  maxAdjustmentPerCycle: number;   // max % shift per parameter per cycle
  minSampleSize: number;           // min trades before adjusting
  analysisInterval: number;        // trades between analysis cycles
}

export interface ParameterAdjustments {
  // RSI
  rsiOversoldShift: number;        // e.g. -2 means oversold threshold dropped by 2
  rsiOverboughtShift: number;
  
  // Volume
  volumeMultiplierShift: number;   // e.g. +0.1 means require 0.1 more volume
  
  // ATR
  atrMinShift: number;             // shift to min ATR threshold
  
  // Body
  bodyRatioShift: number;
  
  // Confidence
  confidenceBoostBias: number;     // extra confidence when bias is present
  confidenceBoostVolume: number;   // extra confidence for volume confirmation
  confidenceBoostEntry: number;    // extra confidence for breakout entry
  
  // Scoring
  minScoreShift: number;           // shift to minimum criteria score (3 of 4 → 4 of 4?)
}

export interface CycleResult {
  cycleNumber: number;
  timestamp: number;
  tradesAnalyzed: number;
  winRateBefore: number;
  adjustmentsMade: string[];
  scanner: '1m' | '15m';
}

// ── Condition Buckets ──

interface ConditionBucket {
  label: string;
  wins: number;
  losses: number;
  totalPnl: number;
  avgConfidence: number;
  count: number;
}

// ── Defaults ──

function defaultAdjustments(): ParameterAdjustments {
  return {
    rsiOversoldShift: 0,
    rsiOverboughtShift: 0,
    volumeMultiplierShift: 0,
    atrMinShift: 0,
    bodyRatioShift: 0,
    confidenceBoostBias: 0,
    confidenceBoostVolume: 0,
    confidenceBoostEntry: 0,
    minScoreShift: 0,
  };
}

export function makeDefaultTuningState(): TuningState {
  return {
    adjustments_1m: defaultAdjustments(),
    adjustments_15m: defaultAdjustments(),
    cycleCount: 0,
    lastCycleAt: 0,
    totalTradesAnalyzed: 0,
    history: [],
    tradeBuffer: [],
    isEnabled: true,
    maxAdjustmentPerCycle: 15,  // max 15% shift per param per cycle
    minSampleSize: 30,          // need 30 trades minimum
    analysisInterval: 50,       // analyze every 50 trades
  };
}

// ── File I/O ──

const TUNING_DIR = join(process.cwd(), '..', 'trade-state');
const TUNING_FILE = 'adaptive-tuning.json';
// Scanner reads this file for live parameter overrides
const SCANNER_OVERRIDES_FILE = join(process.cwd(), 'public', 'adaptive-overrides.json');

let tuningCache: TuningState | null = null;

export async function loadTuningState(): Promise<TuningState> {
  if (tuningCache) return tuningCache;
  
  const filePath = join(TUNING_DIR, TUNING_FILE);
  try {
    if (existsSync(filePath)) {
      const raw = await readFile(filePath, 'utf-8');
      tuningCache = JSON.parse(raw);
      return tuningCache!;
    }
  } catch {}
  
  tuningCache = makeDefaultTuningState();
  return tuningCache;
}

async function saveTuningState(state: TuningState): Promise<void> {
  tuningCache = state;
  const filePath = join(TUNING_DIR, TUNING_FILE);
  try {
    await writeFile(filePath, JSON.stringify(state, null, 2));
  } catch {}
  
  // Also write scanner-readable overrides
  try {
    const overrides = {
      _generated: new Date().toISOString(),
      _cycle: state.cycleCount,
      '1m': state.adjustments_1m,
      '15m': state.adjustments_15m,
    };
    await writeFile(SCANNER_OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
  } catch {}
}

// ── Record a Trade ──

export async function recordTrade(
  position: {
    id: string; symbol: string; direction: 'LONG' | 'SHORT';
    entryPrice: number; currentPrice: number; pnl: number; pnlPercent: number;
    closeReason?: string; openedAt: string; closedAt?: string;
    confidence?: number; reason?: string;
  },
  indicatorSnapshot?: Record<string, any>,
  criteriaSnapshot?: Record<string, boolean>,
  scanner: '1m' | '15m' = '1m',
): Promise<{ shouldAnalyze: boolean }> {
  const state = await loadTuningState();
  if (!state.isEnabled) return { shouldAnalyze: false };
  
  const holdTimeMs = position.closedAt
    ? new Date(position.closedAt).getTime() - new Date(position.openedAt).getTime()
    : 0;
  
  const record: TradeRecord = {
    id: position.id,
    symbol: position.symbol,
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice: position.currentPrice,
    pnl: position.pnl,
    pnlPercent: position.pnlPercent,
    isWin: position.pnl > 0,
    closeReason: position.closeReason || 'unknown',
    holdTimeMs,
    confidence: position.confidence || 0,
    indicators: {
      rsi: indicatorSnapshot?.rsi7 || indicatorSnapshot?.rsi14 || indicatorSnapshot?.rsi,
      volumeRatio: indicatorSnapshot?.volumeRatio,
      atrPercent: indicatorSnapshot?.atrPercent,
      bodyRatio: indicatorSnapshot?.bodyRatio,
      macdHist: indicatorSnapshot?.macdHist,
    },
    criteria: criteriaSnapshot || {},
    scanner,
    timestamp: Date.now(),
  };
  
  state.tradeBuffer.push(record);
  
  // Keep buffer manageable
  if (state.tradeBuffer.length > 1000) {
    state.tradeBuffer = state.tradeBuffer.slice(-500);
  }
  
  const shouldAnalyze = state.tradeBuffer.length >= state.analysisInterval;
  await saveTuningState(state);
  
  return { shouldAnalyze };
}

// ── Analysis Engine ──

export async function runAnalysisCycle(): Promise<CycleResult[]> {
  const state = await loadTuningState();
  if (!state.isEnabled || state.tradeBuffer.length < state.minSampleSize) {
    return [];
  }
  
  const results: CycleResult[] = [];
  
  // Split by scanner type
  const trades1m = state.tradeBuffer.filter(t => t.scanner === '1m');
  const trades15m = state.tradeBuffer.filter(t => t.scanner === '15m');
  
  if (trades1m.length >= state.minSampleSize) {
    const result = analyzeAndAdjust(trades1m, state.adjustments_1m, '1m', state);
    results.push(result);
    state.adjustments_1m = result._newAdjustments;
  }
  
  if (trades15m.length >= state.minSampleSize) {
    const result = analyzeAndAdjust(trades15m, state.adjustments_15m, '15m', state);
    results.push(result);
    state.adjustments_15m = result._newAdjustments;
  }
  
  if (results.length > 0) {
    state.cycleCount += 1;
    state.lastCycleAt = Date.now();
    state.totalTradesAnalyzed += state.tradeBuffer.length;
    state.history = [...state.history.slice(-50), ...results]; // keep last 50 cycles
    state.tradeBuffer = []; // clear buffer after analysis
    
    await saveTuningState(state);
    
    console.log(`[AdaptiveTuner] Cycle ${state.cycleCount} complete — ${results.map(r => `${r.scanner}: ${r.tradesAnalyzed} trades, WR ${r.winRateBefore.toFixed(1)}%, ${r.adjustmentsMade.length} adjustments`).join(' | ')}`);
  }
  
  return results;
}

function analyzeAndAdjust(
  trades: TradeRecord[],
  currentAdj: ParameterAdjustments,
  scanner: '1m' | '15m',
  state: TuningState,
): CycleResult & { _newAdjustments: ParameterAdjustments } {
  const adj = { ...currentAdj };
  const maxShift = state.maxAdjustmentPerCycle;
  const adjustmentsMade: string[] = [];
  
  const wins = trades.filter(t => t.isWin);
  const losses = trades.filter(t => !t.isWin);
  const winRate = (wins.length / trades.length) * 100;
  
  // ── 1. RSI Analysis ──
  const winsWithRsi = wins.filter(t => t.indicators.rsi != null);
  const lossesWithRsi = losses.filter(t => t.indicators.rsi != null);
  
  if (winsWithRsi.length > 5 && lossesWithRsi.length > 5) {
    const avgWinRsi = winsWithRsi.reduce((s, t) => s + t.indicators.rsi!, 0) / winsWithRsi.length;
    const avgLossRsi = lossesWithRsi.reduce((s, t) => s + t.indicators.rsi!, 0) / lossesWithRsi.length;
    
    // If losing trades have higher RSI (for longs), tighten the upper bound
    const longLosses = losses.filter(t => t.direction === 'LONG' && t.indicators.rsi != null);
    const longWins = wins.filter(t => t.direction === 'LONG' && t.indicators.rsi != null);
    
    if (longLosses.length > 3 && longWins.length > 3) {
      const avgLossRsiLong = longLosses.reduce((s, t) => s + t.indicators.rsi!, 0) / longLosses.length;
      const avgWinRsiLong = longWins.reduce((s, t) => s + t.indicators.rsi!, 0) / longWins.length;
      
      // If losses cluster at higher RSI values → lower the overbought threshold
      if (avgLossRsiLong > avgWinRsiLong + 5) {
        const shift = -Math.min(maxShift, Math.round((avgLossRsiLong - avgWinRsiLong) / 3));
        adj.rsiOverboughtShift = clamp(adj.rsiOverboughtShift + shift, -20, 20);
        adjustmentsMade.push(`RSI long upper: ${shift > 0 ? '+' : ''}${shift} (loss avg ${avgLossRsiLong.toFixed(0)} vs win avg ${avgWinRsiLong.toFixed(0)})`);
      }
    }
    
    // Same for shorts
    const shortLosses = losses.filter(t => t.direction === 'SHORT' && t.indicators.rsi != null);
    const shortWins = wins.filter(t => t.direction === 'SHORT' && t.indicators.rsi != null);
    
    if (shortLosses.length > 3 && shortWins.length > 3) {
      const avgLossRsiShort = shortLosses.reduce((s, t) => s + t.indicators.rsi!, 0) / shortLosses.length;
      const avgWinRsiShort = shortWins.reduce((s, t) => s + t.indicators.rsi!, 0) / shortWins.length;
      
      if (avgLossRsiShort < avgWinRsiShort - 5) {
        const shift = Math.min(maxShift, Math.round((avgWinRsiShort - avgLossRsiShort) / 3));
        adj.rsiOversoldShift = clamp(adj.rsiOversoldShift + shift, -20, 20);
        adjustmentsMade.push(`RSI short lower: +${shift} (loss avg ${avgLossRsiShort.toFixed(0)} vs win avg ${avgWinRsiShort.toFixed(0)})`);
      }
    }
  }
  
  // ── 2. Volume Analysis ──
  const winsWithVol = wins.filter(t => t.indicators.volumeRatio != null);
  const lossesWithVol = losses.filter(t => t.indicators.volumeRatio != null);
  
  if (winsWithVol.length > 5 && lossesWithVol.length > 5) {
    const avgWinVol = winsWithVol.reduce((s, t) => s + t.indicators.volumeRatio!, 0) / winsWithVol.length;
    const avgLossVol = lossesWithVol.reduce((s, t) => s + t.indicators.volumeRatio!, 0) / lossesWithVol.length;
    
    // If wins have significantly higher volume → raise volume threshold
    if (avgWinVol > avgLossVol * 1.15) {
      const shift = Math.min(0.15, (avgWinVol - avgLossVol) * 0.3);
      adj.volumeMultiplierShift = clamp(adj.volumeMultiplierShift + shift, -0.5, 0.5);
      adjustmentsMade.push(`Volume threshold: +${shift.toFixed(2)} (win avg ${avgWinVol.toFixed(2)}x vs loss avg ${avgLossVol.toFixed(2)}x)`);
    }
    // If volume doesn't differentiate → relax threshold slightly for more signals
    if (Math.abs(avgWinVol - avgLossVol) < 0.1 && adj.volumeMultiplierShift > 0) {
      adj.volumeMultiplierShift = Math.max(0, adj.volumeMultiplierShift - 0.05);
      adjustmentsMade.push(`Volume threshold relaxed: volume doesn't differentiate wins/losses`);
    }
  }
  
  // ── 3. Criteria Hit Rate Analysis ──
  // Which criteria combinations lead to wins?
  const criteriaWinRates: Record<string, { wins: number; total: number }> = {};
  
  for (const trade of trades) {
    for (const [key, met] of Object.entries(trade.criteria)) {
      if (!criteriaWinRates[key]) criteriaWinRates[key] = { wins: 0, total: 0 };
      if (met) {
        criteriaWinRates[key].total++;
        if (trade.isWin) criteriaWinRates[key].wins++;
      }
    }
  }
  
  // Boost confidence for criteria that strongly predict wins
  for (const [key, data] of Object.entries(criteriaWinRates)) {
    if (data.total < 10) continue;
    const wr = (data.wins / data.total) * 100;
    
    if (key === 'bias' && wr > winRate + 10) {
      const boost = Math.min(5, Math.round((wr - winRate) / 3));
      adj.confidenceBoostBias = clamp(adj.confidenceBoostBias + boost, -10, 15);
      adjustmentsMade.push(`Bias confidence boost: +${boost} (WR with bias: ${wr.toFixed(0)}% vs overall: ${winRate.toFixed(0)}%)`);
    }
    if (key === 'volume' && wr > winRate + 8) {
      const boost = Math.min(4, Math.round((wr - winRate) / 3));
      adj.confidenceBoostVolume = clamp(adj.confidenceBoostVolume + boost, -10, 15);
      adjustmentsMade.push(`Volume confidence boost: +${boost} (WR with vol: ${wr.toFixed(0)}%)`);
    }
    if (key === 'entry' && wr > winRate + 8) {
      const boost = Math.min(4, Math.round((wr - winRate) / 3));
      adj.confidenceBoostEntry = clamp(adj.confidenceBoostEntry + boost, -10, 15);
      adjustmentsMade.push(`Entry confidence boost: +${boost} (WR with entry: ${wr.toFixed(0)}%)`);
    }
  }
  
  // ── 4. ATR Analysis ──
  const winsWithAtr = wins.filter(t => t.indicators.atrPercent != null);
  const lossesWithAtr = losses.filter(t => t.indicators.atrPercent != null);
  
  if (winsWithAtr.length > 5 && lossesWithAtr.length > 5) {
    const avgWinAtr = winsWithAtr.reduce((s, t) => s + t.indicators.atrPercent!, 0) / winsWithAtr.length;
    const avgLossAtr = lossesWithAtr.reduce((s, t) => s + t.indicators.atrPercent!, 0) / lossesWithAtr.length;
    
    // If losses happen in very low ATR (no movement to hit TP) → raise ATR minimum
    if (avgLossAtr < avgWinAtr * 0.7) {
      const shift = Math.min(0.03, (avgWinAtr - avgLossAtr) * 0.5);
      adj.atrMinShift = clamp(adj.atrMinShift + shift, -0.05, 0.10);
      adjustmentsMade.push(`ATR min raised: +${(shift * 100).toFixed(1)}% (win avg ${(avgWinAtr * 100).toFixed(2)}% vs loss avg ${(avgLossAtr * 100).toFixed(2)}%)`);
    }
  }
  
  // ── 5. Hold Time Analysis ──
  // If most losses are timeouts → SL is too wide or TP too tight
  const timeoutLosses = losses.filter(t => t.closeReason === 'timeout');
  const slLosses = losses.filter(t => t.closeReason === 'sl');
  
  if (losses.length > 10) {
    const timeoutPct = (timeoutLosses.length / losses.length) * 100;
    const slPct = (slLosses.length / losses.length) * 100;
    
    if (timeoutPct > 50) {
      adjustmentsMade.push(`⚠ ${timeoutPct.toFixed(0)}% of losses are timeouts — consider tightening SL or widening TP`);
    }
    if (slPct > 70) {
      adjustmentsMade.push(`⚠ ${slPct.toFixed(0)}% of losses are SL hits — consider widening SL or improving entry timing`);
    }
  }
  
  // ── 6. Direction Bias ──
  const longTrades = trades.filter(t => t.direction === 'LONG');
  const shortTrades = trades.filter(t => t.direction === 'SHORT');
  const longWR = longTrades.length > 5 ? (longTrades.filter(t => t.isWin).length / longTrades.length) * 100 : 0;
  const shortWR = shortTrades.length > 5 ? (shortTrades.filter(t => t.isWin).length / shortTrades.length) * 100 : 0;
  
  if (longTrades.length > 10 && shortTrades.length > 10) {
    if (Math.abs(longWR - shortWR) > 20) {
      const weakSide = longWR < shortWR ? 'LONG' : 'SHORT';
      adjustmentsMade.push(`⚠ ${weakSide} winrate significantly lower (L:${longWR.toFixed(0)}% S:${shortWR.toFixed(0)}%) — consider raising confidence threshold for ${weakSide}`);
    }
  }
  
  const cycle: CycleResult = {
    cycleNumber: state.cycleCount + 1,
    timestamp: Date.now(),
    tradesAnalyzed: trades.length,
    winRateBefore: winRate,
    adjustmentsMade,
    scanner,
  };
  
  return { ...cycle, _newAdjustments: adj } as CycleResult & { _newAdjustments: ParameterAdjustments };
}

// ── Helper ──

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Get Current Effective Parameters ──
// Scanner calls this to get adjusted params

export async function getEffectiveParams(scanner: '1m' | '15m'): Promise<ParameterAdjustments> {
  const state = await loadTuningState();
  return scanner === '1m' ? state.adjustments_1m : state.adjustments_15m;
}

// ── Status for Dashboard ──

export async function getTuningStatus(): Promise<{
  enabled: boolean;
  cycleCount: number;
  lastCycleAt: number;
  totalTradesAnalyzed: number;
  bufferSize: number;
  nextAnalysisIn: number;
  adjustments_1m: ParameterAdjustments;
  adjustments_15m: ParameterAdjustments;
  recentCycles: CycleResult[];
}> {
  const state = await loadTuningState();
  return {
    enabled: state.isEnabled,
    cycleCount: state.cycleCount,
    lastCycleAt: state.lastCycleAt,
    totalTradesAnalyzed: state.totalTradesAnalyzed,
    bufferSize: state.tradeBuffer.length,
    nextAnalysisIn: Math.max(0, state.analysisInterval - state.tradeBuffer.length),
    adjustments_1m: state.adjustments_1m,
    adjustments_15m: state.adjustments_15m,
    recentCycles: state.history.slice(-10),
  };
}

// ── Manual Controls ──

export async function toggleTuning(enabled: boolean): Promise<void> {
  const state = await loadTuningState();
  state.isEnabled = enabled;
  await saveTuningState(state);
}

export async function resetTuning(): Promise<void> {
  tuningCache = makeDefaultTuningState();
  await saveTuningState(tuningCache);
}

export async function setAnalysisInterval(interval: number): Promise<void> {
  const state = await loadTuningState();
  state.analysisInterval = Math.max(20, Math.min(200, interval));
  await saveTuningState(state);
}
