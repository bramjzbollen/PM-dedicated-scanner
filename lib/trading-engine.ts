// Auto Trading Engine - Core types and logic

export interface Position {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  quantity: number;
  remainingQuantity: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  trailingStop?: number;
  trailingActivated: boolean;
  peakPrice?: number;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  closeReason?: 'tp' | 'tp1' | 'tp2' | 'sl' | 'trailing' | 'manual' | 'timeout' | 'max_hold';
  pnl: number;
  pnlPercent: number;
  partialCloses: PartialClose[];
}

export interface PartialClose {
  price: number;
  quantity: number;
  pnl: number;
  reason: string;
  at: string;
}

export interface QueueItem {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  price: number;
  queuedAt: string;
}

export interface TradingStats {
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

export interface TradingConfig {
  autoEntry: boolean;
  minConfidence: number;
  maxPositions: number;
  queueEnabled: boolean;
  positionSize: number;
  leverage: number; // 1x-100x for scalping, 1x-20x for swing
  // Scalping
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
  trailingActivationPercent: number; // % profit to activate trailing (0.6% for scalping)
  timeoutMinutes?: number;
  // Swing extras
  takeProfit2Percent?: number;
  partialClosePercent1?: number;
  partialClosePercent2?: number;
}

// Swing scanner parameter types
export interface SwingParams {
  emaFast: number;        // 20
  emaMedium: number;      // 50
  emaSlow: number;        // 200
  rsiPeriod: number;      // 14
  rsiOverbought: number;  // 70
  rsiOversold: number;    // 30
  macdFast: number;       // 12
  macdSlow: number;       // 26
  macdSignal: number;     // 9
  volumeSMA: number;      // 20
}

export interface SwingEnabledIndicators {
  emaTrend: boolean;
  rsi: boolean;
  macd: boolean;
  volume: boolean;
}

export const DEFAULT_SWING_PARAMS: SwingParams = {
  emaFast: 20,
  emaMedium: 50,
  emaSlow: 200,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  volumeSMA: 20,
};

export const DEFAULT_SWING_ENABLED_INDICATORS: SwingEnabledIndicators = {
  emaTrend: true,
  rsi: true,
  macd: true,
  volume: true,
};

// Scanner parameter types for indicator configuration
export interface ScalpParams {
  stochRsiPeriod: number;
  stochRsiStochPeriod: number;
  stochRsiKSmoothing: number;
  stochRsiDSmoothing: number;
  stochRsiBottomThreshold: number;
  stochRsiTopThreshold: number;
  stochRsiCrossLevel: number;
  bbPeriod: number;
  bbStdDev: number;
  volumeSMA: number;
  atrPeriod: number;
  minATR: number;
}

export interface EnabledIndicators {
  stochRsi: boolean;
  bb: boolean;
  volume: boolean;
  atr: boolean;
}

export const DEFAULT_SCALP_PARAMS: ScalpParams = {
  stochRsiPeriod: 14,
  stochRsiStochPeriod: 14,
  stochRsiKSmoothing: 3,
  stochRsiDSmoothing: 3,
  stochRsiBottomThreshold: 15,
  stochRsiTopThreshold: 85,
  stochRsiCrossLevel: 50,
  bbPeriod: 20,
  bbStdDev: 2,
  volumeSMA: 20,
  atrPeriod: 14,
  minATR: 0.15,
};

export const DEFAULT_ENABLED_INDICATORS: EnabledIndicators = {
  stochRsi: true,
  bb: true,
  volume: true,
  atr: true,
};

export const DEFAULT_SCALPING_CONFIG: TradingConfig = {
  autoEntry: true,
  minConfidence: 70,
  maxPositions: 5,
  queueEnabled: true,
  positionSize: 20,
  leverage: 10,
  stopLossPercent: 2.0,
  takeProfitPercent: 2.5,
  trailingStopPercent: 1.0,
  trailingActivationPercent: 1.5,
  timeoutMinutes: 3,
};

export const DEFAULT_SWING_CONFIG: TradingConfig = {
  autoEntry: true,
  minConfidence: 70,
  maxPositions: 10,
  queueEnabled: true,
  positionSize: 100,
  leverage: 10,
  stopLossPercent: 2.5,
  takeProfitPercent: 4,
  trailingStopPercent: 2.0,
  trailingActivationPercent: 4, // same as TP1 for swing
  takeProfit2Percent: 8,
  partialClosePercent1: 50,
  partialClosePercent2: 25,
};

export const INITIAL_WALLET = 1000;
export const MAX_SCALPING_QUEUE = 20;
export const MAX_SWING_QUEUE = 5;
export const QUEUE_EXPIRY_MS = 5 * 60 * 1000; // 5 min

// Generate unique ID
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Calculate P&L for a position
export function calcPnl(pos: Position, currentPrice: number): { pnl: number; pnlPercent: number } {
  const priceChange = pos.direction === 'LONG'
    ? currentPrice - pos.entryPrice
    : pos.entryPrice - currentPrice;
  const pnlPercent = (priceChange / pos.entryPrice) * 100;
  const pnl = pos.remainingQuantity * priceChange;
  return { pnl, pnlPercent };
}

// Calculate total realized P&L from partial closes
export function calcPartialPnl(pos: Position): number {
  return pos.partialCloses.reduce((sum, pc) => sum + pc.pnl, 0);
}

// Create a new position from a signal
// Leverage amplifies the effective size (and thus P&L) while margin stays at positionSize
export function createPosition(
  symbol: string,
  direction: 'LONG' | 'SHORT',
  price: number,
  config: TradingConfig,
  isSwing: boolean,
): Position {
  const effectiveSize = config.positionSize * config.leverage;
  const quantity = effectiveSize / price;
  const effectiveExposure = config.positionSize * config.leverage;
  // Scalping targets: SL $4.40 (incl fees), TP $5.40 (incl fees)
  // Swing targets: SL $12, TP1 $19, TP2 $32
  const isHighLev = config.leverage > 1;
  const targetSL = isSwing ? 12 : 4.4;
  const targetTP = isSwing ? 19 : 5.4;
  const dynamicSLPercent = isHighLev ? (targetSL / effectiveExposure) * 100 : config.stopLossPercent;
  const dynamicTPPercent = isHighLev ? (targetTP / effectiveExposure) * 100 : config.takeProfitPercent;
  const slMultiplier = direction === 'LONG' ? (1 - dynamicSLPercent / 100) : (1 + dynamicSLPercent / 100);
  const tpMultiplier = direction === 'LONG' ? (1 + dynamicTPPercent / 100) : (1 - dynamicTPPercent / 100);

  const pos: Position = {
    id: genId(),
    symbol,
    direction,
    entryPrice: price,
    currentPrice: price,
    size: effectiveSize, // leveraged size
    leverage: config.leverage,
    quantity,
    remainingQuantity: quantity,
    stopLoss: price * slMultiplier,
    takeProfit: price * tpMultiplier,
    trailingActivated: false,
    openedAt: new Date().toISOString(),
    status: 'open',
    pnl: 0,
    pnlPercent: 0,
    partialCloses: [],
  };

  if (isSwing && config.takeProfit2Percent) {
    const dynamicTP2Percent = isHighLev ? (32 / effectiveExposure) * 100 : config.takeProfit2Percent;
    const tp2Multiplier = direction === 'LONG'
      ? (1 + dynamicTP2Percent / 100)
      : (1 - dynamicTP2Percent / 100);
    pos.takeProfit2 = price * tp2Multiplier;
  }

  return pos;
}

// Check exit conditions for a position
export function checkExitConditions(
  pos: Position,
  currentPrice: number,
  config: TradingConfig,
  isSwing: boolean,
): { action: 'none' | 'close' | 'partial_tp1' | 'partial_tp2' | 'activate_trailing'; reason?: string } {
  if (pos.status !== 'open') return { action: 'none' };

  // Grace period: skip exit checks for first 10 seconds after entry
  // This prevents instant SL hits from price difference between scanner and live feed
  const posAge = Date.now() - new Date(pos.openedAt).getTime();
  const graceMs = isSwing ? 30000 : 10000; if (posAge < graceMs) return { action: 'none' };

  const isLong = pos.direction === 'LONG';

  // 1. Stop Loss (always check first â€” hard exit)
  if (isLong ? currentPrice <= pos.stopLoss : currentPrice >= pos.stopLoss) {
    return { action: 'close', reason: 'sl' };
  }

  // 2. Trailing stop triggered (before TP checks â€” trailing is an active exit)
  if (pos.trailingActivated && pos.trailingStop != null) {
    if (isLong ? currentPrice <= pos.trailingStop : currentPrice >= pos.trailingStop) {
      return { action: 'close', reason: 'trailing' };
    }
  }

  // 3. Check take-profit / partial close conditions BEFORE timeout
  // P0-2 FIX: TP checks now run before timeout so profitable positions
  // aren't prematurely closed when nearing their target.

  if (isSwing) {
    // Swing: partial closes
    const priceChangePercent = isLong
      ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

    // Check TP2 first (6%)
    if (config.takeProfit2Percent && priceChangePercent >= config.takeProfit2Percent) {
      const hasTP2Close = pos.partialCloses.some(pc => pc.reason === 'tp2');
      if (!hasTP2Close) {
        return { action: 'partial_tp2' };
      }
      // After TP2, if trailing not activated yet, do so
      if (!pos.trailingActivated) {
        return { action: 'activate_trailing' };
      }
    }

    // Check TP1 (3%)
    if (priceChangePercent >= config.takeProfitPercent) {
      const hasTP1Close = pos.partialCloses.some(pc => pc.reason === 'tp1');
      if (!hasTP1Close) {
        return { action: 'partial_tp1' };
      }
    }
  } else {
    // Scalping: simple TP
    if (isLong ? currentPrice >= pos.takeProfit : currentPrice <= pos.takeProfit) {
      return { action: 'close', reason: 'tp' };
    }

    // Scalping trailing activation: after configurable % profit
    const priceChangePercent = isLong
      ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

    if (!pos.trailingActivated && priceChangePercent >= (config.trailingActivationPercent || 0.6)) {
      return { action: 'activate_trailing' };
    }
  }

  // 4. Timeout (scalping only) â€” checked AFTER TP/trailing
  // P0-2 FIX: Only timeout positions that are at a loss or near-zero profit.
  // Profitable positions with trailing activated are never timed out.
  if (config.timeoutMinutes && !pos.trailingActivated) {
    const elapsed = Date.now() - new Date(pos.openedAt).getTime();
    if (elapsed >= config.timeoutMinutes * 60 * 1000) {
      const priceChangePercent = isLong
        ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
      // If position is significantly profitable (>50% of TP), give it more time (2x timeout)
      const extendedTimeout = priceChangePercent > (config.takeProfitPercent * 0.5);
      if (!extendedTimeout || elapsed >= config.timeoutMinutes * 2 * 60 * 1000) {
        return { action: 'close', reason: 'timeout' };
      }
    }
  }

  return { action: 'none' };
}

// Update trailing stop based on peak price
export function updateTrailingStop(pos: Position, currentPrice: number, config: TradingConfig): Position {
  if (!pos.trailingActivated) return pos;

  const isLong = pos.direction === 'LONG';
  const trailingPercent = config.trailingStopPercent / 100;

  if (isLong) {
    const peak = Math.max(pos.peakPrice || pos.entryPrice, currentPrice);
    const newTrailingStop = peak * (1 - trailingPercent);
    return {
      ...pos,
      peakPrice: peak,
      trailingStop: Math.max(pos.trailingStop || 0, newTrailingStop),
    };
  } else {
    const peak = Math.min(pos.peakPrice || pos.entryPrice, currentPrice);
    const newTrailingStop = peak * (1 + trailingPercent);
    return {
      ...pos,
      peakPrice: peak,
      trailingStop: pos.trailingStop ? Math.min(pos.trailingStop, newTrailingStop) : newTrailingStop,
    };
  }
}

// Get position status label
export function getPositionStatus(pos: Position, currentPrice: number): string {
  if (pos.trailingActivated) return 'Trailing';

  const isLong = pos.direction === 'LONG';
  const priceChangePercent = isLong
    ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
    : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

  const distToTP = isLong
    ? ((pos.takeProfit - currentPrice) / currentPrice) * 100
    : ((currentPrice - pos.takeProfit) / currentPrice) * 100;

  const distToSL = isLong
    ? ((currentPrice - pos.stopLoss) / currentPrice) * 100
    : ((pos.stopLoss - currentPrice) / currentPrice) * 100;

  if (distToSL < 0.1) return 'Near SL';
  if (distToTP < 0.1) return 'Near TP';
  return 'Active';
}

// Format duration
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Migration: re-classify mislabeled close reasons
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// When the price-feed bug (P0-1) was active, all positions were closed as
// 'timeout' because the engine never saw price movement to trigger SL/TP.
// This function retroactively infers the correct close reason from the
// stored entry/exit price and SL/TP levels when possible.
export function migrateCloseReasons(positions: Position[]): Position[] {
  let migrated = 0;
  const result = positions.map(pos => {
    // Only migrate positions that have 'timeout' or undefined close reason
    // but have enough data to infer the real reason
    if (pos.status !== 'closed') return pos;
    if (pos.closeReason !== 'timeout' && pos.closeReason !== undefined) return pos;
    if (!pos.entryPrice || !pos.currentPrice) return pos;

    const isLong = pos.direction === 'LONG';
    const exitPrice = pos.currentPrice; // currentPrice at close = exit price
    const priceChangePercent = isLong
      ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - exitPrice) / pos.entryPrice) * 100;

    let inferredReason: Position['closeReason'] = pos.closeReason;

    // Check SL hit: price beyond stopLoss level
    if (pos.stopLoss) {
      const hitSL = isLong ? exitPrice <= pos.stopLoss : exitPrice >= pos.stopLoss;
      if (hitSL) {
        inferredReason = 'sl';
      }
    }

    // Check TP hit: price beyond takeProfit level
    if (pos.takeProfit && !inferredReason?.startsWith('sl')) {
      const hitTP = isLong ? exitPrice >= pos.takeProfit : exitPrice <= pos.takeProfit;
      if (hitTP) {
        inferredReason = 'tp';
      }
    }

    // Check TP2 for swing
    if (pos.takeProfit2 && !inferredReason?.startsWith('sl')) {
      const hitTP2 = isLong ? exitPrice >= pos.takeProfit2 : exitPrice <= pos.takeProfit2;
      if (hitTP2) {
        inferredReason = 'tp2';
      }
    }

    // Check trailing: if trailing was activated and price reversed
    if (pos.trailingActivated && pos.trailingStop) {
      const hitTrailing = isLong ? exitPrice <= pos.trailingStop : exitPrice >= pos.trailingStop;
      if (hitTrailing) {
        inferredReason = 'trailing';
      }
    }

    // If we still have 'timeout' but the P&L shows a significant move,
    // heuristic: trades closed by the old bug typically had pnl â‰ˆ 0
    // because currentPrice was never updated from entryPrice.
    // If pnl â‰ˆ 0 and closeReason is 'timeout', it's a true timeout-like close
    // from the stale-price era â€” mark as 'timeout' but we can't recover the real reason.
    if (inferredReason === pos.closeReason) {
      // No change possible â€” keep original
      return pos;
    }

    migrated++;
    return { ...pos, closeReason: inferredReason };
  });

  if (migrated > 0 && process.env.NODE_ENV === 'development') {
    console.debug(`[migration] ðŸ”„ Re-classified ${migrated}/${positions.length} close reasons`);
  }

  return result;
}

// LocalStorage helpers
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
}

export function saveToStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable
  }
}




