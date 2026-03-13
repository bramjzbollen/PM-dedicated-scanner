import type { TradingMetrics, Trade, CryptoPrice, TradingSignal, Agent, AgentTask, TaskQueue } from './types';

export const getMockMetrics = (): TradingMetrics => ({
  winRate: 58.5,
  profitLoss: 245.80,
  tradesPerHour: 12.4,
  walletSize: 1245.80,
  avgHoldTimeSeconds: 154,
  trades24h: 87,
});

export const getMockTrades = (): Trade[] => [
  {
    id: 'trade-1',
    symbol: 'BTCUSDT',
    type: 'LONG',
    entryPrice: 67450.50,
    currentPrice: 67580.20,
    quantity: 0.05,
    leverage: 20,
    profitLoss: 2.59,
    profitLossPercent: 0.38,
    status: 'OPEN',
    entryTime: new Date(Date.now() - 300000),
  },
  {
    id: 'trade-2',
    symbol: 'ETHUSDT',
    type: 'SHORT',
    entryPrice: 3520.80,
    currentPrice: 3515.20,
    quantity: 0.5,
    leverage: 20,
    profitLoss: 1.40,
    profitLossPercent: 0.16,
    status: 'OPEN',
    entryTime: new Date(Date.now() - 180000),
  },
  {
    id: 'trade-3',
    symbol: 'SOLUSDT',
    type: 'LONG',
    entryPrice: 145.20,
    currentPrice: 148.50,
    quantity: 5,
    leverage: 25,
    profitLoss: 3.02,
    profitLossPercent: 2.27,
    status: 'CLOSED',
    entryTime: new Date(Date.now() - 900000),
    closeTime: new Date(Date.now() - 600000),
  },
];

export const getMockPrices = (): CryptoPrice[] => [
  {
    symbol: 'BTCUSDT',
    price: 67580.20,
    change24h: 2.45,
    volume24h: 28500000000,
    lastUpdate: new Date(),
  },
  {
    symbol: 'ETHUSDT',
    price: 3515.20,
    change24h: -0.85,
    volume24h: 12300000000,
    lastUpdate: new Date(),
  },
  {
    symbol: 'SOLUSDT',
    price: 148.50,
    change24h: 5.60,
    volume24h: 3400000000,
    lastUpdate: new Date(),
  },
  {
    symbol: 'BNBUSDT',
    price: 582.30,
    change24h: 1.20,
    volume24h: 1800000000,
    lastUpdate: new Date(),
  },
];

export const getMockSignals = (): TradingSignal[] => [
  {
    id: 'signal-1',
    symbol: 'AVAXUSDT',
    type: 'LONG',
    strength: 85,
    price: 38.45,
    stochRSI_K: 28,
    stochRSI_D: 22,
    timestamp: new Date(),
  },
  {
    id: 'signal-2',
    symbol: 'ADAUSDT',
    type: 'SHORT',
    strength: 72,
    price: 0.645,
    stochRSI_K: 78,
    stochRSI_D: 85,
    timestamp: new Date(Date.now() - 60000),
  },
];
