/**
 * Micro-Profit HFT Configuration
 * 
 * Optimized for 250+ trades/hour with 0.1-0.2% TP targets.
 * Drop-in replacement for DEFAULT_SCALP_CONFIG in trading-engine.ts
 * 
 * Usage in server-trade-state.ts:
 *   import { MICRO_PROFIT_CONFIG, MICRO_PROFIT_SCALP_PARAMS } from './micro-profit-config';
 */

import type { ServerConfig, TradeState } from './server-trade-state';

// ── Micro-Profit Trading Config ──
// Replaces DEFAULT_SCALP_CONFIG when in HFT mode

export const MICRO_PROFIT_CONFIG: ServerConfig = {
  autoEntry: true,
  minConfidence: 65,          // Slightly lower threshold → more signals → more volume
  maxPositions: 3,            // Max 3 simultaneous (1 per pair)
  queueEnabled: false,        // No queue — instant entry or skip
  positionSize: 100,          // $100 margin per trade
  leverage: 10,               // 10x = $1000 notional per trade
  stopLossPercent: 0.15,      // 0.15% SL — tight
  takeProfitPercent: 0.20,    // 0.20% TP — slightly wider than SL for positive expectancy
  trailingStopPercent: 0.08,  // 0.08% trailing distance (ultra-tight)
  trailingActivationPercent: 0.12, // Activate trail after 0.12% profit
  timeoutMinutes: 0.5,        // 30 seconds max hold time — forces quick exit
};

// ── Micro-Profit Scanner Parameters ──
// Tuned indicators for maximum signal speed

export const MICRO_PROFIT_SCALP_PARAMS = {
  // EMA — ultra-short for micro-moves
  emaFast: 5,
  emaMid: 8,                  // Tighter than default 21 — catches micro-trends
  emaSlow: 21,                // Bias filter (was 50)
  
  // RSI — hyper-responsive
  rsiLength: 2,               // Period 2 instead of 7 — reacts to every candle
  rsiLongMin: 20,             // Oversold bounce entry
  rsiLongMax: 45,             // Don't buy into strength (already moved)
  rsiShortMin: 55,            // Don't short weakness
  rsiShortMax: 80,            // Overbought rejection entry
  
  // MACD — kept fast
  macdFast: 5,
  macdSlow: 13,
  macdSignal: 6,              // Same as current — already optimized
  
  // Volume — confirmation
  volumeSma: 20,
  minVolMultiple: 1.30,       // Slightly higher than 1.20 for quality
  
  // ATR — volatility gate
  atrLength: 7,               // Shorter period for recent vol (was 14)
  minAtrPercent: 0.05,        // Lower threshold — we want more signals
  
  // Body — candle quality
  bodyRatioMin: 0.50,         // Slightly relaxed from 0.55
  
  // R-based exits — micro targets
  tpR: 1.20,                  // TP at 1.2× risk (tight)
  strongTpR: 1.50,            // Strong setup gets 1.5× risk
  beAtR: 0.60,                // Break-even at 0.6× risk (fast protection)
  
  // Time management
  timeStopCandles: 3,         // 3 candles max (3 minutes on 1m chart)
  cooldownMinutes: 0.25,      // 15 seconds cooldown between trades on same pair
  stopAtrCap: 1.00,           // Cap SL at 1× ATR (was 1.50)
};

export const MICRO_PROFIT_SCALP_ENABLED = {
  emaTrend: true,
  rsi: true,
  macd: true,
  volume: true,
  atr: true,
  bodyFilter: true,
};

// ── Spread Gate ──
// Reject trades when spread is too wide for micro-profit

export const SPREAD_GATE = {
  maxSpreadPercent: 0.03,     // Skip trade if spread > 0.03%
  enabled: true,
};

// ── Kill Switch System ──

export interface KillSwitchState {
  hourlyPnl: number;
  hourlyPnlResetAt: number;
  dailyPnl: number;
  dailyPnlResetAt: number;
  weeklyPnl: number;
  weeklyPnlResetAt: number;
  consecutiveLosses: number;
  fillRate: number;            // rolling fill rate %
  fillRateWindow: number[];    // last N fill attempts: 1=filled, 0=missed
  isPaused: boolean;
  pauseReason: string;
  pauseUntil: number;          // timestamp when pause expires
}

