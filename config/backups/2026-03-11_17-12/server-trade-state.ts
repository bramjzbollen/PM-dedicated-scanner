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
import { existsSync } from 'node:fs';

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
  closeReason?: 'tp' | 'sl' | 'trailing' | 'manual' | 'timeout';
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
  takeProfit2Percent?: number;
  partialClosePercent1?: number;
  partialClosePercent2?: number;
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

export interface TradeState {
  mode: string;
  isRunning: boolean;
  initialWalletSize: number;
  positions: ServerPosition[];
  closedPositions: ServerPosition[];
  queue: ServerQueueItem[];
  stats: ServerStats;
  config: ServerConfig;
  lastUpdate: string;
  cooldowns: Record<string, { ts: number; reason: string }>;
  lossStreaks: Record<string, { count: number; blockedUntil: number }>;
}

// ── Defaults ──

const DEFAULT_SCALP_CONFIG: ServerConfig = {
  autoEntry: true, minConfidence: 60, maxPositions: 8, queueEnabled: true,
  positionSize: 100, leverage: 15, stopLossPercent: 0.8, takeProfitPercent: 1.5,
  trailingStopPercent: 0.6, trailingActivationPercent: 1.0,
};

const DEFAULT_SWING_CONFIG: ServerConfig = {
  autoEntry: true, minConfidence: 65, maxPositions: 8, queueEnabled: true,
  positionSize: 100, leverage: 15, stopLossPercent: 1.5, takeProfitPercent: 2.5,
  trailingStopPercent: 1.0, trailingActivationPercent: 1.5,
};

const DEFAULT_WALLET = 1000;
const QUEUE_EXPIRY_MS = 5 * 60 * 1000;
const LOSS_STREAK_LIMIT = 2;           // After 2 consecutive SL hits on same symbol
const LOSS_STREAK_BLOCK_MS = 30 * 60 * 1000; // Block for 30 minutes
const REENTRY_BLOCK_SHORT_MS = 60 * 1000;
const REENTRY_BLOCK_SL_MS = 5 * 60 * 1000;
const MIN_POSITIONS = 2;
const MAX_POSITIONS_CAP = 20;

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
    lastUpdate: new Date().toISOString(),
    cooldowns: {},
    lossStreaks: {},
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
      stateCache[mode] = state;
      return state;
    }
  } catch {}

  // Try fallback location
  try {
    const fallbackPath = join(STATE_DIR_FALLBACK, `v2-state-${mode}.json`);
    const raw = await readFile(fallbackPath, 'utf-8');
    const state = JSON.parse(raw);
    if (state && state.mode && state.stats && state.stats.walletBalance !== undefined) {
      stateCache[mode] = state;
      return state;
    }
  } catch {}

  // No file found: create defaults
  const defaultState = makeDefaultState(mode);
  stateCache[mode] = defaultState;
  return defaultState;
}

