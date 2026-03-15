/**
 * PM Scanner Daemon - Polymarket-Specific Signal Generator
 * 
 * Standalone daemon that generates PM-tuned signals every 10 seconds.
 * Writes output to public/pm-signals.json for consumption by PM bot.
 * 
 * Unlike pm-direction-scanner.cjs (which only does technicals), this daemon:
 * - Integrates market regime analysis
 * - Checks Chainlink oracle-Bybit price gap
 * - Applies PM-specific filters (gap, time-to-settle, data quality)
 * - Generates bidirectional signals (UP + DOWN per event)
 * - Calculates PM-tuned confidence (win probability, not trade probability)
 * - Includes odds context from live PM markets
 * 
 * Usage: node scripts/pm-scanner-daemon.cjs
 */

const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const OUTPUT_FILE = join(__dirname, '..', 'public', 'pm-signals.json');
const REGIME_FILE = join(__dirname, '..', 'public', 'pm-market-regime.json');
const SCAN_INTERVAL_MS = 10_000; // 10 seconds
const PM_BOT_STATE_URL = 'http://localhost:3000/api/pm-bot/state';

// ─── Technical Indicators (pure JS, no TS deps) ───

function calcEMA(data, period) {
  const ema = [];
  if (data.length === 0) return ema;
  const k = 2 / (period + 1);
  ema[0] = data[0];
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
  avgGain /= period; avgLoss /= period;
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
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);
  const last = closes.length - 1;
  const prev = Math.max(0, last - 1);
  return {
    histogram: (macdLine[last] || 0) - (signalLine[last] || 0),
    prevHistogram: (macdLine[prev] || 0) - (signalLine[prev] || 0),
  };
}

