/**
 * Market Regime Scanner Daemon
 * 
 * Standalone CJS daemon that continuously generates pm-market-regime.json.
 * Fetches BTC/USDT market data from Bybit (1h + 15m candles) and calculates
 * a 5-factor regime score to determine market state.
 * 
 * Regime States:
 *   BULLISH         → Score ≥ 50  (favor UP trades, block weak DOWN)
 *   BEARISH         → Score ≤ -50 (favor DOWN trades, block weak UP)
 *   RANGING         → Score -50 to -20 or 20 to 50 (both directions with penalty)
 *   HIGH_VOLATILITY → ATR% > 1.5% override (stricter filters, reduce sizing)
 * 
 * Updates every 60 seconds. Output consumed by pm-scanner-daemon.cjs and pm-bot.ts.
 * 
 * Usage: node scripts/regime-scanner-daemon.cjs
 */

const { writeFileSync, renameSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');

const OUTPUT_FILE = join(__dirname, '..', 'public', 'pm-market-regime.json');
const SCAN_INTERVAL_MS = 60_000;
const SYMBOL = 'BTC/USDT';
const BYBIT_SYMBOL = 'BTCUSDT';
const BYBIT_KLINE_URL = 'https://api.bybit.com/v5/market/kline';

// ─── Technical Indicator Helpers ───

function calcEMA(data, period) {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change; else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12.length === 0 || ema26.length === 0) return { macd: 0, signal: 0, histogram: 0, prevHistogram: 0 };
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);
  const last = closes.length - 1;
  const prev = Math.max(0, last - 1);
  return {
    macd: macdLine[last] || 0,
    signal: signalLine[last] || 0,
    histogram: (macdLine[last] || 0) - (signalLine[last] || 0),
    prevHistogram: (macdLine[prev] || 0) - (signalLine[prev] || 0),
  };
}

/**
 * ATR from Bybit kline arrays: [timestamp, open, high, low, close, volume]
 * Or from parsed objects with .high, .low, .close
 */
