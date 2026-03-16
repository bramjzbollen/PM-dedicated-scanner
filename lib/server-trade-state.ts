/**
 * Server-side Trade State Manager
 * 
 * Stores all trade state in JSON files on disk:
 *   public/v2-state-{mode}.json  — positions, closed, queue, stats, config
 * 
 * All trade logic (open, close, update prices) happens server-side.
 * Browsers only poll state and send actions.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// ── Types (shared with client) ──

export interface ServerPosition {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  previousPrice?: number;
  size: number;
  leverage: number;
  quantity: number;
  remainingQuantity: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  trailingActivated: boolean;
  peakPrice?: number;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  closeReason?: 'tp' | 'sl' | 'trailing' | 'manual' | 'timeout' | 'breakeven' | 'max_hold';
  pnl: number;
  pnlPercent: number;
  partialCloses: { price: number; quantity: number; pnl: number; reason: string; at: string }[];
  _breakEvenAt?: number;
  _breakEvenApplied?: boolean;
  _timeStopCandles?: number;
  _riskR?: number;
  confidence?: number;
  reason?: string;
}

export interface ServerStats {
  walletBalance: number;
  realizedPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  bestTrade: number;
  worstTrade: number;
  totalDurationMs: number;
  closedCount: number;
}

export interface ServerConfig {
  autoEntry: boolean;
  minConfidence: number;
  maxPositions: number;
  queueEnabled: boolean;
  positionSize: number;
  leverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
  trailingActivationPercent: number;
  timeoutMinutes?: number;
  cooldownMinutes?: number;
  maxHoldMinutes?: number;
  cooldownAfterLossMinutes?: number;
  reentryCooldownSameSymbolMinutes?: number;
  reentryCooldownLossMinutes?: number;
  latchCandles?: number;
  lossStreakLimit?: number;
  lossStreakPauseMinutes?: number;
  takeProfit2Percent?: number;
  partialClosePercent1?: number;
  partialClosePercent2?: number;
  entrySlippageBps?: number;
  exitSlippageBps?: number;
  takerFeeBps?: number;
}

export interface ServerQueueItem {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  price: number;
  queuedAt: string;
}

export interface RegimeConfig {
  enabled: boolean;
  neutralBandPct: number;
  hysteresisPct: number;
  neutralThrottleFactor: number;
  neutralConfidenceUplift: number;
  neutralSensitivity?: number;
  fallbackOnMissingData: 'neutral' | 'allow-all' | 'block-all';
  filterMode: 'strict' | 'signal-first';
  signalFirstDirectionalBlock: boolean;
  signalFirstDirectionalBlockMode?: 'hard' | 'soft';
  signalFirstDisableCooldown: boolean;
  signalFirstDisableLossStreak: boolean;
  signalFirstDisableLatch: boolean;
  signalFirstDisablePriceDriftCheck: boolean;
}

export interface RegimeState {
  status: 'bullish' | 'bearish' | 'neutral';
  source: 'btc-1h' | 'fallback';
  updatedAt: string;
  btcPrice?: number;
  ema50_1h?: number;
  ema200_1h?: number;
  ema50SlopePct?: number;
}

export interface RegimeTelemetry {
  blockedLongCount: number;
  blockedShortCount: number;
  neutralThrottleEvents: number;
  neutralConfidenceBlocks: number;
  neutralLastEntryTs: number;
}

export interface LoopTelemetry {
  topRepeatedSymbols: Array<{ symbol: string; count: number; avgGapSec: number }>;
  avgReentryGapSec: number;
  loopBlocks: number;
  lookbackMinutes: number;
}

export interface TradeState {
  mode: string;
  isRunning: boolean;
  initialWalletSize: number;
  positions: ServerPosition[];
  closedPositions: ServerPosition[];
  queue: ServerQueueItem[];
  stats: ServerStats;
  config: ServerConfig;
  regimeConfig: RegimeConfig;
  regimeState: RegimeState;
  regimeTelemetry: RegimeTelemetry;
  loopTelemetry: LoopTelemetry;
  lastUpdate: string;
  cooldowns: Record<string, { ts: number; reason: string }>;
  lossStreaks: Record<string, { count: number; blockedUntil: number }>;
  signalLatches: Record<string, { direction: 'LONG' | 'SHORT'; armed: boolean; armedAt?: number }>;
}

// ── Defaults ──

const DEFAULT_SCALP_CONFIG: ServerConfig = {
  autoEntry: true, minConfidence: 60, maxPositions: 8, queueEnabled: true,
  positionSize: 100, leverage: 15, stopLossPercent: 0.8, takeProfitPercent: 1.5,
  trailingStopPercent: 0.6, trailingActivationPercent: 1.0,
  maxHoldMinutes: 12,
  cooldownAfterLossMinutes: 2,
  reentryCooldownSameSymbolMinutes: 1,
  reentryCooldownLossMinutes: 5,
  latchCandles: 3,
  lossStreakLimit: 3,
  lossStreakPauseMinutes: 18,
  entrySlippageBps: 2,
  exitSlippageBps: 2,
  takerFeeBps: 10,
};

const DEFAULT_SWING_CONFIG: ServerConfig = {
  autoEntry: true, minConfidence: 65, maxPositions: 8, queueEnabled: true,
  positionSize: 100, leverage: 15, stopLossPercent: 1.5, takeProfitPercent: 2.5,
  trailingStopPercent: 1.0, trailingActivationPercent: 1.5,
  entrySlippageBps: 3,
  exitSlippageBps: 3,
  takerFeeBps: 10,
};

const DEFAULT_WALLET = 1000;
const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  enabled: true,
  neutralBandPct: 0.35,
  hysteresisPct: 0.15,
  neutralThrottleFactor: 0.30,
  neutralConfidenceUplift: 10,
  neutralSensitivity: 0.58,
  fallbackOnMissingData: 'neutral',
  filterMode: 'signal-first',
  signalFirstDirectionalBlock: true,
  signalFirstDirectionalBlockMode: 'soft',
  signalFirstDisableCooldown: false,
  signalFirstDisableLossStreak: false,
  signalFirstDisableLatch: false,
  signalFirstDisablePriceDriftCheck: true,
};
const DEFAULT_REGIME_STATE: RegimeState = {
  status: 'neutral',
  source: 'fallback',
  updatedAt: '',
};
const DEFAULT_REGIME_TELEMETRY: RegimeTelemetry = {
  blockedLongCount: 0,
  blockedShortCount: 0,
  neutralThrottleEvents: 0,
  neutralConfidenceBlocks: 0,
  neutralLastEntryTs: 0,
};
const LOOP_LOOKBACK_MS = 60 * 60 * 1000;
const DEFAULT_LOOP_TELEMETRY: LoopTelemetry = {
  topRepeatedSymbols: [],
  avgReentryGapSec: 0,
  loopBlocks: 0,
  lookbackMinutes: Math.round(LOOP_LOOKBACK_MS / 60000),
};
const QUEUE_EXPIRY_MS = 5 * 60 * 1000;
const REENTRY_RACE_GUARD_MS = 1500;
const MIN_POSITIONS = 2;
const MAX_POSITIONS_CAP = 20;
const DEFAULT_MAX_HOLD_SCALP_MS = 4 * 60 * 1000;
const HARD_MAX_HOLD_SCALP_CAP_MS = 20 * 60 * 1000;
const MIN_MAX_HOLD_SCALP_MS = 2 * 60 * 1000;

function makeDefaultState(mode: string): TradeState {
  const isSwing = mode.includes('swing');
  return {
    mode,
    isRunning: false,
    initialWalletSize: DEFAULT_WALLET,
    positions: [],
    closedPositions: [],
    queue: [],
    stats: {
      walletBalance: DEFAULT_WALLET, realizedPnl: 0, totalTrades: 0,
      winCount: 0, lossCount: 0, bestTrade: 0, worstTrade: 0,
      totalDurationMs: 0, closedCount: 0,
    },
    config: isSwing ? DEFAULT_SWING_CONFIG : DEFAULT_SCALP_CONFIG,
    regimeConfig: { ...DEFAULT_REGIME_CONFIG },
    regimeState: { ...DEFAULT_REGIME_STATE },
    regimeTelemetry: { ...DEFAULT_REGIME_TELEMETRY },
    loopTelemetry: { ...DEFAULT_LOOP_TELEMETRY },
    lastUpdate: new Date().toISOString(),
    cooldowns: {},
    lossStreaks: {},
    signalLatches: {},
  };
}

// ── File I/O ──

// Store state OUTSIDE the Next.js build directory to survive rebuilds
// Falls back to public/ if the parent dir doesn't exist
const STATE_DIR = join(process.cwd(), '..', 'trade-state');
const STATE_DIR_FALLBACK = join(process.cwd(), 'public');

async function ensureStateDir(): Promise<string> {
  try {
    if (!existsSync(STATE_DIR)) {
      await mkdir(STATE_DIR, { recursive: true });
    }
    return STATE_DIR;
  } catch {
    return STATE_DIR_FALLBACK;
  }
}

function stateFilePath(dir: string, mode: string): string {
  return join(dir, `v2-state-${mode}.json`);
}

// In-memory state: PRIMARY source of truth
// File is persistence backup, loaded only on cold start (server restart)
const stateCache: Record<string, TradeState> = {};

function withStateDefaults(state: TradeState): TradeState {
  const rawRegimeConfig = { ...DEFAULT_REGIME_CONFIG, ...(state as any).regimeConfig };
  const baseConfig = state.mode.includes('swing') ? DEFAULT_SWING_CONFIG : DEFAULT_SCALP_CONFIG;
  const mergedConfig = { ...baseConfig, ...(state as any).config };

  // Migrate older pre-profile states to Rover Profiel A defaults for 1m V2 scalp.
  const looksLegacyRegime = !('signalFirstDirectionalBlockMode' in ((state as any).regimeConfig || {}));
  const regimeConfig = state.mode === 'v2-scalping' && looksLegacyRegime
    ? { ...DEFAULT_REGIME_CONFIG, ...rawRegimeConfig, filterMode: 'signal-first', signalFirstDirectionalBlockMode: 'soft' }
    : rawRegimeConfig;

  return {
    ...state,
    config: mergedConfig,
    regimeConfig,
    regimeState: { ...DEFAULT_REGIME_STATE, ...(state as any).regimeState },
    regimeTelemetry: { ...DEFAULT_REGIME_TELEMETRY, ...(state as any).regimeTelemetry },
    loopTelemetry: { ...DEFAULT_LOOP_TELEMETRY, ...(state as any).loopTelemetry },
  };
}

export async function loadState(mode: string): Promise<TradeState> {
  // Memory cache is the source of truth once populated
  if (stateCache[mode]) {
    return stateCache[mode];
  }

  // Cold start: load from file
  const dir = await ensureStateDir();
  const filePath = stateFilePath(dir, mode);

  try {
    const raw = await readFile(filePath, 'utf-8');
    const state = JSON.parse(raw);
    if (state && state.mode && state.stats && typeof state.stats.walletBalance === 'number') {
      const hydrated = withStateDefaults(state);
      stateCache[mode] = hydrated;
      return hydrated;
    }
  } catch {}

  // Try fallback location
  try {
    const fallbackPath = join(STATE_DIR_FALLBACK, `v2-state-${mode}.json`);
    const raw = await readFile(fallbackPath, 'utf-8');
    const state = JSON.parse(raw);
    if (state && state.mode && state.stats && state.stats.walletBalance !== undefined) {
      const hydrated = withStateDefaults(state);
      stateCache[mode] = hydrated;
      return hydrated;
    }
  } catch {}

  // No file found: create defaults
  const defaultState = makeDefaultState(mode);
  stateCache[mode] = defaultState;
  return defaultState;
}

async function saveStateToDir(dir: string, state: TradeState): Promise<void> {
  const filePath = stateFilePath(dir, state.mode);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(state));
  const { rename: renameFile } = await import('node:fs/promises');
  await renameFile(tmp, filePath);
}

export async function saveState(state: TradeState, _isExplicitAction = false): Promise<void> {
  // Always update memory cache (source of truth)
  stateCache[state.mode] = state;

  // Persist to file (best-effort)
  try {
    const dir = await ensureStateDir();
    await saveStateToDir(dir, state);
  } catch (err) {
    console.error(`[trade-state] File write failed for ${state.mode}:`, err);
  }
}

// ── Helpers ──

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getEffectiveMaxPositions(walletBalance: number, positionSize: number, configMax: number): number {
  if (positionSize <= 0) return configMax;
  const walletSlots = Math.floor(walletBalance / positionSize);
  return Math.min(Math.max(walletSlots, MIN_POSITIONS), Math.min(configMax, MAX_POSITIONS_CAP));
}

function isOnCooldown(cooldowns: Record<string, { ts: number; reason: string }>, symbol: string, cfg: ServerConfig): boolean {
  const entry = cooldowns[symbol];
  if (!entry) return false;
  const elapsed = Date.now() - entry.ts;
  const sameSymbolMs = Math.max(0, cfg.reentryCooldownSameSymbolMinutes ?? 1) * 60 * 1000;
  const afterLossMs = Math.max(0, cfg.reentryCooldownLossMinutes ?? 5) * 60 * 1000;
  const cooldownAfterLossMs = Math.max(0, cfg.cooldownAfterLossMinutes ?? 2) * 60 * 1000;
  const isLoss = entry.reason === 'sl';
  const blockMs = isLoss
    ? Math.max(afterLossMs, cooldownAfterLossMs)
    : sameSymbolMs;
  if (elapsed > blockMs) {
    delete cooldowns[symbol];
    return false;
  }
  return true;
}

function applySlippage(price: number, direction: 'LONG' | 'SHORT', bps: number, isEntry: boolean): number {
  const slip = Math.max(0, bps || 0) / 10_000;
  if (slip === 0) return price;
  if (direction === 'LONG') return isEntry ? price * (1 + slip) : price * (1 - slip);
  return isEntry ? price * (1 - slip) : price * (1 + slip);
}

function calcPnl(pos: ServerPosition, currentPrice: number) {
  const priceChange = pos.direction === 'LONG'
    ? currentPrice - pos.entryPrice
    : pos.entryPrice - currentPrice;
  const pnlPercent = (priceChange / pos.entryPrice) * 100;
  const pnl = pos.remainingQuantity * priceChange;
  return { pnl, pnlPercent };
}

function calcPartialPnl(pos: ServerPosition): number {
  return pos.partialCloses.reduce((sum, pc) => sum + pc.pnl, 0);
}

function computeLoopSnapshot(closedPositions: ServerPosition[]) {
  const cutoff = Date.now() - LOOP_LOOKBACK_MS;
  const rows = closedPositions
    .map((p) => ({ symbol: p.symbol, ts: new Date(p.openedAt).getTime() }))
    .filter((r) => r.symbol && Number.isFinite(r.ts) && r.ts >= cutoff);

  const bySymbol = new Map<string, number[]>();
  for (const row of rows) {
    const arr = bySymbol.get(row.symbol) || [];
    arr.push(row.ts);
    bySymbol.set(row.symbol, arr);
  }

  const repeated: Array<{ symbol: string; count: number; avgGapSec: number; sinceLastOpenMs: number }> = [];
  const allGapsSec: number[] = [];

  for (const [symbol, times] of bySymbol.entries()) {
    if (times.length < 2) continue;
    const sorted = [...times].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / 1000);
    const avgGapSec = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    allGapsSec.push(...gaps);
    repeated.push({ symbol, count: times.length, avgGapSec, sinceLastOpenMs: Date.now() - sorted[sorted.length - 1] });
  }

  repeated.sort((a, b) => b.count - a.count || a.avgGapSec - b.avgGapSec);
  const avgReentryGapSec = allGapsSec.length > 0
    ? allGapsSec.reduce((s, g) => s + g, 0) / allGapsSec.length
    : 0;

  return {
    repeated,
    telemetryTop: repeated.slice(0, 5).map(r => ({ symbol: r.symbol, count: r.count, avgGapSec: Math.round(r.avgGapSec * 10) / 10 })),
    avgReentryGapSec: Math.round(avgReentryGapSec * 10) / 10,
  };
}

function readMarketRegimeSnapshot(): Partial<RegimeState> | null {
  try {
    const filePath = join(process.cwd(), 'public', 'market-regime.json');
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const status = parsed?.regime;
    if (status !== 'bullish' && status !== 'bearish' && status !== 'neutral') return null;
    return {
      status,
      source: 'btc-1h',
      updatedAt: parsed?.updatedAt || new Date().toISOString(),
      btcPrice: typeof parsed?.btcPrice === 'number' ? parsed.btcPrice : undefined,
      ema50_1h: typeof parsed?.ema50_1h === 'number' ? parsed.ema50_1h : undefined,
      ema200_1h: typeof parsed?.ema200_1h === 'number' ? parsed.ema200_1h : undefined,
      ema50SlopePct: typeof parsed?.ema50SlopePct === 'number' ? parsed.ema50SlopePct : undefined,
    };
  } catch {
    return null;
  }
}

function resolveRegimeState(state: TradeState): TradeState {
  const snap = readMarketRegimeSnapshot();
  if (snap) {
    return { ...state, regimeState: { ...state.regimeState, ...snap, source: 'btc-1h' } };
  }

  const fallback = state.regimeConfig.fallbackOnMissingData;
  // allow-all: treat as neutral but mark source so processSignals can skip all regime gates
  // block-all: treat as bearish (blocks longs) — processSignals line 816 also hard-blocks everything
  // neutral: standard neutral with throttling
  let fallbackStatus: RegimeState['status'] = 'neutral';
  if (fallback === 'block-all') fallbackStatus = 'bearish';

  return {
    ...state,
    regimeState: {
      ...state.regimeState,
      status: fallbackStatus,
      source: 'fallback',
      updatedAt: new Date().toISOString(),
    },
  };
}

// ── Actions ──

export function createPosition(
  state: TradeState, symbol: string, direction: 'LONG' | 'SHORT',
  price: number, trade?: { stopLoss: number; takeProfit: number; takeProfitStrong?: number; breakEvenAt: number; riskR: number; timeStopCandles: number; isStrongSetup?: boolean },
  confidence?: number, reason?: string,
): ServerPosition {
  const cfg = state.config;
  const entryPriceFilled = applySlippage(price, direction, cfg.entrySlippageBps || 0, true);
  const effectiveSize = cfg.positionSize * cfg.leverage;
  const quantity = effectiveSize / entryPriceFilled;
  let stopLoss: number, takeProfit: number;
  const isSwing = state.mode.includes('swing');
  const MIN_SL_PCT = isSwing ? 0.010 : 0.008; // Min SL: 1.0% swing, 0.8% scalp (matches config defaults)

  if (trade && trade.stopLoss > 0 && trade.takeProfit > 0 && trade.riskR > 0) { // Use scanner ATR-based SL/TP for all modes when available
    stopLoss = trade.stopLoss;
    takeProfit = trade.isStrongSetup && trade.takeProfitStrong ? trade.takeProfitStrong : trade.takeProfit;

    // Enforce minimum SL distance even with scanner-provided values
    const slDistance = Math.abs(entryPriceFilled - stopLoss);
    const minSlDistance = entryPriceFilled * MIN_SL_PCT;
    if (slDistance < minSlDistance) {
      stopLoss = direction === 'LONG' ? entryPriceFilled - minSlDistance : entryPriceFilled + minSlDistance;
    }
  } else {
    const slPct = cfg.stopLossPercent / 100;
    const tpPct = cfg.takeProfitPercent / 100;
    stopLoss = direction === 'LONG' ? entryPriceFilled * (1 - slPct) : entryPriceFilled * (1 + slPct);
    takeProfit = direction === 'LONG' ? entryPriceFilled * (1 + tpPct) : entryPriceFilled * (1 - tpPct);
  }

  return {
    id: genId(), symbol, direction, entryPrice: entryPriceFilled, currentPrice: entryPriceFilled,
    size: effectiveSize, leverage: cfg.leverage, quantity, remainingQuantity: quantity,
    stopLoss, takeProfit, trailingActivated: false, openedAt: new Date().toISOString(),
    status: 'open', pnl: 0, pnlPercent: 0, partialCloses: [],
    _breakEvenAt: trade?.breakEvenAt, _breakEvenApplied: false,
    _timeStopCandles: trade?.timeStopCandles || (state.mode.includes('swing') ? 8 : 6),
    _riskR: trade?.riskR || 0,
    confidence, reason,
  };
}

export function closePosition(state: TradeState, posId: string, reason: string, currentPrice: number): TradeState {
  const pos = state.positions.find(p => p.id === posId);
  if (!pos) return state;

  const exitPriceFilled = applySlippage(currentPrice, pos.direction, state.config.exitSlippageBps || 0, false);
  const { pnl, pnlPercent } = calcPnl(pos, exitPriceFilled);
  const grossPnl = pnl + calcPartialPnl(pos);
  const notional = (Math.abs(pos.entryPrice * pos.quantity) + Math.abs(exitPriceFilled * pos.remainingQuantity));
  const fee = notional * ((state.config.takerFeeBps || 0) / 10_000);
  const totalPnl = grossPnl - fee;
  const duration = Date.now() - new Date(pos.openedAt).getTime();
  const isWin = totalPnl > 0;

  // Breakeven tolerance: account for entry/exit slippage (2+2 bps) + taker fees (10 bps) = ~14 bps total
  const beTolerance = pos.entryPrice * 0.0015; // 15 bps tolerance
  const isNearFlat = Math.abs(totalPnl) < 0.05 || Math.abs(exitPriceFilled - pos.entryPrice) <= beTolerance;
  const effectiveReason: ServerPosition['closeReason'] =
    reason === 'sl' && isNearFlat && (pos._breakEvenApplied || Math.abs(pos.stopLoss - pos.entryPrice) <= (pos.entryPrice * 0.0001))
      ? 'breakeven'
      : (reason as ServerPosition['closeReason']);

  const closedPos: ServerPosition = {
    ...pos, currentPrice: exitPriceFilled, status: 'closed',
    closeReason: effectiveReason,
    closedAt: new Date().toISOString(), pnl: totalPnl, pnlPercent,
  };

  // Set cooldown
  state.cooldowns[pos.symbol] = { ts: Date.now(), reason: effectiveReason || reason };

  // Track loss streaks per symbol
  const streaks = { ...(state.lossStreaks || {}) };
  if (effectiveReason === 'sl') {
    const existing = streaks[pos.symbol] || { count: 0, blockedUntil: 0 };
    existing.count += 1;
    const streakLimit = Math.max(1, state.config.lossStreakLimit ?? 3);
    const pauseMinutes = Math.max(1, state.config.lossStreakPauseMinutes ?? 18);
    if (existing.count >= streakLimit) {
      existing.blockedUntil = Date.now() + (pauseMinutes * 60 * 1000);
      console.log(`[trade-state] ${pos.symbol} blocked for ${pauseMinutes}min after ${existing.count} consecutive SL hits`);
    }
    streaks[pos.symbol] = existing;
  } else if (effectiveReason === 'tp' || effectiveReason === 'trailing' || effectiveReason === 'breakeven') {
    // Win/flat reset the streak
    delete streaks[pos.symbol];
  }

  return {
    ...state,
    positions: state.positions.filter(p => p.id !== posId),
    closedPositions: [closedPos, ...state.closedPositions].slice(0, 500),
    lossStreaks: streaks,
    stats: {
      walletBalance: state.stats.walletBalance + totalPnl,
      realizedPnl: state.stats.realizedPnl + totalPnl,
      totalTrades: state.stats.totalTrades,
      winCount: state.stats.winCount + (isWin ? 1 : 0),
      lossCount: state.stats.lossCount + (isWin ? 0 : 1),
      bestTrade: Math.max(state.stats.bestTrade, totalPnl),
      worstTrade: Math.min(state.stats.worstTrade, totalPnl),
      totalDurationMs: state.stats.totalDurationMs + duration,
      closedCount: state.stats.closedCount + 1,
    },
    lastUpdate: new Date().toISOString(),
  };
}

export function enforceHardMaxHold(state: TradeState): TradeState {
  if (state.mode !== 'v2-scalping' || state.positions.length === 0) return state;

  const configuredMs = Math.round((state.config.maxHoldMinutes || 4) * 60 * 1000);
  const effectiveMaxHoldMs = Math.min(
    HARD_MAX_HOLD_SCALP_CAP_MS,
    Math.max(MIN_MAX_HOLD_SCALP_MS, configuredMs || DEFAULT_MAX_HOLD_SCALP_MS),
  );

  const now = Date.now();
  const overdue = state.positions.filter((p) => {
    const openedAtMs = new Date(p.openedAt).getTime();
    return Number.isFinite(openedAtMs) && (now - openedAtMs) >= effectiveMaxHoldMs;
  });

  if (overdue.length === 0) return state;

  let next = state;
  for (const pos of overdue) {
    console.warn(`[${state.mode}] Hard max-hold close: ${pos.symbol} (${Math.round((now - new Date(pos.openedAt).getTime()) / 1000)}s, cap=${Math.round(effectiveMaxHoldMs / 1000)}s)`);
    next = closePosition(next, pos.id, 'max_hold', pos.currentPrice || pos.entryPrice);
  }
  return next;
}

export function updatePricesAndCheckExits(state: TradeState, prices: Record<string, number>): TradeState {
  const cfg = state.config;
  const isSwing = state.mode.includes('swing');
  const toClose: { id: string; reason: string; price: number }[] = [];

  let updatedPositions = state.positions.map(pos => {
    const price = prices[pos.symbol] || pos.currentPrice;
    const updated: ServerPosition = { ...pos, previousPrice: pos.currentPrice, currentPrice: price };

    // Trailing stop update
    if (updated.trailingActivated && updated.peakPrice != null) {
      const isLong = updated.direction === 'LONG';
      const trailingPct = cfg.trailingStopPercent / 100;
      if (isLong) {
        updated.peakPrice = Math.max(updated.peakPrice, price);
        updated.trailingStop = Math.max(updated.trailingStop || 0, updated.peakPrice * (1 - trailingPct));
      } else {
        updated.peakPrice = Math.min(updated.peakPrice, price);
        updated.trailingStop = updated.trailingStop
          ? Math.min(updated.trailingStop, updated.peakPrice * (1 + trailingPct))
          : updated.peakPrice * (1 + trailingPct);
      }
    }

    // P&L
    const { pnl, pnlPercent } = calcPnl(updated, price);
    updated.pnl = pnl + calcPartialPnl(updated);
    updated.pnlPercent = pnlPercent;

    // Exit checks
    const posAge = Date.now() - new Date(updated.openedAt).getTime();
    const graceMs = isSwing ? 45000 : 5000;  // V10: scalp grace 5s, swing 45s
    if (posAge >= graceMs) {
      const isLong = updated.direction === 'LONG';

      // SL
      if (isLong ? price <= updated.stopLoss : price >= updated.stopLoss) {
        toClose.push({ id: pos.id, reason: 'sl', price: updated.stopLoss }); return updated;  // V11: exit at SL limit
      }
      // Trailing
      if (updated.trailingActivated && updated.trailingStop != null) {
        if (isLong ? price <= updated.trailingStop : price >= updated.trailingStop) {
          toClose.push({ id: pos.id, reason: 'trailing', price }); return updated;
        }
      }
      // TP
      if (isLong ? price >= updated.takeProfit : price <= updated.takeProfit) {
        toClose.push({ id: pos.id, reason: 'tp', price: updated.takeProfit }); return updated;  // V11: exit at TP limit
      }
      // Break-even
      if (updated._breakEvenAt && !updated._breakEvenApplied) {
        const reachedBE = isLong ? price >= updated._breakEvenAt : price <= updated._breakEvenAt;
        if (reachedBE) { updated.stopLoss = updated.entryPrice; updated._breakEvenApplied = true; }
      }
      // Enhanced time stop: sliding threshold — the longer a position is held past time stop,
      // the HIGHER the profit threshold required to keep it open.
      // At 1x timeStopCandles: need 0.5R to stay open
      // At 1.5x: need 0.75R
      // At 2x+: close unconditionally (position is dead weight)
      const candleDurationMs = isSwing ? 15 * 60 * 1000 : 60 * 1000;
      const timeStopMs = (updated._timeStopCandles || (isSwing ? 8 : 6)) * candleDurationMs;
      if (posAge >= timeStopMs) {
        const pct = isLong
          ? ((price - updated.entryPrice) / updated.entryPrice) * 100
          : ((updated.entryPrice - price) / updated.entryPrice) * 100;
        const ageRatio = Math.min(2, posAge / timeStopMs); // 1.0 at threshold, 2.0 at 2x
        const rPctBase = updated._riskR && updated._riskR > 0
          ? ((updated._riskR) / updated.entryPrice) * 100 : 0.4;
        // Sliding: 0.5R at 1x, 0.75R at 1.5x, unconditional close at 2x
        const requiredPct = ageRatio >= 2 ? Infinity : rPctBase * (0.25 + 0.25 * ageRatio);
        if (pct < requiredPct) { toClose.push({ id: pos.id, reason: 'timeout', price }); return updated; }
      }
      // Trailing activation
      if (!updated.trailingActivated) {
        const pct = isLong
          ? ((price - updated.entryPrice) / updated.entryPrice) * 100
          : ((updated.entryPrice - price) / updated.entryPrice) * 100;
        if (pct >= (cfg.trailingActivationPercent || 1)) {
          updated.trailingActivated = true; updated.peakPrice = price;
          const tp = cfg.trailingStopPercent / 100;
          updated.trailingStop = isLong ? price * (1 - tp) : price * (1 + tp);
        }
      }
    }
    return updated;
  });

  let newState = { ...state, positions: updatedPositions, lastUpdate: new Date().toISOString() };
  for (const { id, reason, price } of toClose) {
    newState = closePosition(newState, id, reason, price);
  }
  return newState;
}

export function processSignals(
  state: TradeState,
  signals: Array<{ symbol: string; signal: string; confidence: number; reason: string; price: number; skipTrade?: boolean; trade?: any }>,
  prices: Record<string, number>,
  cooldownMs: number,
): TradeState {
  if (!state.isRunning || !state.config.autoEntry) return state;

  const cfg = state.config;

  // Daily loss guard: stop opening new positions when daily realized loss exceeds threshold
  // Uses walletBalance drawdown from initialWalletSize as proxy for daily loss
  const dailyLossLimitPct = 5; // 5% of wallet = hard stop
  const dailyLossLimitUsd = state.initialWalletSize * (dailyLossLimitPct / 100);
  const currentDrawdown = state.initialWalletSize - state.stats.walletBalance;
  if (currentDrawdown >= dailyLossLimitUsd && state.stats.closedCount > 0) {
    return state; // Breaker tripped: no new entries until reset
  }
  const effectiveMax = getEffectiveMaxPositions(state.stats.walletBalance, cfg.positionSize, cfg.maxPositions);
  let newState = resolveRegimeState({ ...state, signalLatches: { ...(state.signalLatches || {}) } });
  const regimeCfg = newState.regimeConfig || DEFAULT_REGIME_CONFIG;
  const regime = newState.regimeState?.status || 'neutral';
  const signalFirst = regimeCfg.filterMode === 'signal-first';
  // allow-all fallback: bypass ALL regime gates (directional block, neutral throttle, confidence uplift)
  const isFallbackAllowAll = newState.regimeState?.source === 'fallback' && regimeCfg.fallbackOnMissingData === 'allow-all';
  const applyDirectionalRegimeBlock = !isFallbackAllowAll && regimeCfg.enabled && state.mode === 'v2-scalping' && (!signalFirst || regimeCfg.signalFirstDirectionalBlock);
  const applyNeutralThrottle = !isFallbackAllowAll && regimeCfg.enabled && state.mode === 'v2-scalping' && !signalFirst;
  const neutralConfidenceUplift = (!isFallbackAllowAll && regimeCfg.enabled && state.mode === 'v2-scalping' && !signalFirst)
    ? Math.max(0, regimeCfg.neutralConfidenceUplift || 0)
    : 0;
  const applyCooldown = !(signalFirst && regimeCfg.signalFirstDisableCooldown);
  const applyLossStreakBlock = !(signalFirst && regimeCfg.signalFirstDisableLossStreak);
  const applySignalLatch = !(signalFirst && regimeCfg.signalFirstDisableLatch);
  const applyPriceDriftCheck = !(signalFirst && regimeCfg.signalFirstDisablePriceDriftCheck);
  const loopSnapshot = computeLoopSnapshot(newState.closedPositions || []);
  const loopBlockBySymbol = new Map(loopSnapshot.repeated.map((r) => [r.symbol, r]));
  let loopBlocks = 0;

  // Queue drain
  if (newState.queue.length > 0) {
    const availableSlots = effectiveMax - newState.positions.length;
    if (availableSlots > 0) {
      const toFill = newState.queue.slice(0, availableSlots);
      const remaining = newState.queue.slice(availableSlots);

      for (const qi of toFill) {
        if (applyCooldown && isOnCooldown(newState.cooldowns, qi.symbol, cfg)) continue;

        if (applyDirectionalRegimeBlock) {
          const softDirectional = signalFirst && regimeCfg.signalFirstDirectionalBlockMode === 'soft';
          const canPassSoft = softDirectional && qi.confidence >= (cfg.minConfidence + 12);
          if (regime === 'bullish' && qi.direction === 'SHORT' && !canPassSoft) { newState.regimeTelemetry.blockedShortCount += 1; continue; }
          if (regime === 'bearish' && qi.direction === 'LONG' && !canPassSoft) { newState.regimeTelemetry.blockedLongCount += 1; continue; }
        }
        if (applyNeutralThrottle && regime === 'neutral') {
          // Keep neutral throttle compact and independent from per-symbol cooldown.
          // Per-symbol cooldown already handles fast re-entries; this is only a global pacing gate.
          const minNeutralIntervalMs = Math.min(90_000, Math.max(3_000, 30_000 * Math.max(regimeCfg.neutralThrottleFactor, 0.1)));
          const sinceLast = Date.now() - (newState.regimeTelemetry.neutralLastEntryTs || 0);
          if (sinceLast < minNeutralIntervalMs) { newState.regimeTelemetry.neutralThrottleEvents += 1; continue; }
        }

        const price = prices[qi.symbol] || qi.price;
        const pos = createPosition(newState, qi.symbol, qi.direction, price);
        if (!newState.positions.some(p => p.symbol === qi.symbol) && newState.positions.length < effectiveMax) {
          newState.positions = [...newState.positions, pos];
          newState.stats = { ...newState.stats, totalTrades: newState.stats.totalTrades + 1 };
          newState.signalLatches[qi.symbol] = { direction: qi.direction, armed: true, armedAt: Date.now() };
          if (applyNeutralThrottle && regime === 'neutral') {
            newState.regimeTelemetry.neutralLastEntryTs = Date.now();
          }
        }
      }
      newState.queue = remaining;
    }
  }

  // Auto-entry from signals
  const activeSymbols = new Set([...newState.positions.map(p => p.symbol), ...newState.queue.map(q => q.symbol)]);
  const pendingSymbols = new Set<string>();

  for (const sig of signals) {
    if (!sig.symbol) continue;

    if (sig.signal === 'NEUTRAL') {
      delete newState.signalLatches[sig.symbol];
      continue;
    }

    if (sig.skipTrade) continue;

    const latch = newState.signalLatches[sig.symbol];
    const latchMs = Math.max(0, (cfg.latchCandles ?? 3) * 60 * 1000);
    if (applySignalLatch && latch?.armed && latch.direction === sig.signal) {
      const latchAge = Date.now() - (latch.armedAt || 0);
      if (!latch.armedAt || latchAge < latchMs) continue;
      delete newState.signalLatches[sig.symbol];
    }

    if (activeSymbols.has(sig.symbol)) continue;

    const minConfidenceRequired = regimeCfg.enabled && state.mode === 'v2-scalping' && regime === 'neutral'
      ? cfg.minConfidence + neutralConfidenceUplift
      : cfg.minConfidence;
    if (sig.confidence < minConfidenceRequired) {
      if (regimeCfg.enabled && state.mode === 'v2-scalping' && regime === 'neutral') {
        newState.regimeTelemetry.neutralConfidenceBlocks += 1;
      }
      continue;
    }

    if (regimeCfg.enabled && state.mode === 'v2-scalping') {
      if (regimeCfg.fallbackOnMissingData === 'block-all' && newState.regimeState.source === 'fallback') {
        if (sig.signal === 'LONG') newState.regimeTelemetry.blockedLongCount += 1;
        if (sig.signal === 'SHORT') newState.regimeTelemetry.blockedShortCount += 1;
        continue;
      }

      if (applyDirectionalRegimeBlock) {
        const softDirectional = signalFirst && regimeCfg.signalFirstDirectionalBlockMode === 'soft';
        const canPassSoft = softDirectional && sig.confidence >= (cfg.minConfidence + 12);
        if (regime === 'bullish' && sig.signal === 'SHORT' && !canPassSoft) {
          newState.regimeTelemetry.blockedShortCount += 1;
          continue;
        }
        if (regime === 'bearish' && sig.signal === 'LONG' && !canPassSoft) {
          newState.regimeTelemetry.blockedLongCount += 1;
          continue;
        }
      }

      if (applyNeutralThrottle && regime === 'neutral') {
        const minNeutralIntervalMs = Math.min(90_000, Math.max(3_000, 30_000 * Math.max(regimeCfg.neutralThrottleFactor, 0.1)));
        const sinceLast = Date.now() - (newState.regimeTelemetry.neutralLastEntryTs || 0);
        if (sinceLast < minNeutralIntervalMs) {
          newState.regimeTelemetry.neutralThrottleEvents += 1;
          continue;
        }
      }
    }

    const recentClose = newState.cooldowns[sig.symbol];
    if (recentClose && (Date.now() - recentClose.ts) < REENTRY_RACE_GUARD_MS) continue;
    if (applyCooldown && isOnCooldown(newState.cooldowns, sig.symbol, cfg)) continue;
    if (pendingSymbols.has(sig.symbol)) continue;

    // Anti-loop guard: if a symbol keeps repeating, require a longer re-entry gap.
    // Keeps rotation healthy without touching hard safety/risk caps.
    if (state.mode === 'v2-scalping') {
      const loopInfo = loopBlockBySymbol.get(sig.symbol);
      if (loopInfo && loopInfo.count >= 3) {
        const dynamicGapMs = Math.min(10 * 60 * 1000, Math.max(4 * 60 * 1000, Math.round(loopInfo.avgGapSec * 1000 * 1.5)));
        if (loopInfo.sinceLastOpenMs < dynamicGapMs) {
          loopBlocks += 1;
          continue;
        }
      }
    }

    // Block symbols on a loss streak (optional in signal-first)
    const streak = (newState.lossStreaks || {})[sig.symbol];
    if (applyLossStreakBlock && streak && streak.blockedUntil > Date.now()) continue;
    // Clear expired streaks
    if (streak && streak.blockedUntil <= Date.now()) {
      delete newState.lossStreaks[sig.symbol];
    }

    const openCount = newState.positions.length + pendingSymbols.size;
    if (openCount < effectiveMax) {
      const livePrice = prices[sig.symbol] || sig.price || 0;
      if (livePrice <= 0) continue;

      // V3: Price Confirmation Gate - skip if scanner price is stale (optional in signal-first)
      const scannerPrice = sig.price || 0;
      if (applyPriceDriftCheck && scannerPrice > 0 && livePrice > 0) {
        const priceDrift = Math.abs(livePrice - scannerPrice) / scannerPrice;
        if (priceDrift > 0.001) continue;  // >0.1% drift = stale signal, skip
      }

      // V3: Direction confirmation - live price must confirm direction (optional in signal-first)
      const isLong = sig.signal === 'LONG';
      if (applyPriceDriftCheck && scannerPrice > 0) {
        if (isLong && livePrice < scannerPrice * 0.999) continue;   // price dropped since signal
        if (!isLong && livePrice > scannerPrice * 1.001) continue;  // price rose since signal
      }

      pendingSymbols.add(sig.symbol);
      const validTrade = sig.trade && sig.trade.riskR > 0 ? sig.trade : undefined;
      const pos = createPosition(newState, sig.symbol, sig.signal as 'LONG' | 'SHORT', livePrice, validTrade, sig.confidence, sig.reason);
      if (!newState.positions.some(p => p.symbol === sig.symbol)) {
        newState.positions = [...newState.positions, pos];
        newState.stats = { ...newState.stats, totalTrades: newState.stats.totalTrades + 1 };
        newState.signalLatches[sig.symbol] = { direction: sig.signal as 'LONG' | 'SHORT', armed: true, armedAt: Date.now() };
        if (applyNeutralThrottle && regime === 'neutral') {
          newState.regimeTelemetry.neutralLastEntryTs = Date.now();
        }
      }
    } else if (cfg.queueEnabled && newState.queue.length < 20) {
      pendingSymbols.add(sig.symbol);
      newState.queue = [...newState.queue, {
        id: genId(), symbol: sig.symbol, direction: sig.signal as 'LONG' | 'SHORT',
        confidence: sig.confidence, reason: sig.reason,
        price: prices[sig.symbol] || sig.price, queuedAt: new Date().toISOString(),
      }];
    }
  }

  // Expire old queue items
  newState.queue = newState.queue.filter(qi => Date.now() - new Date(qi.queuedAt).getTime() < QUEUE_EXPIRY_MS);
  newState.loopTelemetry = {
    topRepeatedSymbols: loopSnapshot.telemetryTop,
    avgReentryGapSec: loopSnapshot.avgReentryGapSec,
    loopBlocks,
    lookbackMinutes: Math.round(LOOP_LOOKBACK_MS / 60000),
  };
  newState.lastUpdate = new Date().toISOString();

  if (regimeCfg.enabled && state.mode === 'v2-scalping') {
    console.log(`[regime] ${newState.regimeState.status} (${newState.regimeState.source}) | blocked L:${newState.regimeTelemetry.blockedLongCount} S:${newState.regimeTelemetry.blockedShortCount} | neutral throttle:${newState.regimeTelemetry.neutralThrottleEvents}`);
  }
  if (state.mode === 'v2-scalping') {
    const top = newState.loopTelemetry.topRepeatedSymbols[0];
    console.log(`[anti-loop] blocks:${newState.loopTelemetry.loopBlocks} avgGap:${newState.loopTelemetry.avgReentryGapSec}s top:${top ? `${top.symbol}x${top.count}` : 'n/a'}`);
  }

  return newState;
}

export function resetState(state: TradeState): TradeState {
  return {
    ...makeDefaultState(state.mode),
    config: state.config,
    initialWalletSize: state.initialWalletSize,
    stats: {
      walletBalance: state.initialWalletSize, realizedPnl: 0, totalTrades: 0,
      winCount: 0, lossCount: 0, bestTrade: 0, worstTrade: 0,
      totalDurationMs: 0, closedCount: 0,
    },
  };
}