function calcATR(candles, period = 14) {
  if (candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i][2] - candles[i][3],
      Math.abs(candles[i][2] - candles[i - 1][4]),
      Math.abs(candles[i][3] - candles[i - 1][4])
    );
    trs.push(tr);
  }
  if (trs.length < period) return trs.reduce((a, b) => a + b, 0) / trs.length;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function calcVWAP(candles) {
  let cumVol = 0, cumTP = 0;
  for (const c of candles) {
    const tp = (c[2] + c[3] + c[4]) / 3;
    cumTP += tp * c[5]; cumVol += c[5];
  }
  return cumVol > 0 ? cumTP / cumVol : 0;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// ─── Regime Reader ───

function readRegime() {
  try {
    if (!existsSync(REGIME_FILE)) return null;
    const raw = JSON.parse(readFileSync(REGIME_FILE, 'utf-8'));
    const age = Date.now() - new Date(raw.timestamp).getTime();
    if (age > 300_000) return null; // stale > 5 min
    return raw;
  } catch { return null; }
}

// ─── Confidence Calibration ───

const CALIBRATION_FILE = join(__dirname, '..', 'public', 'pm-confidence-calibration.json');

let calibrationCache = null;
let calibrationCacheTime = 0;
const CALIBRATION_CACHE_TTL = 60_000; // Re-read every 60s

function readCalibration() {
  const now = Date.now();
  if (calibrationCache && now - calibrationCacheTime < CALIBRATION_CACHE_TTL) return calibrationCache;
  try {
    if (!existsSync(CALIBRATION_FILE)) return null;
    const raw = JSON.parse(readFileSync(CALIBRATION_FILE, 'utf-8'));
    if (!raw.calibration) return null;
    calibrationCache = raw;
    calibrationCacheTime = now;
    return raw;
  } catch { return null; }
}

function applyCalibratedConfidence(rawConf) {
  const cal = readCalibration();
  if (!cal || !cal.calibration) return rawConf;
  const bucket = Math.floor(rawConf / 5) * 5;
  const key = `${bucket}-${bucket + 5}`;
  const multiplier = cal.calibration[key]?.multiplier || 1.0;
  return Math.round(rawConf * multiplier);
}

// ─── Volume Ratio Helper ───

function calcVolumeRatio(candles) {
  if (!candles || candles.length < 2) return 1.0;
  const volumes = candles.map(c => c[5]);
  const recentVol = volumes[volumes.length - 1];
  const lookback = Math.min(20, volumes.length - 1);
  if (lookback < 1) return 1.0;
  const avgVol = volumes.slice(-lookback - 1, -1).reduce((a, b) => a + b, 0) / lookback;
  return avgVol > 0 ? recentVol / avgVol : 1.0;
}

// ─── Oracle Price Fetcher (CoinGecko as Chainlink proxy) ───

const COINGECKO_IDS = {
  'BTC/USDT': 'bitcoin',
  'ETH/USDT': 'ethereum',
  'SOL/USDT': 'solana',
  'XRP/USDT': 'ripple',
};

let oraclePriceCache = {};
let oracleCacheTime = 0;
const ORACLE_CACHE_TTL = 15_000;

async function fetchOraclePrices() {
  const now = Date.now();
  if (now - oracleCacheTime < ORACLE_CACHE_TTL && Object.keys(oraclePriceCache).length > 0) {
    return oraclePriceCache;
  }

  const ids = Object.values(COINGECKO_IDS).join(',');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&precision=8`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return oraclePriceCache; // use stale cache

    const data = await res.json();
    const prices = {};
    for (const [pair, cgId] of Object.entries(COINGECKO_IDS)) {
      if (data[cgId]?.usd) prices[pair] = data[cgId].usd;
    }
    oraclePriceCache = prices;
    oracleCacheTime = now;
    return prices;
  } catch (err) {
    console.error('[PM-SCAN] Oracle price fetch failed:', err.message);
    return oraclePriceCache;
  }
}

// ─── PM Events Fetcher (from PM Bot State API) ───

let eventsCache = [];
let eventsCacheTime = 0;
const EVENTS_CACHE_TTL = 5_000;

async function fetchPMEvents() {
  const now = Date.now();
  if (now - eventsCacheTime < EVENTS_CACHE_TTL && eventsCache.length > 0) return eventsCache;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(PM_BOT_STATE_URL, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error(`[PM-SCAN] PM bot state API returned ${res.status}`);
      return eventsCache;
    }

    const state = await res.json();
    const events = (state.events || []).filter(e => e.enabled).map(e => {
      // Extract coin from symbol (e.g. "BTC/USDT" -> "BTC")
      const coin = (e.symbol || '').split('/')[0];
      // Extract timeframe from marketKey or label (e.g. "PM-BTC-5M-UPDOWN" -> 5)
      const tfMatch = (e.marketKey || e.label || '').match(/(\d+)M/i);
      const timeframeMinutes = tfMatch ? parseInt(tfMatch[1]) : 5;
      return {
        symbol: e.symbol,
        coin,
        marketKey: e.marketKey,
        label: e.label,
        timeframeMinutes,
        // Pass through any existing signal context from PM bot
        suggestedSide: e.suggestedSide || null,
        priceGap: e.priceGap || null,
      };
    });

    eventsCache = events;
    eventsCacheTime = now;
    console.log(`[PM-SCAN] Fetched ${events.length} enabled events from PM bot: ${events.map(e => e.label).join(', ')}`);
    return events;
  } catch (err) {
    console.error('[PM-SCAN] PM events fetch error:', err.message);
    return eventsCache;
  }
}

// ─── Technical Analysis (per side) ───

function analyzeSide(eventCandles, htfCandles, side) {
  const closes = eventCandles.map(c => c[4]);
  const volumes = eventCandles.map(c => c[5]);
  const htfCloses = htfCandles.map(c => c[4]);
  const currentPrice = closes[closes.length - 1] || 0;
  const details = [];

  // 1. EMA Trend Alignment (20 pts)
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const ema50 = calcEMA(closes, 50);
  const last = closes.length - 1;
  const e9 = ema9[last], e21 = ema21[last], e50 = ema50[last];
  let emaUp = 0, emaDown = 0;
  if (e9 > e21 && e21 > e50) { emaUp = 20; details.push('EMA bullish aligned'); }
  else if (e9 < e21 && e21 < e50) { emaDown = 20; details.push('EMA bearish aligned'); }
  else if (e9 > e21) { emaUp = 12; } else if (e9 < e21) { emaDown = 12; }
  else if (currentPrice > e9) { emaUp = 5; } else { emaDown = 5; }

  // 2. RSI Momentum (15 pts) - PM-tuned with mean reversion
  const rsi = calcRSI(closes, 14);
  let rsiUp = 0, rsiDown = 0;
  if (rsi > 70) { rsiDown = 5; rsiUp = 3; details.push(`RSI ${rsi.toFixed(1)} overbought`); }
  else if (rsi > 60) { rsiUp = 12; }
  else if (rsi > 55) { rsiUp = 8; }
  else if (rsi < 30) { rsiUp = 5; rsiDown = 3; details.push(`RSI ${rsi.toFixed(1)} oversold`); }
  else if (rsi < 40) { rsiDown = 12; }
  else if (rsi < 45) { rsiDown = 8; }
  else { rsiUp = 5; rsiDown = 5; }
  // RSI direction
  const rsiPrev = calcRSI(closes.slice(0, -3), 14);
  if (rsi > rsiPrev + 3) rsiUp = Math.min(rsiUp + 3, 15);
  else if (rsi < rsiPrev - 3) rsiDown = Math.min(rsiDown + 3, 15);

  // 3. MACD Direction (15 pts)
  const macd = calcMACD(closes);
  let macdUp = 0, macdDown = 0;
  const histGrowing = Math.abs(macd.histogram) > Math.abs(macd.prevHistogram) &&
    Math.sign(macd.histogram) === Math.sign(macd.prevHistogram);
  if (macd.histogram > 0 && macd.prevHistogram <= 0) { macdUp = 15; details.push('MACD bullish cross'); }
  else if (macd.histogram < 0 && macd.prevHistogram >= 0) { macdDown = 15; details.push('MACD bearish cross'); }
  else if (macd.histogram > 0) { macdUp = histGrowing ? 15 : 8; }
  else if (macd.histogram < 0) { macdDown = histGrowing ? 15 : 8; }

  // 4. Volume (10 pts)
  const avgVol = volumes.length >= 20
    ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : volumes.reduce((a, b) => a + b, 0) / Math.max(volumes.length, 1);
  const volRatio = avgVol > 0 ? volumes[volumes.length - 1] / avgVol : 1;
  let volUp = 0, volDown = 0;
  const priceDir = emaUp > emaDown ? 'UP' : 'DOWN';
  if (volRatio > 1.2) { if (priceDir === 'UP') volUp = 10; else volDown = 10; }
  else if (volRatio > 0.8) { if (priceDir === 'UP') volUp = 4; else volDown = 4; }

  // 5. VWAP (10 pts)
  const vwap = calcVWAP(eventCandles);
  const vwapDist = vwap > 0 ? ((currentPrice - vwap) / vwap) * 100 : 0;
  let vwapUp = 0, vwapDown = 0;
  if (vwapDist > 0.15) vwapUp = 10;
  else if (vwapDist > 0.05) vwapUp = 7;
  else if (vwapDist > 0) vwapUp = 3;
  else if (vwapDist < -0.15) vwapDown = 10;
  else if (vwapDist < -0.05) vwapDown = 7;
  else if (vwapDist < 0) vwapDown = 3;

  // 6. HTF Confirmation (15 pts)
  const htfEma9 = calcEMA(htfCloses, 9);
  const htfEma21 = calcEMA(htfCloses, 21);
  const htfLast = htfCloses.length - 1;
  const htfTrend = htfEma9[htfLast] > htfEma21[htfLast] ? 'UP' : htfEma9[htfLast] < htfEma21[htfLast] ? 'DOWN' : 'NEUTRAL';
  let htfUp = 0, htfDown = 0;
  if (htfTrend === 'UP') htfUp = 15;
  else if (htfTrend === 'DOWN') htfDown = 15;
  else { htfUp = 5; htfDown = 5; }

  // 7. Candle Structure (10 pts)
  const recent = eventCandles.slice(-5);
  let higherLows = 0, lowerHighs = 0, bullishBodies = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i][3] > recent[i - 1][3]) higherLows++;
    if (recent[i][2] < recent[i - 1][2]) lowerHighs++;
    if (recent[i][4] > recent[i][1]) bullishBodies++;
  }
  let candleUp = 0, candleDown = 0;
  if (higherLows >= 3) candleUp = 10;
  else if (lowerHighs >= 3) candleDown = 10;
  else if (higherLows >= 2 && bullishBodies >= 3) candleUp = 7;
  else if (lowerHighs >= 2 && bullishBodies <= 1) candleDown = 7;
  else if (bullishBodies >= 3) candleUp = 4;
  else if (bullishBodies <= 1) candleDown = 4;

  // 8. Volatility Check (5 pts)
  const atr = calcATR(eventCandles, 14);
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  let volCheckUp = 0, volCheckDown = 0;
  if (atrPct >= 0.05 && atrPct <= 2.0) {
    if (emaUp + rsiUp + macdUp > emaDown + rsiDown + macdDown) volCheckUp = 5;
    else volCheckDown = 5;
  }

  // Return score for requested side
  const sideScores = side === 'UP'
    ? { ema: emaUp, rsi: rsiUp, macd: macdUp, vol: volUp, vwap: vwapUp, htf: htfUp, candle: candleUp, volCheck: volCheckUp }
    : { ema: emaDown, rsi: rsiDown, macd: macdDown, vol: volDown, vwap: vwapDown, htf: htfDown, candle: candleDown, volCheck: volCheckDown };

  const base = sideScores.ema + sideScores.rsi + sideScores.macd + sideScores.vol +
    sideScores.vwap + sideScores.htf + sideScores.candle + sideScores.volCheck;

  const trendLabel = (emaUp + rsiUp + macdUp) - (emaDown + rsiDown + macdDown) > 15 ? 'BULLISH'
    : (emaDown + rsiDown + macdDown) - (emaUp + rsiUp + macdUp) > 15 ? 'BEARISH' : 'NEUTRAL';

  // Flag when no clear trend data exists (indicators give no directional edge)
  if (trendLabel === 'NEUTRAL' && base < 40) {
    details.push('Geen trenddata');
  }

  return {
    base,
    rsi,
    atrPct,
    trendLabel,
    momentum: clamp(Math.round((rsi - 50) * 2), -100, 100),
    details,
  };
}

// ─── PM Confidence with adjustments ───

function calculatePMConfidence(base, side, regime, gapPct, timeToSettle) {
  let conf = base;

  // Regime adjustments (v2 - stricter penalties)
  if (regime) {
    const state = regime.regime;
    if (state === 'BULLISH') {
      if (side === 'UP') conf += 5;
      else { if (base < 75) return 0; conf -= 25; }  // was -15
    } else if (state === 'BEARISH') {
      if (side === 'DOWN') conf += 5;
      else { if (base < 75) return 0; conf -= 25; }  // was -15
    } else if (state === 'RANGING') {
      conf -= 10;  // was -10 (kept, was already -10 in this path)
    } else if (state === 'HIGH_VOLATILITY') {
      if (base < 70) return 0;
      conf -= 5;
    }
  }

  // Oracle gap penalty
  if (gapPct > 0.5) {
    const penalty = Math.round(clamp(gapPct * 25, 5, 20));
    conf -= penalty;
  }

  // Time urgency penalty - now handled by filter (hard skip at <180s)
  if (timeToSettle > 0 && timeToSettle < 180) {
    conf -= 10;
  }

  // Apply calibration if available
  conf = applyCalibratedConfidence(conf);

  return clamp(Math.round(conf), 0, 100);
}

// ─── Filters ───

function checkFilters(candleCount, gapPct, timeToSettle, side, base, regime, volRatio) {
  if (gapPct > 0.8) return { pass: false, reason: `Gap ${gapPct.toFixed(2)}% > 0.8% (settlement risk)` };
  if (timeToSettle > 0 && timeToSettle < 180) return { pass: false, reason: `TTL ${timeToSettle}s < 180s (need ≥180s)` };  // was 120s
  if (candleCount < 50) return { pass: false, reason: `Only ${candleCount} candles (need 50)` };
  // Volume confirmation: require recent volume > 1.2x average
  if (volRatio < 1.2) return { pass: false, reason: `Volume ${volRatio.toFixed(2)}x < 1.2x avg (insufficient confirmation)` };
  if (regime) {
    if (regime.regime === 'BULLISH' && side === 'DOWN' && base < 75) return { pass: false, reason: `BULLISH blocks weak DOWN (${base}%)` };
    if (regime.regime === 'BEARISH' && side === 'UP' && base < 75) return { pass: false, reason: `BEARISH blocks weak UP (${base}%)` };
    if (regime.regime === 'HIGH_VOLATILITY' && base < 70) return { pass: false, reason: `HIGH_VOL requires ≥70% (got ${base}%)` };
  }
  return { pass: true };
}

// ─── Main Scanner ───

let ccxt = null;
let exchange = null;

async function initExchange() {
  const mod = await import('ccxt');
  ccxt = mod.default || mod;
  exchange = new ccxt.bybit({ enableRateLimit: true });
}

async function fetchCandles(pair, timeframe, limit) {
  try {
    return await exchange.fetchOHLCV(pair, timeframe, undefined, limit);
  } catch (err) {
    console.error(`[PM-SCAN] Fetch ${pair} ${timeframe} failed:`, err.message);
    return [];
  }
}

async function runScan() {
  const scanStart = Date.now();
  const regime = readRegime();

  // ── Phase 1 Filter: Market Timing ──
  // Skip ALL trades during suboptimal regimes (RANGING = coin flip, HIGH_VOL = unpredictable)
  if (regime && regime.regime === 'RANGING') {
    const skipOutput = {
      timestamp: new Date().toISOString(),
      regime: regime.regime,
      regimeConfidence: regime.confidence || 0,
      signals: [],
      scanDurationMs: Date.now() - scanStart,
      skipReason: 'RANGING market - no directional edge',
    };
    writeFileSync(OUTPUT_FILE, JSON.stringify(skipOutput, null, 2), 'utf-8');
    console.log(`[PM-SCAN] ${new Date().toISOString().slice(11, 19)} SKIP: RANGING regime - no directional edge`);
    return skipOutput;
  }

  if (regime && regime.regime === 'HIGH_VOLATILITY') {
    const skipOutput = {
      timestamp: new Date().toISOString(),
      regime: regime.regime,
      regimeConfidence: regime.confidence || 0,
      signals: [],
      scanDurationMs: Date.now() - scanStart,
      skipReason: 'HIGH_VOLATILITY - settlement risk too high',
    };
    writeFileSync(OUTPUT_FILE, JSON.stringify(skipOutput, null, 2), 'utf-8');
    console.log(`[PM-SCAN] ${new Date().toISOString().slice(11, 19)} SKIP: HIGH_VOLATILITY regime - settlement risk too high`);
    return skipOutput;
  }
  // Only BULLISH and BEARISH regimes proceed past this point

  const oraclePrices = await fetchOraclePrices();
  const pmEvents = await fetchPMEvents();

  if (pmEvents.length === 0) {
    console.warn('[PM-SCAN] No enabled PM events found - skipping scan');
    return null;
  }

  const allSignals = [];

  // Group events by coin to batch candle fetches
  const coinSet = new Set(pmEvents.map(e => e.coin));
  const candleCache = {};

  for (const coin of coinSet) {
    const pair = `${coin}/USDT`;
    const [candles5m, candles15m, candles1h] = await Promise.all([
      fetchCandles(pair, '5m', 100),
      fetchCandles(pair, '15m', 100),
      fetchCandles(pair, '1h', 50),
    ]);
    candleCache[coin] = { '5m': candles5m, '15m': candles15m, '1h': candles1h };
  }

  for (const pmEvent of pmEvents) {
    const { coin, symbol: pair, marketKey, label, timeframeMinutes: tfMin, priceGap: pmBotGap } = pmEvent;
    const cache = candleCache[coin];
    if (!cache) continue;

    // Select candles based on event timeframe
    const tf = tfMin <= 5 ? '5m' : '15m';
    const htfTf = tfMin <= 5 ? '15m' : '1h';
    const eventCandles = cache[tf] || [];
    const htfCandles = cache[htfTf] || [];

    if (eventCandles.length < 10 || htfCandles.length < 10) continue;

    const bybitPrice = eventCandles.length > 0 ? eventCandles[eventCandles.length - 1][4] : 0;
    const oraclePrice = oraclePrices[pair] || bybitPrice;
    
    // Use PM bot's gap data if available, otherwise calculate
    let gapUsd, gapPct;
    if (pmBotGap && pmBotGap.gapUsd !== undefined) {
      gapUsd = pmBotGap.gapUsd;
      gapPct = pmBotGap.gapPercent || 0;
    } else {
      gapUsd = Math.abs(oraclePrice - bybitPrice);
      gapPct = oraclePrice > 0 ? (gapUsd / oraclePrice) * 100 : 0;
    }

    // Estimate time to settle (next even boundary)
    const now = Date.now();
    const intervalMs = tfMin * 60_000;
    const nextSettle = Math.ceil(now / intervalMs) * intervalMs;
    const timeToSettle = Math.round((nextSettle - now) / 1000);

    // Calculate volume ratio for this event's candles
    const volRatio = calcVolumeRatio(eventCandles);

    // Generate signals for BOTH directions (UP + DOWN)
    for (const side of ['UP', 'DOWN']) {
      const analysis = analyzeSide(eventCandles, htfCandles, side);
      const filter = checkFilters(eventCandles.length, gapPct, timeToSettle, side, analysis.base, regime, volRatio);

      let confidence = filter.pass
        ? calculatePMConfidence(analysis.base, side, regime, gapPct, timeToSettle)
        : 0;

      // ── Phase 1 Filter: Oracle Gap Penalty & Hard Skip ──
      let oracleGapWarning = undefined;
      let oracleSkipReason = undefined;
      if (filter.pass && oraclePrice > 0 && bybitPrice > 0) {
        const oracleGapCalc = Math.abs((oraclePrice - bybitPrice) / oraclePrice) * 100;
        if (oracleGapCalc > 1.0) {
          oracleSkipReason = `Oracle gap ${oracleGapCalc.toFixed(2)}% >1.0% - too risky`;
        } else if (oracleGapCalc > 0.5) {
          confidence = Math.max(0, confidence - 10);
          oracleGapWarning = `${oracleGapCalc.toFixed(2)}% gap - settlement risk`;
        }
      }

      // ── Phase 1 Filter: Asymmetric Confidence per Regime ──
      let regimeSkipReason = undefined;
      if (filter.pass && !oracleSkipReason && regime) {
        if (regime.regime === 'BULLISH') {
          if (side === 'UP' && confidence < 60) {
            regimeSkipReason = `Bullish UP needs ≥60% conf (got ${confidence}%)`;
          }
          if (side === 'DOWN' && confidence < 75) {
            regimeSkipReason = `Counter-trend DOWN needs ≥75% conf in BULLISH (got ${confidence}%)`;
          }
        }
        if (regime.regime === 'BEARISH') {
          if (side === 'DOWN' && confidence < 60) {
            regimeSkipReason = `Bearish DOWN needs ≥60% conf (got ${confidence}%)`;
          }
          if (side === 'UP' && confidence < 75) {
            regimeSkipReason = `Counter-trend UP needs ≥75% conf in BEARISH (got ${confidence}%)`;
          }
        }
      }

      // Determine final skip status
      const phase1Skip = oracleSkipReason || regimeSkipReason;
      const finalSkip = !filter.pass || !!phase1Skip || confidence < 30;
      const finalSkipReason = !filter.pass ? filter.reason
        : oracleSkipReason ? oracleSkipReason
        : regimeSkipReason ? regimeSkipReason
        : (confidence < 30 ? `Low confidence (${confidence}%)` : undefined);

      const reasonParts = [
        ...analysis.details.slice(0, 4),
        regime ? `Regime=${regime.regime}(${regime.confidence}%)` : null,
        `Gap=${gapPct.toFixed(2)}%`,
        oracleGapWarning ? `⚠️${oracleGapWarning}` : null,
        `TTL=${timeToSettle}s`,
      ].filter(Boolean).join(' | ');

      // ── Hard Filter: Skip "Geen trenddata" signals (50% WR = coinflip) ──
      if (reasonParts.includes('Geen trenddata')) {
        allSignals.push({
          event: `${coin} ${tf} ${side}`,
          symbol: pair,
          marketKey,
          timeframeMinutes: tfMin,
          side,
          confidence: 0,
          reason: reasonParts,
          skipTrade: true,
          skipReason: 'Missing trend data - insufficient candle history',
          oraclePrice,
          bybitPrice,
          priceGap: { usd: Number(gapUsd.toFixed ? gapUsd.toFixed(2) : gapUsd), percent: Number(gapPct.toFixed ? gapPct.toFixed(3) : gapPct) },
          timeToSettle,
          trend: analysis.trendLabel,
          momentum: analysis.momentum,
          volatility: Number(analysis.atrPct.toFixed(4)),
        });
        continue;
      }

      allSignals.push({
        event: `${coin} ${tf} ${side}`,
        symbol: pair,
        marketKey,
        timeframeMinutes: tfMin,
        side,
        confidence,
        reason: reasonParts,
        skipTrade: finalSkip,
        skipReason: finalSkipReason,
        ...(oracleGapWarning ? { oracleGapWarning } : {}),

        oraclePrice,
        bybitPrice,
        priceGap: { usd: Number(gapUsd.toFixed ? gapUsd.toFixed(2) : gapUsd), percent: Number(gapPct.toFixed ? gapPct.toFixed(3) : gapPct) },
        timeToSettle,

        trend: analysis.trendLabel,
        momentum: analysis.momentum,
        volatility: Number(analysis.atrPct.toFixed(4)),
      });
    }
  }

  const output = {
    timestamp: new Date().toISOString(),
    regime: regime?.regime || 'UNKNOWN',
    regimeConfidence: regime?.confidence || 0,
    signals: allSignals,
    scanDurationMs: Date.now() - scanStart,
  };

  // Atomic write
  const tmpFile = OUTPUT_FILE + '.tmp';
  writeFileSync(tmpFile, JSON.stringify(output, null, 2), 'utf-8');
  const fs = require('node:fs');
  try { fs.renameSync(tmpFile, OUTPUT_FILE); }
  catch { writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8'); try { fs.unlinkSync(tmpFile); } catch {} }

  // Console summary
  const tradeable = allSignals.filter(s => !s.skipTrade && s.confidence >= 50);
  const summary = tradeable.length > 0
    ? tradeable.map(s => `${s.event}:${s.confidence}%`).join(' | ')
    : 'no tradeable signals';
  console.log(`[PM-SCAN] ${new Date().toISOString().slice(11, 19)} regime=${output.regime} signals=${allSignals.length} tradeable=${tradeable.length} (${summary}) [${output.scanDurationMs}ms]`);

  return output;
}

async function main() {
  console.log('[PM-SCAN] Starting PM Scanner Daemon...');
  console.log(`[PM-SCAN] Events source: ${PM_BOT_STATE_URL} | Interval: ${SCAN_INTERVAL_MS / 1000}s`);
  console.log(`[PM-SCAN] Output: ${OUTPUT_FILE}`);

  await initExchange();
  console.log('[PM-SCAN] Exchange initialized (Bybit via CCXT)');

  // Initial scan
  await runScan();

  // Recurring scans
  setInterval(async () => {
    try { await runScan(); }
    catch (err) { console.error('[PM-SCAN] Scan error:', err.message); }
  }, SCAN_INTERVAL_MS);
}

main().catch(err => { console.error('[PM-SCAN] Fatal:', err); process.exit(1); });
