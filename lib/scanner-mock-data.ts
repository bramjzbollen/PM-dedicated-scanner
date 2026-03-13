import type { ScannerSignal, QueuedSignal, ScannerStats, PaperTrade, ClosedTrade } from './scanner-types';

// Top 250 coins - realistic subset for mock data
const TOP_COINS: { symbol: string; basePrice: number }[] = [
  { symbol: 'BTCUSDT', basePrice: 67450 },
  { symbol: 'ETHUSDT', basePrice: 3520 },
  { symbol: 'BNBUSDT', basePrice: 582 },
  { symbol: 'SOLUSDT', basePrice: 148 },
  { symbol: 'XRPUSDT', basePrice: 0.62 },
  { symbol: 'ADAUSDT', basePrice: 0.645 },
  { symbol: 'AVAXUSDT', basePrice: 38.45 },
  { symbol: 'DOTUSDT', basePrice: 7.85 },
  { symbol: 'LINKUSDT', basePrice: 18.20 },
  { symbol: 'MATICUSDT', basePrice: 0.72 },
  { symbol: 'ATOMUSDT', basePrice: 9.45 },
  { symbol: 'NEARUSDT', basePrice: 5.82 },
  { symbol: 'APTUSDT', basePrice: 9.20 },
  { symbol: 'OPUSDT', basePrice: 2.45 },
  { symbol: 'ARBUSDT', basePrice: 1.15 },
  { symbol: 'SUIUSDT', basePrice: 1.85 },
  { symbol: 'INJUSDT', basePrice: 28.50 },
  { symbol: 'FETUSDT', basePrice: 2.30 },
  { symbol: 'RNDRUSDT', basePrice: 8.75 },
  { symbol: 'SEIUSDT', basePrice: 0.58 },
  { symbol: 'TIAUSDT', basePrice: 12.40 },
  { symbol: 'WLDUSDT', basePrice: 3.85 },
  { symbol: 'JUPUSDT', basePrice: 1.20 },
  { symbol: 'STXUSDT', basePrice: 2.65 },
  { symbol: 'IMXUSDT', basePrice: 2.10 },
  { symbol: 'MKRUSDT', basePrice: 2950 },
  { symbol: 'AAVEUSDT', basePrice: 108 },
  { symbol: 'GRTUSDT', basePrice: 0.28 },
  { symbol: 'FTMUSDT', basePrice: 0.42 },
  { symbol: 'ALGOUSDT', basePrice: 0.22 },
  { symbol: 'FILUSDT', basePrice: 6.20 },
  { symbol: 'ICPUSDT', basePrice: 13.80 },
  { symbol: 'VETUSDT', basePrice: 0.038 },
  { symbol: 'HBARUSDT', basePrice: 0.095 },
  { symbol: 'SANDUSDT', basePrice: 0.45 },
  { symbol: 'MANAUSDT', basePrice: 0.48 },
  { symbol: 'AXSUSDT', basePrice: 8.20 },
  { symbol: 'THETAUSDT', basePrice: 1.35 },
  { symbol: 'EGLDUSDT', basePrice: 42 },
  { symbol: 'FLOWUSDT', basePrice: 0.85 },
  { symbol: 'CRVUSDT', basePrice: 0.55 },
  { symbol: 'LDOUSDT', basePrice: 2.40 },
  { symbol: 'RUNEUSDT', basePrice: 5.80 },
  { symbol: 'ENAUSDT', basePrice: 0.92 },
  { symbol: 'PENDLEUSDT', basePrice: 5.60 },
  { symbol: 'ORDIUSDT', basePrice: 45 },
  { symbol: 'WIFUSDT', basePrice: 2.80 },
  { symbol: 'PEPEUSDT', basePrice: 0.0000085 },
  { symbol: 'BONKUSDT', basePrice: 0.000022 },
  { symbol: 'FLOKIUSDT', basePrice: 0.00018 },
];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateSignalType(stochK: number): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (stochK < 20) return 'LONG';
  if (stochK > 80) return 'SHORT';
  return 'NEUTRAL';
}

export function generateMockScannerSignals(): ScannerSignal[] {
  const now = new Date();
  return TOP_COINS.map((coin, idx) => {
    const priceVariation = coin.basePrice * randomBetween(-0.005, 0.005);
    const price = coin.basePrice + priceVariation;
    const stochK = randomBetween(0, 100);
    const stochD = stochK + randomBetween(-10, 10);
    const volumeRatio = randomBetween(0.5, 3.5);
    const atrRatio = randomBetween(0.3, 2.8);
    const spread = randomBetween(0.01, 0.15);
    const ema5 = price * (1 + randomBetween(-0.003, 0.003));
    const type = generateSignalType(stochK);

    // Calculate confidence based on how many filters pass
    let confidence = 0;
    if (type !== 'NEUTRAL') {
      const extremity = stochK < 20 ? (20 - stochK) / 20 : (stochK - 80) / 20;
      confidence += extremity * 40;
      if (volumeRatio >= 1.5) confidence += Math.min((volumeRatio - 1) / 3, 1) * 25;
      if (atrRatio < 2) confidence += (1 - atrRatio / 2) * 15;
      if (spread < 0.1) confidence += (1 - spread / 0.1) * 5;
      // EMA alignment
      if ((type === 'LONG' && price < ema5) || (type === 'SHORT' && price > ema5)) {
        confidence += 5;
      }
      // K/D cross
      if ((type === 'LONG' && stochK > stochD) || (type === 'SHORT' && stochK < stochD)) {
        confidence += 10;
      }
    }

    return {
      id: `scan-${idx}-${Date.now()}`,
      symbol: coin.symbol,
      type,
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      price,
      stochRSI_K: Math.max(0, Math.min(100, Math.round(stochK * 10) / 10)),
      stochRSI_D: Math.max(0, Math.min(100, Math.round(stochD * 10) / 10)),
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      ema5: Math.round(ema5 * 100) / 100,
      atr: Math.round(price * atrRatio * 0.001 * 100) / 100,
      atrRatio: Math.round(atrRatio * 100) / 100,
      spread: Math.round(spread * 1000) / 1000,
      timestamp: new Date(now.getTime() - Math.random() * 60000),
    };
  });
}