export interface KillSwitchConfig {
  // PnL limits (% of initial wallet)
  maxHourlyLossPct: number;    // e.g. 2 = pause after 2% hourly loss
  maxDailyLossPct: number;     // e.g. 5 = stop after 5% daily loss
  maxWeeklyLossPct: number;    // e.g. 7 = manual review after 7% weekly loss
  
  // Streak protection
  maxConsecutiveLosses: number; // e.g. 10 = pause after 10 losses in a row
  
  // Fill rate monitoring
  minFillRatePct: number;      // e.g. 60 = widen TP if fill rate drops below 60%
  fillRateWindowSize: number;  // e.g. 50 = last 50 attempts
  
  // Account protection
  minAccountPct: number;       // e.g. 90 = stop everything if account drops to 90% of initial
  
  // Pause durations (ms)
  hourlyPauseMs: number;       // e.g. 30 * 60 * 1000 = 30 min pause
  streakPauseMs: number;       // e.g. 60 * 60 * 1000 = 1 hour pause
  dailyPauseMs: number;        // e.g. 24 * 60 * 60 * 1000 = 24 hour stop
}

export const DEFAULT_KILL_SWITCH_CONFIG: KillSwitchConfig = {
  maxHourlyLossPct: 2,
  maxDailyLossPct: 5,
  maxWeeklyLossPct: 7,
  maxConsecutiveLosses: 10,
  minFillRatePct: 60,
  fillRateWindowSize: 50,
  minAccountPct: 90,
  hourlyPauseMs: 30 * 60 * 1000,       // 30 min
  streakPauseMs: 60 * 60 * 1000,       // 1 hour
  dailyPauseMs: 24 * 60 * 60 * 1000,   // 24 hours
};

export function makeDefaultKillSwitchState(): KillSwitchState {
  return {
    hourlyPnl: 0,
    hourlyPnlResetAt: Date.now() + 3600000,
    dailyPnl: 0,
    dailyPnlResetAt: Date.now() + 86400000,
    weeklyPnl: 0,
    weeklyPnlResetAt: Date.now() + 604800000,
    consecutiveLosses: 0,
    fillRate: 100,
    fillRateWindow: [],
    isPaused: false,
    pauseReason: '',
    pauseUntil: 0,
  };
}

/**
 * Check kill switches after every closed trade.
 * Returns updated state + whether trading should continue.
 */