function calcATR(klines, period = 14) {
  if (klines.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return trs.reduce((a, b) => a + b, 0) / trs.length;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// ─── Bybit REST Kline Fetcher (no ccxt dependency) ───

async function fetchKlines(interval, limit) {
  const url = `${BYBIT_KLINE_URL}?category=spot&symbol=${BYBIT_SYMBOL}&interval=${interval}&limit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = data?.result?.list;
    if (!Array.isArray(list) || list.length === 0) throw new Error('Empty kline data');
    // Bybit returns newest first → reverse to chronological
    return list.reverse().map(k => ({
      timestamp: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── 5-Factor Regime Analysis ───

function analyzeRegime(klines1h, klines15m) {
  const closes1h = klines1h.map(k => k.close);
  const closes15m = klines15m.map(k => k.close);
  const currentPrice = closes1h[closes1h.length - 1] || 0;
  const last = closes1h.length - 1;
  const prev = Math.max(0, last - 1);

  // ── Factor 1: EMA Cross (9/21/50 alignment on 1h) → ±30 pts ──
  const ema9 = calcEMA(closes1h, 9);
  const ema21 = calcEMA(closes1h, 21);
  const ema50 = calcEMA(closes1h, 50);
  const e9 = ema9[last] || 0;
  const e21 = ema21[last] || 0;
  const e50 = ema50[last] || 0;
  const e9prev = ema9[prev] || 0;
  const e21prev = ema21[prev] || 0;

  let emaCrossScore = 0;
  let emaCrossDetail = '';
  let emaAlignment = 'MIXED';

  if (e9 > e21 && e21 > e50) {
    emaAlignment = 'BULLISH';
    emaCrossScore = 30;
    emaCrossDetail = `EMA aligned bullish (9=${e9.toFixed(0)} > 21=${e21.toFixed(0)} > 50=${e50.toFixed(0)})`;
  } else if (e9 < e21 && e21 < e50) {
    emaAlignment = 'BEARISH';
    emaCrossScore = -30;
    emaCrossDetail = `EMA aligned bearish (9=${e9.toFixed(0)} < 21=${e21.toFixed(0)} < 50=${e50.toFixed(0)})`;
  } else {
    const crossingUp = e9prev < e21prev && e9 > e21;
    const crossingDown = e9prev > e21prev && e9 < e21;
    if (crossingUp) {
      emaCrossScore = 15;
      emaCrossDetail = 'EMA 9/21 bullish cross';
    } else if (crossingDown) {
      emaCrossScore = -15;
      emaCrossDetail = 'EMA 9/21 bearish cross';
    } else if (e9 > e21) {
      emaCrossScore = 10;
      emaCrossDetail = `EMA 9 > 21, mixed alignment`;
    } else {
      emaCrossScore = -10;
      emaCrossDetail = `EMA 9 < 21, mixed alignment`;
    }
  }

  // ── Factor 2: RSI Momentum (14-period on 1h) → ±20 pts ──
  const rsi = calcRSI(closes1h, 14);
  let rsiScore = 0;
  let rsiDetail = `RSI(14)=${rsi.toFixed(1)}`;

  if (rsi > 65) { rsiScore = 20; rsiDetail += ' bullish'; }
  else if (rsi > 55) { rsiScore = 10; rsiDetail += ' mildly bullish'; }
  else if (rsi < 35) { rsiScore = -20; rsiDetail += ' bearish'; }
  else if (rsi < 45) { rsiScore = -10; rsiDetail += ' mildly bearish'; }
  else { rsiScore = 0; rsiDetail += ' neutral'; }

  // ── Factor 3: MACD Direction (histogram + crossover on 1h) → ±20 pts ──
  const macd = calcMACD(closes1h);
  let macdScore = 0;
  let macdDetail = `MACD hist=${macd.histogram.toFixed(2)}`;

  // Crossover detection
  const bullishCross = macd.histogram > 0 && macd.prevHistogram <= 0;
  const bearishCross = macd.histogram < 0 && macd.prevHistogram >= 0;

  if (bullishCross) {
    macdScore = 20;
    macdDetail += ' bullish crossover';
  } else if (bearishCross) {
    macdScore = -20;
    macdDetail += ' bearish crossover';
  } else if (macd.histogram > 0 && macd.macd > 0) {
    macdScore = 20;
    macdDetail += ' strong bullish';
  } else if (macd.histogram > 0) {
    macdScore = 10;
    macdDetail += ' turning bullish';
  } else if (macd.histogram < 0 && macd.macd < 0) {
    macdScore = -20;
    macdDetail += ' strong bearish';
  } else if (macd.histogram < 0) {
    macdScore = -10;
    macdDetail += ' turning bearish';
  }

  // ── Factor 4: Volatility (ATR on 15m, normalized) → ±15 pts ──
  const atr = calcATR(klines15m, 14);
  const price15m = closes15m[closes15m.length - 1] || currentPrice || 1;
  const atrPercent = (atr / price15m) * 100;
  let volScore = 0;
  let volDetail = `ATR%=${atrPercent.toFixed(3)}`;
  let volatilityLevel = 'NORMAL';

  if (atrPercent > 1.5) {
    volatilityLevel = 'EXTREME';
    volScore = -15;
    volDetail += ' EXTREME volatility';
  } else if (atrPercent > 0.8) {
    volatilityLevel = 'HIGH';
    volScore = -5;
    volDetail += ' high volatility';
  } else if (atrPercent < 0.15) {
    volatilityLevel = 'LOW';
    volScore = 5;
    volDetail += ' low volatility (trend likely)';
  } else {
    volScore = 0;
    volDetail += ' normal';
  }

  // ── Factor 5: Price Action (recent 15m candle structure) → ±15 pts ──
  const recent15m = klines15m.slice(-6); // last ~90 min of 15m candles
  const recentCloses = recent15m.map(k => k.close);
  const priceChange = recentCloses.length >= 2
    ? ((recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0]) * 100
    : 0;

  let paScore = 0;
  let paDetail = `15m change=${priceChange.toFixed(3)}%`;

  if (priceChange > 0.3) { paScore = 15; paDetail += ' strong bullish momentum'; }
  else if (priceChange > 0.1) { paScore = 8; paDetail += ' mild bullish'; }
  else if (priceChange < -0.3) { paScore = -15; paDetail += ' strong bearish momentum'; }
  else if (priceChange < -0.1) { paScore = -8; paDetail += ' mild bearish'; }
  else { paScore = 0; paDetail += ' flat'; }

  // ── Aggregate Score ──
  const totalScore = emaCrossScore + rsiScore + macdScore + volScore + paScore;

  // ── Determine Regime ──
  let regime;
  let confidence;

  if (volatilityLevel === 'EXTREME' || atrPercent > 1.5) {
    regime = 'HIGH_VOLATILITY';
    confidence = 80;
  } else if (totalScore >= 50) {
    regime = 'BULLISH';
    confidence = clamp(50 + Math.abs(totalScore), 50, 95);
  } else if (totalScore <= -50) {
    regime = 'BEARISH';
    confidence = clamp(50 + Math.abs(totalScore), 50, 95);
  } else if ((totalScore >= 20 && totalScore < 50) || (totalScore > -50 && totalScore <= -20)) {
    regime = 'RANGING';
    confidence = clamp(40 + (50 - Math.abs(totalScore)), 40, 80);
  } else {
    // Score between -20 and 20 → also RANGING (no clear direction)
    regime = 'RANGING';
    confidence = clamp(30 + (20 - Math.abs(totalScore)), 30, 60);
  }

  // ── Trend & Momentum ──
  const btcTrend = totalScore > 15 ? 'UP' : totalScore < -15 ? 'DOWN' : 'FLAT';
  const btcMomentum = clamp(totalScore, -100, 100);

  // ── Build Description ──
  const parts = [];
  if (regime === 'BULLISH') parts.push('Strong bullish trend');
  else if (regime === 'BEARISH') parts.push('Strong bearish trend');
  else if (regime === 'HIGH_VOLATILITY') parts.push('High volatility detected');
  else parts.push('Ranging/consolidation');

  if (emaAlignment === 'BULLISH') parts.push('EMA aligned');
  else if (emaAlignment === 'BEARISH') parts.push('EMA bearish');
  if (rsiScore > 0) parts.push('positive momentum');
  else if (rsiScore < 0) parts.push('negative momentum');
  if (macdScore >= 20) parts.push('MACD confirming');
  else if (macdScore <= -20) parts.push('MACD bearish');

  return {
    timestamp: new Date().toISOString(),
    regime,
    score: totalScore,
    confidence,
    btcTrend,
    btcMomentum,
    volatilityLevel,
    emaAlignment,
    btcPrice: currentPrice,
    atrPercent,
    rsi1h: rsi,
    macdHistogram: macd.histogram,
    description: parts.join(' - '),
    cacheAgeMs: 0,
    factors: {
      emaCross: { score: emaCrossScore, detail: emaCrossDetail },
      rsiMomentum: { score: rsiScore, detail: rsiDetail },
      macdDirection: { score: macdScore, detail: macdDetail },
      volatility: { score: volScore, detail: volDetail },
      priceAction: { score: paScore, detail: paDetail },
    },
  };
}

// ─── Atomic File Write ───

function writeOutput(data) {
  const json = JSON.stringify(data, null, 2);
  const tmpFile = OUTPUT_FILE + '.tmp';
  try {
    writeFileSync(tmpFile, json, 'utf-8');
    try {
      renameSync(tmpFile, OUTPUT_FILE);
    } catch {
      writeFileSync(OUTPUT_FILE, json, 'utf-8');
      try { unlinkSync(tmpFile); } catch {}
    }
  } catch (err) {
    console.error('[REGIME] Write failed:', err.message);
  }
}

// ─── Main Loop ───

let consecutiveErrors = 0;

async function runScan() {
  const scanStart = Date.now();
  try {
    const [klines1h, klines15m] = await Promise.all([
      fetchKlines('60', 50),   // 1h candles, last 50
      fetchKlines('15', 50),   // 15m candles, last 50
    ]);

    if (klines1h.length < 10 || klines15m.length < 10) {
      console.warn(`[REGIME] Insufficient data: 1h=${klines1h.length} 15m=${klines15m.length}`);
      return;
    }

    const result = analyzeRegime(klines1h, klines15m);
    writeOutput(result);
    consecutiveErrors = 0;

    const elapsed = Date.now() - scanStart;
    console.log(
      `[REGIME] ${new Date().toISOString().slice(11, 19)} ` +
      `${result.regime} score=${result.score} conf=${result.confidence}% ` +
      `BTC=$${result.btcPrice.toFixed(0)} ATR%=${result.atrPercent.toFixed(3)} ` +
      `RSI=${result.rsi1h.toFixed(1)} [${elapsed}ms]`
    );
  } catch (err) {
    consecutiveErrors++;
    console.error(`[REGIME] Scan error (${consecutiveErrors}x):`, err.message);
    if (consecutiveErrors > 10) {
      console.error('[REGIME] Too many consecutive errors, exiting');
      process.exit(1);
    }
  }
}

async function main() {
  console.log('[REGIME] Starting Market Regime Scanner Daemon...');
  console.log(`[REGIME] Symbol: ${SYMBOL} | Interval: ${SCAN_INTERVAL_MS / 1000}s | Output: ${OUTPUT_FILE}`);

  // Initial scan
  await runScan();

  // Recurring scans every 60s
  setInterval(async () => {
    try { await runScan(); }
    catch (err) { console.error('[REGIME] Unexpected error:', err.message); }
  }, SCAN_INTERVAL_MS);

  console.log('[REGIME] Daemon running. Press Ctrl+C to stop.');
}

main().catch(err => {
  console.error('[REGIME] Fatal:', err);
  process.exit(1);
});
