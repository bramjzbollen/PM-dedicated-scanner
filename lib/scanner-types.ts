// ─── Scanner Types ───

export interface ScannerSignal {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number; // 0-100%
  price: number;
  stochRSI_K: number;
  stochRSI_D: number;
  volumeRatio: number; // current vol / 20-period avg
  ema5: number;
  atr: number;
  atrRatio: number; // current ATR / avg ATR
  spread: number; // spread percentage
  timestamp: Date;
}

export interface QueuedSignal {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  confidence: number;
  entryPrice: number;
  volumeRatio: number;
  queuedAt: Date;
  priority: number; // higher = better
}

// ─── Paper Trade Types ───

export interface PaperTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  confidence: number;
  leverage: number;
  positionSize: number; // $ amount
  stopLossPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  openedAt: Date;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnlPercent: number;
  pnlDollar: number;
  leverage: number;
  openedAt: Date;
  closedAt: Date;
  closeReason: 'tp' | 'sl' | 'trailing' | 'timeout' | 'manual' | 'tp1' | 'tp2' | 'stop_loss' | 'max_hold' | 'take_profit' | string;
}

export interface ScannerStats {
  totalPairsMonitored: number;
  activeTrades: number;
  maxTrades: number;
  queueSize: number;
  longSignals: number;
  shortSignals: number;
  neutralSignals: number;
  lastScanTime: Date;
  scanRate: number; // scans per minute
}

export interface ScannerFilters {
  search: string;
  signalType: 'ALL' | 'LONG' | 'SHORT';
  minConfidence: number;
  sortBy: 'confidence' | 'volumeRatio' | 'symbol' | 'price' | 'pnl';
  sortDir: 'asc' | 'desc';
}

export type RoverStrategy = {
  leverage: number;
  stopLoss: number;
  positionSize: number;
  maxConcurrent: number;
  tp1: number;
  tp2: number;
  maxHoldMinutes: number;
  walletSize: number;
  dailyLossLimit: number;
  stochRSI: { period: number; kPeriod: number; dPeriod: number };
  volumeThreshold: number;
  emaPeriod: number;
  atrThreshold: number;
  spreadThreshold: number;
  maxMonitoredPairs: number;
  timeframe: string;
};

export const ROVER_STRATEGY: RoverStrategy = {
  leverage: 10,
  stopLoss: -0.27,
  positionSize: 1, // 1% portfolio
  maxConcurrent: 50,
  tp1: 0.15,
  tp2: 0.25,
  maxHoldMinutes: 5,
  walletSize: 5000,
  dailyLossLimit: 40,
  stochRSI: { period: 14, kPeriod: 3, dPeriod: 3 },
  volumeThreshold: 1.5,
  emaPeriod: 5,
  atrThreshold: 2.0,
  spreadThreshold: 0.1,
  maxMonitoredPairs: 250,
  timeframe: '5m',
};

// ─── Indicator Toggle Types ───

export interface IndicatorToggles {
  stochRSI: boolean;
  volume: boolean;
  ema: boolean;
  atr: boolean;
  spread: boolean;
}

export const DEFAULT_INDICATOR_TOGGLES: IndicatorToggles = {
  stochRSI: true,
  volume: true,
  ema: true,
  atr: true,
  spread: true,
};

// ─── Scanner Settings ───

export interface ScannerSettings {
  leverage: number;
  maxMonitoredPairs: number;
  indicators: IndicatorToggles;
  soundEnabled: boolean;
}

// ─── Helper functions ───

export function calculatePnl(trade: PaperTrade): { pnlPercent: number; pnlDollar: number } {
  const rawPercent = trade.direction === 'LONG'
    ? ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100
    : ((trade.entryPrice - trade.currentPrice) / trade.entryPrice) * 100;
  const leveragedPercent = rawPercent * trade.leverage;
  const pnlDollar = (leveragedPercent / 100) * trade.positionSize;
  return { pnlPercent: leveragedPercent, pnlDollar };
}

export function getHoldTime(openedAt: Date): string {
  const seconds = Math.floor((Date.now() - openedAt.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