export function checkKillSwitches(
  ks: KillSwitchState,
  config: KillSwitchConfig,
  tradeResult: { pnl: number; isWin: boolean; wasFilled: boolean },
  walletBalance: number,
  initialWallet: number,
): { state: KillSwitchState; canTrade: boolean; action: string } {
  const now = Date.now();
  let state = { ...ks };
  
  // Reset time windows
  if (now >= state.hourlyPnlResetAt) {
    state.hourlyPnl = 0;
    state.hourlyPnlResetAt = now + 3600000;
  }
  if (now >= state.dailyPnlResetAt) {
    state.dailyPnl = 0;
    state.dailyPnlResetAt = now + 86400000;
  }
  if (now >= state.weeklyPnlResetAt) {
    state.weeklyPnl = 0;
    state.weeklyPnlResetAt = now + 604800000;
  }
  
  // Check if pause has expired
  if (state.isPaused && now >= state.pauseUntil) {
    state.isPaused = false;
    state.pauseReason = '';
    state.pauseUntil = 0;
    console.log('[KillSwitch] Pause expired, resuming trading');
  }
  
  // Already paused? Just return
  if (state.isPaused) {
    return { state, canTrade: false, action: `PAUSED: ${state.pauseReason} (until ${new Date(state.pauseUntil).toLocaleTimeString()})` };
  }
  
  // Update PnL tracking
  state.hourlyPnl += tradeResult.pnl;
  state.dailyPnl += tradeResult.pnl;
  state.weeklyPnl += tradeResult.pnl;
  
  // Update consecutive losses
  if (tradeResult.isWin) {
    state.consecutiveLosses = 0;
  } else {
    state.consecutiveLosses += 1;
  }
  
  // Update fill rate
  state.fillRateWindow.push(tradeResult.wasFilled ? 1 : 0);
  if (state.fillRateWindow.length > config.fillRateWindowSize) {
    state.fillRateWindow.shift();
  }
  state.fillRate = state.fillRateWindow.length > 0
    ? (state.fillRateWindow.reduce((a, b) => a + b, 0) / state.fillRateWindow.length) * 100
    : 100;
  
  // ── CHECK TRIGGERS ──
  
  // 1. Account below minimum
  const accountPct = (walletBalance / initialWallet) * 100;
  if (accountPct < config.minAccountPct) {
    state.isPaused = true;
    state.pauseReason = `Account at ${accountPct.toFixed(1)}% (min: ${config.minAccountPct}%) — MANUAL REVIEW REQUIRED`;
    state.pauseUntil = now + config.dailyPauseMs * 365; // effectively permanent until manual reset
    return { state, canTrade: false, action: 'KILL: Account below minimum' };
  }
  
  // 2. Weekly loss limit
  const weeklyLossPct = Math.abs(Math.min(0, state.weeklyPnl)) / initialWallet * 100;
  if (weeklyLossPct >= config.maxWeeklyLossPct) {
    state.isPaused = true;
    state.pauseReason = `Weekly loss ${weeklyLossPct.toFixed(1)}% — MANUAL REVIEW`;
    state.pauseUntil = now + config.dailyPauseMs * 365;
    return { state, canTrade: false, action: 'KILL: Weekly loss limit' };
  }
  
  // 3. Daily loss limit
  const dailyLossPct = Math.abs(Math.min(0, state.dailyPnl)) / initialWallet * 100;
  if (dailyLossPct >= config.maxDailyLossPct) {
    state.isPaused = true;
    state.pauseReason = `Daily loss ${dailyLossPct.toFixed(1)}% — stopped for 24h`;
    state.pauseUntil = now + config.dailyPauseMs;
    return { state, canTrade: false, action: 'STOP: Daily loss limit' };
  }
  
  // 4. Hourly loss limit
  const hourlyLossPct = Math.abs(Math.min(0, state.hourlyPnl)) / initialWallet * 100;
  if (hourlyLossPct >= config.maxHourlyLossPct) {
    state.isPaused = true;
    state.pauseReason = `Hourly loss ${hourlyLossPct.toFixed(1)}% — paused 30min`;
    state.pauseUntil = now + config.hourlyPauseMs;
    return { state, canTrade: false, action: 'PAUSE: Hourly loss limit' };
  }
  
  // 5. Consecutive losses
  if (state.consecutiveLosses >= config.maxConsecutiveLosses) {
    state.isPaused = true;
    state.pauseReason = `${state.consecutiveLosses} losses in a row — paused 1h`;
    state.pauseUntil = now + config.streakPauseMs;
    return { state, canTrade: false, action: 'PAUSE: Loss streak' };
  }
  
  // 6. Fill rate warning (don't pause, but flag)
  if (state.fillRate < config.minFillRatePct) {
    return { state, canTrade: true, action: `WARNING: Fill rate ${state.fillRate.toFixed(0)}% — consider widening TP` };
  }
  
  return { state, canTrade: true, action: 'OK' };
}

// ── Presets ──

export const MICRO_PROFIT_PRESETS = {
  conservative: {
    label: 'Conservative (0.2% TP)',
    config: {
      ...MICRO_PROFIT_CONFIG,
      stopLossPercent: 0.15,
      takeProfitPercent: 0.20,
      leverage: 10,
      timeoutMinutes: 0.5,
    },
    params: {
      ...MICRO_PROFIT_SCALP_PARAMS,
      minVolMultiple: 1.40,
      rsiLength: 3,
    },
  },
  balanced: {
    label: 'Balanced (0.15% TP)',
    config: {
      ...MICRO_PROFIT_CONFIG,
      stopLossPercent: 0.12,
      takeProfitPercent: 0.15,
      leverage: 15,
      timeoutMinutes: 0.5,
    },
    params: MICRO_PROFIT_SCALP_PARAMS,
  },
  aggressive: {
    label: 'Aggressive (0.10% TP)',
    config: {
      ...MICRO_PROFIT_CONFIG,
      stopLossPercent: 0.10,
      takeProfitPercent: 0.10,
      leverage: 20,
      minConfidence: 60,
      timeoutMinutes: 0.33, // 20 seconds
    },
    params: {
      ...MICRO_PROFIT_SCALP_PARAMS,
      emaFast: 3,
      emaMid: 5,
      rsiLength: 2,
      minVolMultiple: 1.15,
      bodyRatioMin: 0.45,
      cooldownMinutes: 0.15, // 9 seconds
    },
  },
} as const;