export function generateMockPaperTrades(signals: ScannerSignal[]): PaperTrade[] {
  const actionableSignals = signals
    .filter(s => s.type !== 'NEUTRAL' && s.confidence >= 40)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 50);

  return actionableSignals.map((s, idx) => {
    const entryPrice = s.price * (1 + (Math.random() - 0.5) * 0.002);
    const priceChange = s.price * (Math.random() - 0.45) * 0.006;
    const currentPrice = s.price + priceChange;
    const holdMinutes = Math.random() * 5;

    return {
      id: `paper-${idx}-${Date.now()}`,
      symbol: s.symbol,
      direction: s.type as 'LONG' | 'SHORT',
      entryPrice,
      currentPrice,
      confidence: s.confidence,
      leverage: 10,
      positionSize: 50,
      stopLossPercent: -0.27,
      tp1Percent: 0.15,
      tp2Percent: 0.25,
      tp1Hit: Math.random() > 0.7,
      tp2Hit: Math.random() > 0.9,
      openedAt: new Date(Date.now() - holdMinutes * 60000),
    };
  });
}

export function generateMockClosedTrades(): ClosedTrade[] {
  const closedTradesData = [
    { symbol: 'BTCUSDT', direction: 'LONG' as const, entry: 67320, exit: 67520, reason: 'tp2' as const, minsAgo: 8 },
    { symbol: 'ETHUSDT', direction: 'SHORT' as const, entry: 3528, exit: 3519, reason: 'tp1' as const, minsAgo: 12 },
    { symbol: 'SOLUSDT', direction: 'LONG' as const, entry: 147.80, exit: 148.15, reason: 'tp1' as const, minsAgo: 18 },
    { symbol: 'AVAXUSDT', direction: 'SHORT' as const, entry: 38.60, exit: 38.72, reason: 'stop_loss' as const, minsAgo: 22 },
    { symbol: 'LINKUSDT', direction: 'LONG' as const, entry: 18.05, exit: 18.12, reason: 'tp2' as const, minsAgo: 28 },
    { symbol: 'ARBUSDT', direction: 'SHORT' as const, entry: 1.162, exit: 1.158, reason: 'tp1' as const, minsAgo: 35 },
    { symbol: 'DOTUSDT', direction: 'LONG' as const, entry: 7.82, exit: 7.80, reason: 'stop_loss' as const, minsAgo: 42 },
    { symbol: 'INJUSDT', direction: 'LONG' as const, entry: 28.30, exit: 28.42, reason: 'tp2' as const, minsAgo: 48 },
    { symbol: 'SUIUSDT', direction: 'SHORT' as const, entry: 1.87, exit: 1.845, reason: 'max_hold' as const, minsAgo: 55 },
    { symbol: 'APTUSDT', direction: 'LONG' as const, entry: 9.15, exit: 9.18, reason: 'tp1' as const, minsAgo: 62 },
  ];

  return closedTradesData.map((t, idx) => {
    const rawPnl = t.direction === 'LONG'
      ? ((t.exit - t.entry) / t.entry) * 100
      : ((t.entry - t.exit) / t.entry) * 100;
    const leveragedPnl = rawPnl * 10;
    const pnlDollar = (leveragedPnl / 100) * 50;

    return {
      id: `closed-${idx}`,
      symbol: t.symbol,
      direction: t.direction,
      entryPrice: t.entry,
      exitPrice: t.exit,
      pnlPercent: Math.round(leveragedPnl * 100) / 100,
      pnlDollar: Math.round(pnlDollar * 100) / 100,
      leverage: 10,
      openedAt: new Date(Date.now() - (t.minsAgo + 3) * 60000),
      closedAt: new Date(Date.now() - t.minsAgo * 60000),
      closeReason: t.reason,
    };
  });
}

export function generateMockQueuedSignals(signals: ScannerSignal[]): QueuedSignal[] {
  const actionableSignals = signals
    .filter(s => s.type !== 'NEUTRAL' && s.confidence >= 50)
    .sort((a, b) => b.confidence - a.confidence);

  // First 50 are "active", rest go to queue
  return actionableSignals.slice(50).map(s => ({
    id: s.id,
    symbol: s.symbol,
    type: s.type as 'LONG' | 'SHORT',
    confidence: s.confidence,
    entryPrice: s.price,
    volumeRatio: s.volumeRatio,
    queuedAt: new Date(Date.now() - Math.random() * 300000),
    priority: s.confidence,
  }));
}

export function generateMockScannerStats(
  signals: ScannerSignal[],
  queue: QueuedSignal[]
): ScannerStats {
  const activeSignals = signals.filter(s => s.type !== 'NEUTRAL' && s.confidence >= 40);
  return {
    totalPairsMonitored: signals.length,
    activeTrades: Math.min(activeSignals.length, 50),
    maxTrades: 50,
    queueSize: queue.length,
    longSignals: signals.filter(s => s.type === 'LONG').length,
    shortSignals: signals.filter(s => s.type === 'SHORT').length,
    neutralSignals: signals.filter(s => s.type === 'NEUTRAL').length,
    lastScanTime: new Date(),
    scanRate: Math.round(randomBetween(45, 60)),
  };
}