async function saveStateToDir(dir: string, state: TradeState): Promise<void> {
  const filePath = stateFilePath(dir, state.mode);
  const tmp = filePath + '.tmp';
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

function isOnCooldown(cooldowns: Record<string, { ts: number; reason: string }>, symbol: string): boolean {
  const entry = cooldowns[symbol];
  if (!entry) return false;
  const elapsed = Date.now() - entry.ts;
  const blockMs = entry.reason === 'sl' ? REENTRY_BLOCK_SL_MS : REENTRY_BLOCK_SHORT_MS;
  if (elapsed > blockMs) {
    delete cooldowns[symbol];
    return false;
  }
  return true;
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

// ── Actions ──

export function createPosition(
  state: TradeState, symbol: string, direction: 'LONG' | 'SHORT',
  price: number, trade?: { stopLoss: number; takeProfit: number; takeProfitStrong?: number; breakEvenAt: number; riskR: number; timeStopCandles: number; isStrongSetup?: boolean },
  confidence?: number, reason?: string,
): ServerPosition {
  const cfg = state.config;
  const effectiveSize = cfg.positionSize * cfg.leverage;
  const quantity = effectiveSize / price;
  let stopLoss: number, takeProfit: number;
  const isSwing = state.mode.includes('swing');
  const MIN_SL_PCT = isSwing ? 0.010 : 0.010; // HFT: min 1.0% SL for both

  if (state.mode === 'v2-grid' && trade && trade.stopLoss > 0 && trade.takeProfit > 0 && trade.riskR > 0) { // V7b: grid uses trade TP/SL, scalp uses config
    stopLoss = trade.stopLoss;
    takeProfit = trade.isStrongSetup && trade.takeProfitStrong ? trade.takeProfitStrong : trade.takeProfit;
    
    // Enforce minimum SL distance even with scanner-provided values
    const slDistance = Math.abs(price - stopLoss);
    const minSlDistance = price * MIN_SL_PCT;
    if (slDistance < minSlDistance) {
      stopLoss = direction === 'LONG' ? price - minSlDistance : price + minSlDistance;
    }
  } else {
    const slPct = cfg.stopLossPercent / 100;
    const tpPct = cfg.takeProfitPercent / 100;
    stopLoss = direction === 'LONG' ? price * (1 - slPct) : price * (1 + slPct);
    takeProfit = direction === 'LONG' ? price * (1 + tpPct) : price * (1 - tpPct);
  }

  return {
    id: genId(), symbol, direction, entryPrice: price, currentPrice: price,
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

  const { pnl, pnlPercent } = calcPnl(pos, currentPrice);
  const totalPnl = pnl + calcPartialPnl(pos);
  const duration = Date.now() - new Date(pos.openedAt).getTime();
  const isWin = totalPnl > 0;

  const closedPos: ServerPosition = {
    ...pos, currentPrice, status: 'closed',
    closeReason: reason as ServerPosition['closeReason'],
    closedAt: new Date().toISOString(), pnl: totalPnl, pnlPercent,
  };

  // Set cooldown
  state.cooldowns[pos.symbol] = { ts: Date.now(), reason };

  // Track loss streaks per symbol
  const streaks = { ...(state.lossStreaks || {}) };
  if (reason === 'sl') {
    const existing = streaks[pos.symbol] || { count: 0, blockedUntil: 0 };
    existing.count += 1;
    if (existing.count >= LOSS_STREAK_LIMIT) {
      existing.blockedUntil = Date.now() + LOSS_STREAK_BLOCK_MS;
      console.log(`[trade-state] ${pos.symbol} blocked for 30min after ${existing.count} consecutive SL hits`);
    }
    streaks[pos.symbol] = existing;
  } else if (reason === 'tp' || reason === 'trailing') {
    // Win resets the streak
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
      // Time stop
      const candleDurationMs = isSwing ? 15 * 60 * 1000 : 60 * 1000;
      const timeStopMs = (updated._timeStopCandles || (isSwing ? 8 : 6)) * candleDurationMs;
      if (posAge >= timeStopMs) {
        const pct = isLong
          ? ((price - updated.entryPrice) / updated.entryPrice) * 100
          : ((updated.entryPrice - price) / updated.entryPrice) * 100;
        const halfRPct = updated._riskR && updated._riskR > 0
          ? ((updated._riskR * 0.5) / updated.entryPrice) * 100 : 0.2;
        if (pct < halfRPct) { toClose.push({ id: pos.id, reason: 'timeout', price }); return updated; }
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
  const effectiveMax = getEffectiveMaxPositions(state.stats.walletBalance, cfg.positionSize, cfg.maxPositions);
  let newState = { ...state };

  // Queue drain
  if (newState.queue.length > 0) {
    const availableSlots = effectiveMax - newState.positions.length;
    if (availableSlots > 0) {
      const toFill = newState.queue.slice(0, availableSlots);
      const remaining = newState.queue.slice(availableSlots);

      for (const qi of toFill) {
        if (isOnCooldown(newState.cooldowns, qi.symbol)) continue;
        const price = prices[qi.symbol] || qi.price;
        const pos = createPosition(newState, qi.symbol, qi.direction, price);
        if (!newState.positions.some(p => p.symbol === qi.symbol) && newState.positions.length < effectiveMax) {
          newState.positions = [...newState.positions, pos];
          newState.stats = { ...newState.stats, totalTrades: newState.stats.totalTrades + 1 };
        }
      }
      newState.queue = remaining;
    }
  }

  // Auto-entry from signals
  const activeSymbols = new Set([...newState.positions.map(p => p.symbol), ...newState.queue.map(q => q.symbol)]);
  const pendingSymbols = new Set<string>();

  for (const sig of signals) {
    if (sig.signal === 'NEUTRAL' || sig.skipTrade || !sig.symbol) continue;
    if (sig.confidence < cfg.minConfidence || activeSymbols.has(sig.symbol)) continue;
    if (isOnCooldown(newState.cooldowns, sig.symbol)) continue;
    if (pendingSymbols.has(sig.symbol)) continue;
    // Block symbols on a loss streak
    const streak = (newState.lossStreaks || {})[sig.symbol];
    if (streak && streak.blockedUntil > Date.now()) continue;
    // Clear expired streaks
    if (streak && streak.blockedUntil <= Date.now()) {
      delete newState.lossStreaks[sig.symbol];
    }

    const openCount = newState.positions.length + pendingSymbols.size;
    if (openCount < effectiveMax) {
      const livePrice = prices[sig.symbol] || sig.price || 0;
      if (livePrice <= 0) continue;

      // V3: Price Confirmation Gate - skip if scanner price is stale
      const scannerPrice = sig.price || 0;
      if (scannerPrice > 0 && livePrice > 0) {
        const priceDrift = Math.abs(livePrice - scannerPrice) / scannerPrice;
        if (priceDrift > 0.001) continue;  // >0.1% drift = stale signal, skip
      }

      // V3: Direction confirmation - live price must confirm direction
      const isLong = sig.signal === 'LONG';
      if (isLong && livePrice < scannerPrice * 0.999) continue;   // price dropped since signal
      if (!isLong && livePrice > scannerPrice * 1.001) continue;  // price rose since signal

      pendingSymbols.add(sig.symbol);
      const validTrade = sig.trade && sig.trade.riskR > 0 ? sig.trade : undefined;
      const pos = createPosition(newState, sig.symbol, sig.signal as 'LONG' | 'SHORT', livePrice, validTrade, sig.confidence, sig.reason);
      if (!newState.positions.some(p => p.symbol === sig.symbol)) {
        newState.positions = [...newState.positions, pos];
        newState.stats = { ...newState.stats, totalTrades: newState.stats.totalTrades + 1 };
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
  newState.lastUpdate = new Date().toISOString();

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
