/**
 * Technical Indicator Calculations for Rover's Trading Strategy
 * 
 * Indicators:
 * - Stochastic RSI (14, 3, 3)
 * - Volume Ratio (20-period MA)
 * - EMA (5-period)
 * - ATR (Average True Range)
 * - Spread Percentage
 */

// ─── RSI Calculation ───
export function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  if (closes.length < period + 1) return rsi;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + rs));

  // Subsequent RSI values using smoothed method
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const currentRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + currentRS));
  }

  return rsi;
}

// ─── Stochastic RSI (14, 3, 3) ───
export function calculateStochRSI(
  closes: number[],
  rsiPeriod: number = 14,
  kPeriod: number = 3,
  dPeriod: number = 3
): { k: number; d: number } | null {
  const rsiValues = calculateRSI(closes, rsiPeriod);
  if (rsiValues.length < kPeriod) return null;

  // Calculate Stochastic of RSI
  const stochValues: number[] = [];
  for (let i = kPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - kPeriod + 1, i + 1);
    const low = Math.min(...slice);
    const high = Math.max(...slice);
    const stoch = high === low ? 50 : ((rsiValues[i] - low) / (high - low)) * 100;
    stochValues.push(stoch);
  }

  if (stochValues.length < dPeriod) return null;

  // K = SMA of stochastic values (smoothed)
  const kValues: number[] = [];
  for (let i = dPeriod - 1; i < stochValues.length; i++) {
    const slice = stochValues.slice(i - dPeriod + 1, i + 1);
    kValues.push(slice.reduce((a, b) => a + b, 0) / dPeriod);
  }

  if (kValues.length < dPeriod) return null;

  // D = SMA of K values
  const recentK = kValues.slice(-dPeriod);
  const d = recentK.reduce((a, b) => a + b, 0) / dPeriod;

  return {
    k: Math.max(0, Math.min(100, kValues[kValues.length - 1])),
    d: Math.max(0, Math.min(100, d)),
  };
}

// ─── EMA Calculation ───
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // Start with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema.push(sum / period);

  // Calculate EMA
  for (let i = period; i < values.length; i++) {
    ema.push((values[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }

  return ema;
}

// ─── ATR (Average True Range) ───
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number[] {
  if (highs.length < 2) return [];

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return [];

  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRanges[i];
  atr.push(sum / period);

  for (let i = period; i < trueRanges.length; i++) {
    atr.push((atr[atr.length - 1] * (period - 1) + trueRanges[i]) / period);
  }

  return atr;
}

// ─── Volume Ratio ───
export function calculateVolumeRatio(volumes: number[], period: number = 20): number {
  if (volumes.length < period + 1) return 1;
  
  const avgVolume = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
  const currentVolume = volumes[volumes.length - 1];
  
  return avgVolume === 0 ? 1 : currentVolume / avgVolume;
}

// ─── Spread Percentage ───
export function calculateSpread(bid: number, ask: number): number {
  if (bid === 0) return 0;
  return ((ask - bid) / bid) * 100;
}

// ─── Signal Confidence Score ───
export function calculateConfidence(
  stochK: number,
  stochD: number,
  volumeRatio: number,
  atrRatio: number,
  spread: number,
  priceVsEma: 'above' | 'below' | 'at'
): number {
  let score = 0;

  // Stochastic RSI contribution (40%)
  if (stochK < 20 || stochK > 80) {
    const extremity = stochK < 20 ? (20 - stochK) / 20 : (stochK - 80) / 20;
    score += extremity * 40;
  }

  // K/D crossover bonus (10%)
  if ((stochK < 20 && stochK > stochD) || (stochK > 80 && stochK < stochD)) {
    score += 10;
  }

  // Volume contribution (25%)
  if (volumeRatio >= 1.5) {
    const volScore = Math.min((volumeRatio - 1) / 3, 1) * 25;
    score += volScore;
  }

  // ATR filter (15%) - lower is better
  if (atrRatio < 2) {
    score += (1 - atrRatio / 2) * 15;
  }

  // Spread filter (5%)
  if (spread < 0.1) {
    score += (1 - spread / 0.1) * 5;
  }

  // EMA alignment (5%)
  if (
    (stochK < 20 && priceVsEma === 'below') ||
    (stochK > 80 && priceVsEma === 'above')
  ) {
    score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
