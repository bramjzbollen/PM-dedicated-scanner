/**
 * PM Scanner — Technical analysis + prediction market signal generator
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalResult {
  upScore: number;   // 0–100
  downScore: number; // 0–100
  factors: string[];
}

export interface PMContext {
  eventSlug: string;
  currentOdds: number;       // 0–1
  oraclePrice: number;
  threshold: number;         // strike / resolution price
  expiresAt: number;         // unix ms
}

export interface MarketRegime {
  label: 'risk-on' | 'risk-off' | 'neutral' | 'volatile';
  score: number; // -100 … +100
}

export interface PMSignal {
  eventSlug: string;
  direction: 'YES' | 'NO';
  confidence: number;        // 0–100
  edge: number;              // expected edge vs current odds
  factors: string[];
  timestamp: number;
}

export interface FilterResult {
  pass: boolean;
  skipReason?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function sma(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function percentChange(a: number, b: number): number {
  if (a === 0) return 0;
  return ((b - a) / a) * 100;
}

// ── Core Functions ─────────────────────────────────────────────────────

/**
 * Analyse OHLCV candles and return directional scores + reasoning factors.
 */
export function analyzeTechnicals(
  ohlcv: OHLCV[],
  timeframe: string,
): TechnicalResult {
  if (ohlcv.length < 2) {
    return { upScore: 50, downScore: 50, factors: ['insufficient data'] };
  }

  const closes = ohlcv.map((c) => c.close);
  const volumes = ohlcv.map((c) => c.volume);
  const factors: string[] = [];

  let upScore = 50;
  let downScore = 50;

  // — Trend (EMA 9 vs EMA 21) —
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  if (ema9 > ema21) {
    upScore += 10;
    factors.push(`${timeframe} EMA9 > EMA21 (bullish trend)`);
  } else {
    downScore += 10;
    factors.push(`${timeframe} EMA9 < EMA21 (bearish trend)`);
  }

  // — RSI —
  const r = rsi(closes);
  if (r > 70) {
    downScore += 8;
    factors.push(`${timeframe} RSI ${r.toFixed(1)} overbought`);
  } else if (r < 30) {
    upScore += 8;
    factors.push(`${timeframe} RSI ${r.toFixed(1)} oversold`);
  }

  // — Momentum (last 3 candles) —
  const recentChange = percentChange(
    closes[closes.length - 4] ?? closes[0],
    closes[closes.length - 1],
  );
  if (recentChange > 1) {
    upScore += 6;
    factors.push(`${timeframe} momentum +${recentChange.toFixed(2)}%`);
  } else if (recentChange < -1) {
    downScore += 6;
    factors.push(`${timeframe} momentum ${recentChange.toFixed(2)}%`);
  }

  // — Volume spike —
  const avgVol = sma(volumes, 20);
  const lastVol = volumes[volumes.length - 1];
  if (lastVol > avgVol * 1.8) {
    const bias = closes[closes.length - 1] > closes[closes.length - 2] ? 'up' : 'down';
    if (bias === 'up') upScore += 5;
    else downScore += 5;
    factors.push(`${timeframe} volume spike ${(lastVol / avgVol).toFixed(1)}x (${bias})`);
  }

  // — SMA 50 support/resistance —
  const sma50 = sma(closes, 50);
  const price = closes[closes.length - 1];
  if (price > sma50 * 1.02) {
    upScore += 4;
    factors.push(`${timeframe} price above SMA50`);
  } else if (price < sma50 * 0.98) {
    downScore += 4;
    factors.push(`${timeframe} price below SMA50`);
  }

  // Normalize to 0–100
  const total = upScore + downScore;
  upScore = Math.round((upScore / total) * 100);
  downScore = 100 - upScore;

  return { upScore, downScore, factors };
}

/**
 * Combine technical score with market regime and PM-specific context
 * to produce a 0–100 confidence value.
 */
export function calculatePMConfidence(
  technicals: TechnicalResult,
  regime: MarketRegime,
  pmContext: PMContext,
): number {
  // Base: directional technical score
  const directionUp = pmContext.threshold > pmContext.oraclePrice; // YES = price goes up
  let base = directionUp ? technicals.upScore : technicals.downScore;

  // Regime adjustment (-10 … +10)
  if (regime.label === 'risk-on') base += 5;
  else if (regime.label === 'risk-off') base -= 5;
  else if (regime.label === 'volatile') base -= 3;

  // Time decay — less confident as expiry nears
  const hoursLeft = Math.max(0, (pmContext.expiresAt - Date.now()) / 3_600_000);
  if (hoursLeft < 1) base -= 10;
  else if (hoursLeft < 4) base -= 5;

  // Oracle proximity to threshold
  const dist = Math.abs(
    percentChange(pmContext.oraclePrice, pmContext.threshold),
  );
  if (dist < 0.5) base += 8; // very close → high signal value
  else if (dist > 5) base -= 8; // far away → low signal value

  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Pre-trade filters: liquidity, time, sanity checks.
 */
export function checkPMFilters(
  signal: PMSignal,
  event: PMContext,
): FilterResult {
  // Skip if confidence too low
  if (signal.confidence < 55) {
    return { pass: false, skipReason: `confidence ${signal.confidence} < 55` };
  }

  // Skip if edge too thin
  if (Math.abs(signal.edge) < 0.03) {
    return { pass: false, skipReason: `edge ${signal.edge.toFixed(3)} < 3%` };
  }

  // Skip if expiring within 15 min
  const minsLeft = (event.expiresAt - Date.now()) / 60_000;
  if (minsLeft < 15) {
    return { pass: false, skipReason: `expires in ${minsLeft.toFixed(0)}m` };
  }

  // Skip if odds already extreme (no edge)
  if (event.currentOdds > 0.92 || event.currentOdds < 0.08) {
    return { pass: false, skipReason: `odds ${event.currentOdds} too extreme` };
  }

  return { pass: true };
}

/**
 * Full pipeline: analyse a single PM event and return a signal (or null).
 */
export function analyzePMEvent(
  event: PMContext,
  regime: MarketRegime,
  ohlcv: OHLCV[],
  oraclePrice: number,
  odds: number,
): PMSignal | null {
  // Enrich event context
  const ctx: PMContext = { ...event, oraclePrice, currentOdds: odds };

  // Multi-timeframe not available here; treat as primary timeframe
  const technicals = analyzeTechnicals(ohlcv, 'primary');
  const confidence = calculatePMConfidence(technicals, regime, ctx);

  // Determine direction
  const directionUp = ctx.threshold > oraclePrice;
  const impliedProb = confidence / 100;
  const edge = directionUp
    ? impliedProb - odds   // YES edge
    : (1 - impliedProb) - (1 - odds); // NO edge (same math, but explicit)

  const direction: 'YES' | 'NO' = edge >= 0 ? 'YES' : 'NO';

  const signal: PMSignal = {
    eventSlug: event.eventSlug,
    direction,
    confidence,
    edge: Math.abs(edge),
    factors: technicals.factors,
    timestamp: Date.now(),
  };

  // Apply filters
  const filter = checkPMFilters(signal, ctx);
  if (!filter.pass) return null;

  return signal;
}
