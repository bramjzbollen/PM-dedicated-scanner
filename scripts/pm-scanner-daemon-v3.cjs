/**
 * PM Scanner Daemon v3 — Pyth Oracle + Velocity + Timing
 * 
 * Three key improvements over v2:
 * ─────────────────────────────────────────────────────────────────────────
 * 1. PYTH NETWORK replaces CoinGecko as oracle source
 *    → Sub-second price data from Hermes API (free, no rate limits)
 *    → Much more accurate oracle gap measurement
 *    → Falls back to CoinGecko if Pyth is unavailable
 * 
 * 2. PRICE VELOCITY PROJECTION (new factor, 0-25 pts)
 *    → Tracks Bybit price every 10s in a ring buffer per coin
 *    → Calculates velocity over 30s, 60s, 120s windows
 *    → Projects where price is heading at settlement time
 *    → Replaces micro-momentum candle analysis (more granular)
 * 
 * 3. OPTIMAL ENTRY TIMING
 *    → Sweet spot: 120-180s before settlement (most data, still time to settle)
 *    → Too early (>180s): reduce confidence — too much uncertainty
 *    → Too late (<90s): hard skip — not enough time
 *    → Inverted from v2: v2 gave bonus for MORE time, v3 gives bonus for LESS
 * ─────────────────────────────────────────────────────────────────────────
 * 
 * Usage: node scripts/pm-scanner-daemon-v3.cjs
 */

const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const OUTPUT_FILE = join(__dirname, '..', 'public', 'pm-signals.json');
const REGIME_FILE = join(__dirname, '..', 'public', 'pm-market-regime.json');
const CALIBRATION_FILE = join(__dirname, '..', 'public', 'pm-confidence-calibration.json');
const SCAN_INTERVAL_MS = 10_000;
const PM_BOT_STATE_URL = 'http://localhost:3000/api/pm-bot/state';

// ─── Config ───

const CONFIG = {
  minTradeConfidence: 58,
  oracleGap: {
    strongEdgePct: 0.20,  // v3: lowered from 0.25 — Pyth is more accurate
    mildEdgePct: 0.08,    // v3: lowered from 0.10
    dangerPct: 1.5,
  },
  // v3: Entry timing sweet spot
  timing: {
    hardSkipBelow: 90,     // <90s = too late, hard skip
    sweetSpotMin: 120,     // 120-180s = ideal window
    sweetSpotMax: 180,
    earlyPenaltyAbove: 180, // >180s = too early, reduce confidence
  },
  // v3: Velocity config
  velocity: {
    bufferSize: 24,         // 24 snapshots × 10s = 4 minutes of history
    windows: [3, 6, 12],    // 30s, 60s, 120s lookback windows
    strongThresholdPct: 0.05, // >0.05% per 30s = strong momentum
    mildThresholdPct: 0.02,
  },
  ema: { fast: 3, slow: 8 },
  rsiPeriod: 6,
  minCalibrationSamples: 30,
};

// ─── Technical Indicators ───

function calcEMA(data, period) {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calcRSI(closes, period) {
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
    if (age > 300_000) return null;
    return raw;
  } catch { return null; }
}

// ─── Calibration ───

let calibrationCache = null;
let calibrationCacheTime = 0;

function readCalibration() {
  const now = Date.now();
  if (calibrationCache && now - calibrationCacheTime < 60_000) return calibrationCache;
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
  const entry = cal.calibration[key];
  if (!entry || !entry.reliable || entry.total < CONFIG.minCalibrationSamples) return rawConf;
  return Math.round(rawConf * (entry.multiplier || 1.0));
}

// ═══════════════════════════════════════════════════════════════════════
// IMPROVEMENT 1: PYTH NETWORK ORACLE (replaces CoinGecko)
// ═══════════════════════════════════════════════════════════════════════

const PYTH_HERMES_URL = 'https://hermes.pyth.network/v2/updates/price/latest';

// Pyth price feed IDs (stable channel)
const PYTH_FEED_IDS = {
  'BTC/USDT': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USDT': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL/USDT': 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'XRP/USDT': 'ec5d399bc6d2c1d3e7bd0df07a7b06e12ae4177bc6d84b40faf2c3a7b94d2a1c', // will verify at startup
};

// CoinGecko fallback
const COINGECKO_IDS = {
  'BTC/USDT': 'bitcoin',
  'ETH/USDT': 'ethereum',
  'SOL/USDT': 'solana',
  'XRP/USDT': 'ripple',
};

let oraclePriceCache = {};
let oracleCacheTime = 0;
let oracleSource = 'none'; // 'pyth' | 'coingecko' | 'none'

async function fetchPythPrices() {
  const ids = Object.values(PYTH_FEED_IDS);
  const idParams = ids.map(id => `ids[]=0x${id}`).join('&');
  const url = `${PYTH_HERMES_URL}?${idParams}&parsed=true`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000); // 3s timeout (Pyth is fast)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);

    const data = await res.json();
    const prices = {};

    // Build reverse lookup: feedId → pair
    const feedToPair = {};
    for (const [pair, feedId] of Object.entries(PYTH_FEED_IDS)) {
      feedToPair[feedId] = pair;
    }

    // Parse Pyth response
    if (data.parsed && Array.isArray(data.parsed)) {
      for (const feed of data.parsed) {
        const feedId = feed.id; // without 0x prefix
        const pair = feedToPair[feedId];
        if (!pair) continue;

        const priceData = feed.price;
        if (!priceData) continue;

        // Pyth returns price as integer + exponent
        // e.g. price=8342150000000, expo=-8 → $83421.50000000
        const price = Number(priceData.price) * Math.pow(10, priceData.expo);
        const conf = Number(priceData.conf) * Math.pow(10, priceData.expo);
        const publishTime = priceData.publish_time;
        const age = Math.round(Date.now() / 1000 - publishTime);

        if (price > 0 && age < 30) { // Only use if <30s old
          prices[pair] = price;
        }
      }
    }

    if (Object.keys(prices).length > 0) {
      oraclePriceCache = prices;
      oracleCacheTime = Date.now();
      oracleSource = 'pyth';
      return prices;
    }

    throw new Error('No valid Pyth prices parsed');
  } catch (err) {
    // Don't spam logs — only log on first failure or every 60s
    if (oracleSource !== 'coingecko') {
      console.warn(`[PM-V3] Pyth fetch failed (${err.message}), falling back to CoinGecko`);
    }
    return null; // Signal caller to use fallback
  }
}

async function fetchCoinGeckoPrices() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&precision=8`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return oraclePriceCache;
    const data = await res.json();
    const prices = {};
    for (const [pair, cgId] of Object.entries(COINGECKO_IDS)) {
      if (data[cgId]?.usd) prices[pair] = data[cgId].usd;
    }
    oraclePriceCache = prices;
    oracleCacheTime = Date.now();
    oracleSource = 'coingecko';
    return prices;
  } catch (err) {
    console.error('[PM-V3] CoinGecko fallback also failed:', err.message);
    return oraclePriceCache;
  }
}

async function fetchOraclePrices() {
  const now = Date.now();
  // Pyth is fast — only cache for 5s (vs 15s for CoinGecko)
  const cacheTTL = oracleSource === 'pyth' ? 5_000 : 15_000;
  if (now - oracleCacheTime < cacheTTL && Object.keys(oraclePriceCache).length > 0) {
    return oraclePriceCache;
  }

  // Try Pyth first, fall back to CoinGecko
  const pythPrices = await fetchPythPrices();
  if (pythPrices && Object.keys(pythPrices).length >= 2) {
    return pythPrices;
  }
  return fetchCoinGeckoPrices();
}

// ═══════════════════════════════════════════════════════════════════════
// IMPROVEMENT 2: PRICE VELOCITY PROJECTION
// ═══════════════════════════════════════════════════════════════════════

// Ring buffer of price snapshots per coin: { timestamp, price }[]
const priceHistory = {}; // { 'BTC': [{ts, price}, ...], 'ETH': [...] }

function recordPriceSnapshot(coin, price) {
  if (!priceHistory[coin]) priceHistory[coin] = [];
  priceHistory[coin].push({ ts: Date.now(), price });
  // Keep only last N snapshots
  if (priceHistory[coin].length > CONFIG.velocity.bufferSize) {
    priceHistory[coin].shift();
  }
}

/**
 * Calculate price velocity over multiple time windows.
 * Returns: { velocity30s, velocity60s, velocity120s, projectedPrice, direction, strength }
 */
function calcVelocity(coin, currentPrice, secondsToSettle) {
  const history = priceHistory[coin];
  if (!history || history.length < 3) {
    return { velocity30s: 0, velocity60s: 0, velocity120s: 0, projectedPrice: currentPrice, direction: 'FLAT', strength: 0 };
  }

  const now = Date.now();
  const windows = CONFIG.velocity.windows; // [3, 6, 12] snapshots = [30s, 60s, 120s]
  const velocities = [];

  for (const lookback of windows) {
    const idx = Math.max(0, history.length - lookback);
    const oldSnap = history[idx];
    if (!oldSnap || oldSnap.price <= 0) { velocities.push(0); continue; }
    const elapsed = (now - oldSnap.ts) / 1000;
    if (elapsed < 5) { velocities.push(0); continue; } // too short
    const pctChange = ((currentPrice - oldSnap.price) / oldSnap.price) * 100;
    const pctPerSec = pctChange / elapsed;
    velocities.push(pctPerSec);
  }

  const [vel30s, vel60s, vel120s] = velocities;

  // Weighted average: recent velocity matters more
  const weightedVel = vel30s * 0.5 + vel60s * 0.3 + vel120s * 0.2;

  // Project price at settlement
  const projectedPctChange = weightedVel * secondsToSettle;
  const projectedPrice = currentPrice * (1 + projectedPctChange / 100);

  // Direction and strength
  const allSameDirection = (vel30s >= 0 && vel60s >= 0 && vel120s >= 0) ||
                            (vel30s <= 0 && vel60s <= 0 && vel120s <= 0);
  const avgAbsVel = (Math.abs(vel30s) + Math.abs(vel60s) + Math.abs(vel120s)) / 3;

  let direction = 'FLAT';
  let strength = 0;

  if (allSameDirection && avgAbsVel > 0.0001) {
    direction = weightedVel > 0 ? 'UP' : 'DOWN';
    // Strength: how consistent and fast
    const consistency = allSameDirection ? 1.5 : 1.0;
    const speed = Math.min(avgAbsVel / 0.001, 3.0); // normalize: 0.001%/s is moderate
    strength = Math.min(consistency * speed, 5.0); // 0-5 scale
  }

  return {
    velocity30s: Number((vel30s * 30).toFixed(4)), // convert to %/30s for readability
    velocity60s: Number((vel60s * 60).toFixed(4)),
    velocity120s: Number((vel120s * 120).toFixed(4)),
    projectedPrice: Number(projectedPrice.toFixed(8)),
    projectedPctChange: Number(projectedPctChange.toFixed(4)),
    direction,
    strength: Number(strength.toFixed(2)),
  };
}

// ─── PM Events Fetcher ───

let eventsCache = [];
let eventsCacheTime = 0;

async function fetchPMEvents() {
  const now = Date.now();
  if (now - eventsCacheTime < 5_000 && eventsCache.length > 0) return eventsCache;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(PM_BOT_STATE_URL, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return eventsCache;
    const state = await res.json();
    const events = (state.events || []).filter(e => e.enabled).map(e => {
      const coin = (e.symbol || '').split('/')[0];
      const tfMatch = (e.marketKey || e.label || '').match(/(\d+)M/i);
      const timeframeMinutes = tfMatch ? parseInt(tfMatch[1]) : 5;
      return {
        symbol: e.symbol, coin, marketKey: e.marketKey, label: e.label,
        timeframeMinutes,
        suggestedSide: e.suggestedSide || null,
        priceGap: e.priceGap || null,
      };
    });
    eventsCache = events;
    eventsCacheTime = now;
    return events;
  } catch (err) {
    console.error('[PM-V3] PM events fetch error:', err.message);
    return eventsCache;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// v3 SIGNAL ENGINE
// ═══════════════════════════════════════════════════════════════════════

/**
 * v3 Scoring breakdown (max ~110 pts before calibration):
 *   Oracle Gap Signal:      0-30 pts  (PRIMARY — this IS the edge)
 *   Price Velocity:          0-25 pts  (NEW — projects settlement direction)
 *   Fast EMA Trend:          0-15 pts  (confirms direction)
 *   RSI-6 Momentum:          0-10 pts  (short-term RSI)
 *   VWAP Position:           0-10 pts  (above/below VWAP)
 *   Volume Weight:           0-5 pts   (conviction, not gate)
 *   Entry Timing Bonus:     -15 to +10 pts (NEW — sweet spot = bonus)
 *   Regime Adjustment:      -10 to +10 pts
 *   HTF Confirmation:       -3 to +5 pts
 */
function analyzeEvent(eventCandles, htfCandles, oraclePrice, bybitPrice, regime, timeToSettle, coin) {
  const closes = eventCandles.map(c => c[4]);
  const volumes = eventCandles.map(c => c[5]);
  const currentPrice = closes[closes.length - 1] || 0;
  const details = [];

  if (closes.length < 10) return null;

  // ════════════════════════════════════════════════════
  // IMPROVEMENT 3: ENTRY TIMING — hard skip if too late
  // ════════════════════════════════════════════════════
  if (timeToSettle < CONFIG.timing.hardSkipBelow) {
    return {
      side: null, confidence: 0, details: [`TTL ${timeToSettle}s < ${CONFIG.timing.hardSkipBelow}s (too late)`],
      skipTrade: true, skipReason: `TTL ${timeToSettle}s below hard minimum ${CONFIG.timing.hardSkipBelow}s`,
      oraclePrice, bybitPrice, gapPct: 0, timeToSettle,
      trend: 'UNKNOWN', momentum: 0, volatility: 0,
    };
  }

  // ════════════════════════════════════════════════════
  // FACTOR 1: Oracle Gap Signal (0-30 pts) — PRIMARY
  // ════════════════════════════════════════════════════
  let oracleEdge = 0;
  let oracleSide = null;
  let gapPct = 0;

  if (oraclePrice > 0 && bybitPrice > 0) {
    const signedGapPct = ((bybitPrice - oraclePrice) / oraclePrice) * 100;
    gapPct = Math.abs(signedGapPct);

    if (gapPct > CONFIG.oracleGap.dangerPct) {
      return {
        side: null, confidence: 0,
        details: [`Oracle gap ${gapPct.toFixed(3)}% > danger threshold`],
        skipTrade: true, skipReason: `Oracle gap ${gapPct.toFixed(3)}% too large`,
        oraclePrice, bybitPrice, gapPct, timeToSettle,
        trend: 'UNKNOWN', momentum: 0, volatility: 0,
      };
    }

    if (gapPct > CONFIG.oracleGap.strongEdgePct) {
      oracleSide = signedGapPct > 0 ? 'DOWN' : 'UP';
      oracleEdge = 30;
      details.push(`Oracle(${oracleSource}) gap ${signedGapPct.toFixed(3)}% → strong ${oracleSide}`);
    } else if (gapPct > CONFIG.oracleGap.mildEdgePct) {
      oracleSide = signedGapPct > 0 ? 'DOWN' : 'UP';
      oracleEdge = 15;
      details.push(`Oracle(${oracleSource}) gap ${signedGapPct.toFixed(3)}% → mild ${oracleSide}`);
    } else {
      details.push(`Oracle gap ${signedGapPct.toFixed(3)}% (minimal)`);
    }
  }

  // ════════════════════════════════════════════════════
  // FACTOR 2: PRICE VELOCITY (0-25 pts) — NEW in v3
  // ════════════════════════════════════════════════════
  const velocity = calcVelocity(coin, currentPrice, timeToSettle);
  let velUp = 0, velDown = 0;

  if (velocity.direction === 'UP' && velocity.strength > 0) {
    if (velocity.strength >= 3.0) { velUp = 25; details.push(`Velocity strong UP (${velocity.velocity30s}%/30s)`); }
    else if (velocity.strength >= 1.5) { velUp = 15; details.push(`Velocity UP (${velocity.velocity30s}%/30s)`); }
    else { velUp = 8; }
  } else if (velocity.direction === 'DOWN' && velocity.strength > 0) {
    if (velocity.strength >= 3.0) { velDown = 25; details.push(`Velocity strong DOWN (${velocity.velocity30s}%/30s)`); }
    else if (velocity.strength >= 1.5) { velDown = 15; details.push(`Velocity DOWN (${velocity.velocity30s}%/30s)`); }
    else { velDown = 8; }
  }

  // ════════════════════════════════════════════════════
  // FACTOR 3: Fast EMA Trend (0-15 pts)
  // ════════════════════════════════════════════════════
  const emaFast = calcEMA(closes, CONFIG.ema.fast);
  const emaSlow = calcEMA(closes, CONFIG.ema.slow);
  const last = closes.length - 1;
  const ef = emaFast[last], es = emaSlow[last];
  let emaUp = 0, emaDown = 0;
  const emaDist = ef && es ? ((ef - es) / es) * 100 : 0;
  if (emaDist > 0.05) { emaUp = 15; } else if (emaDist > 0.01) { emaUp = 8; }
  else if (emaDist < -0.05) { emaDown = 15; } else if (emaDist < -0.01) { emaDown = 8; }

  // ════════════════════════════════════════════════════
  // FACTOR 4: RSI-6 (0-10 pts)
  // ════════════════════════════════════════════════════
  const rsi = calcRSI(closes, CONFIG.rsiPeriod);
  let rsiUp = 0, rsiDown = 0;
  if (rsi > 65) { rsiUp = 10; } else if (rsi > 55) { rsiUp = 5; }
  else if (rsi < 35) { rsiDown = 10; } else if (rsi < 45) { rsiDown = 5; }

  // ════════════════════════════════════════════════════
  // FACTOR 5: VWAP (0-10 pts)
  // ════════════════════════════════════════════════════
  const vwap = calcVWAP(eventCandles);
  let vwapUp = 0, vwapDown = 0;
  if (vwap > 0) {
    const vwapDist = ((currentPrice - vwap) / vwap) * 100;
    if (vwapDist > 0.10) { vwapUp = 10; } else if (vwapDist > 0.03) { vwapUp = 5; }
    else if (vwapDist < -0.10) { vwapDown = 10; } else if (vwapDist < -0.03) { vwapDown = 5; }
  }

  // ════════════════════════════════════════════════════
  // FACTOR 6: Volume (0-5 pts)
  // ════════════════════════════════════════════════════
  let volBonus = 0;
  if (volumes.length >= 10) {
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    const volRatio = avgVol > 0 ? volumes[volumes.length - 1] / avgVol : 1;
    if (volRatio > 2.0) { volBonus = 5; } else if (volRatio > 1.5) { volBonus = 3; } else if (volRatio > 1.0) { volBonus = 1; }
  }

  // ════════════════════════════════════════════════════
  // DETERMINE BEST SIDE
  // ════════════════════════════════════════════════════
  const taUp = velUp + emaUp + rsiUp + vwapUp;
  const taDown = velDown + emaDown + rsiDown + vwapDown;

  let bestSide;
  let taScore;

  if (oracleSide) {
    bestSide = oracleSide;
    const taFor = oracleSide === 'UP' ? taUp : taDown;
    const taAgainst = oracleSide === 'UP' ? taDown : taUp;

    if (taFor >= taAgainst) {
      taScore = taFor;
      details.push('TA+velocity confirm oracle');
    } else {
      // v3: velocity disagreeing with oracle is a stronger negative signal
      const disagreement = taAgainst - taFor;
      if (disagreement > 20) {
        // Strong disagreement: velocity says opposite of oracle — skip
        details.push(`TA+velocity STRONGLY disagree (${disagreement}pts against oracle)`);
        taScore = 0;
      } else {
        taScore = Math.max(0, taFor - disagreement);
        details.push(`TA+velocity weakly diverge (-${disagreement})`);
      }
    }
  } else {
    if (taUp > taDown) { bestSide = 'UP'; taScore = taUp; }
    else if (taDown > taUp) { bestSide = 'DOWN'; taScore = taDown; }
    else {
      return {
        side: null, confidence: 0, details: [...details, 'No edge'],
        skipTrade: true, skipReason: 'No oracle edge and no TA/velocity edge',
        oraclePrice, bybitPrice, gapPct, timeToSettle,
        trend: 'NEUTRAL', momentum: 0, volatility: 0,
      };
    }
    details.push('Pure TA+velocity signal (no oracle edge)');
  }

  // ════════════════════════════════════════════════════
  // COMPOSITE CONFIDENCE
  // ════════════════════════════════════════════════════
  let rawConf = oracleEdge + taScore + volBonus;

  // ── IMPROVEMENT 3: Entry Timing Bonus ──
  let timingBonus = 0;
  if (timeToSettle >= CONFIG.timing.sweetSpotMin && timeToSettle <= CONFIG.timing.sweetSpotMax) {
    timingBonus = 10; // Sweet spot: most of candle visible, still time to settle
    details.push(`Timing SWEET SPOT (${timeToSettle}s) +10`);
  } else if (timeToSettle > CONFIG.timing.sweetSpotMax) {
    // Too early: penalize proportionally
    const overBy = timeToSettle - CONFIG.timing.sweetSpotMax;
    timingBonus = -Math.min(Math.round(overBy / 15), 15); // -1 per 15s over, max -15
    details.push(`Timing early (${timeToSettle}s) ${timingBonus}`);
  } else {
    // Between hardSkip and sweetSpotMin: slight penalty
    timingBonus = -5;
    details.push(`Timing late (${timeToSettle}s) -5`);
  }
  rawConf += timingBonus;

  // ── Regime Adjustment ──
  if (regime) {
    const state = regime.regime;
    if (state === 'BULLISH' || state === 'MILD_BULLISH') {
      const bonus = state === 'BULLISH' ? 10 : 5;
      rawConf += (bestSide === 'UP') ? bonus : -bonus;
    } else if (state === 'BEARISH' || state === 'MILD_BEARISH') {
      const bonus = state === 'BEARISH' ? 10 : 5;
      rawConf += (bestSide === 'DOWN') ? bonus : -bonus;
    } else if (state === 'RANGING') {
      rawConf -= 5;
    } else if (state === 'HIGH_VOLATILITY') {
      rawConf -= 8;
    }
  }

  // ── HTF confirmation ──
  if (htfCandles && htfCandles.length >= 10) {
    const htfCloses = htfCandles.map(c => c[4]);
    const htfEmaFast = calcEMA(htfCloses, 3);
    const htfEmaSlow = calcEMA(htfCloses, 8);
    const htfLast = htfCloses.length - 1;
    const htfDir = htfEmaFast[htfLast] > htfEmaSlow[htfLast] ? 'UP' : 'DOWN';
    if (htfDir === bestSide) { rawConf += 5; } else { rawConf -= 3; }
  }

  // ── Calibration ──
  const calibratedConf = applyCalibratedConfidence(rawConf);
  const finalConf = clamp(Math.round(calibratedConf), 0, 100);

  const atr = calcATR(eventCandles, 14);
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  const trendLabel = (taUp - taDown) > 10 ? 'BULLISH' : (taDown - taUp) > 10 ? 'BEARISH' : 'NEUTRAL';

  return {
    side: bestSide,
    confidence: finalConf,
    details,
    skipTrade: finalConf < CONFIG.minTradeConfidence || timeToSettle < CONFIG.timing.hardSkipBelow,
    skipReason: finalConf < CONFIG.minTradeConfidence
      ? `Confidence ${finalConf}% < ${CONFIG.minTradeConfidence}%`
      : timeToSettle < CONFIG.timing.hardSkipBelow
        ? `TTL ${timeToSettle}s too late`
        : undefined,
    oraclePrice, bybitPrice, gapPct, timeToSettle,
    trend: trendLabel,
    momentum: clamp(Math.round((rsi - 50) * 2), -100, 100),
    volatility: Number(atrPct.toFixed(4)),
    scoring: {
      oracleEdge,
      velocityScore: bestSide === 'UP' ? velUp : velDown,
      taScore,
      volBonus,
      timingBonus,
      rawConf,
      calibratedConf: finalConf,
      oracleSource,
    },
    velocity,
  };
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
    console.error(`[PM-V3] Fetch ${pair} ${timeframe} failed:`, err.message);
    return [];
  }
}

async function runScan() {
  const scanStart = Date.now();
  const regime = readRegime();
  const oraclePrices = await fetchOraclePrices();
  const pmEvents = await fetchPMEvents();

  if (pmEvents.length === 0) {
    console.warn('[PM-V3] No enabled PM events found');
    return null;
  }

  const allSignals = [];
  const coinSet = new Set(pmEvents.map(e => e.coin));
  const candleCache = {};

  for (const coin of coinSet) {
    const pair = `${coin}/USDT`;
    const [candles5m, candles15m] = await Promise.all([
      fetchCandles(pair, '5m', 50),
      fetchCandles(pair, '15m', 50),
    ]);
    candleCache[coin] = { '5m': candles5m, '15m': candles15m };

    // v3: Record price snapshot for velocity tracking
    const latest5m = candles5m.length > 0 ? candles5m[candles5m.length - 1][4] : 0;
    if (latest5m > 0) recordPriceSnapshot(coin, latest5m);
  }

  for (const pmEvent of pmEvents) {
    const { coin, symbol: pair, marketKey, label, timeframeMinutes: tfMin } = pmEvent;
    const cache = candleCache[coin];
    if (!cache) continue;

    const tf = tfMin <= 5 ? '5m' : '15m';
    const eventCandles = cache[tf] || [];
    const htfCandles = cache['15m'] || [];

    if (eventCandles.length < 10) continue;

    const bybitPrice = eventCandles[eventCandles.length - 1][4];
    const oraclePrice = oraclePrices[pair] || 0;

    const now = Date.now();
    const intervalMs = tfMin * 60_000;
    const nextSettle = Math.ceil(now / intervalMs) * intervalMs;
    const timeToSettle = Math.round((nextSettle - now) / 1000);

    const result = analyzeEvent(eventCandles, htfCandles, oraclePrice, bybitPrice, regime, timeToSettle, coin);
    if (!result) continue;

    allSignals.push({
      event: `${coin} ${tf} ${result.side || '?'}`,
      symbol: pair,
      marketKey,
      timeframeMinutes: tfMin,
      side: result.side,
      confidence: result.confidence,
      reason: result.details.slice(0, 6).join(' | '),
      skipTrade: result.skipTrade,
      skipReason: result.skipReason,
      oraclePrice: result.oraclePrice,
      bybitPrice: result.bybitPrice,
      priceGap: {
        usd: Number(Math.abs(result.oraclePrice - result.bybitPrice).toFixed(2)),
        percent: Number(result.gapPct.toFixed(3)),
      },
      timeToSettle: result.timeToSettle,
      trend: result.trend,
      momentum: result.momentum,
      volatility: result.volatility,
      v3Scoring: result.scoring,
      velocity: result.velocity,
    });
  }

  const output = {
    timestamp: new Date().toISOString(),
    version: 'v3-pyth-velocity-timing',
    regime: regime?.regime || 'UNKNOWN',
    regimeConfidence: regime?.confidence || 0,
    oracleSource,
    signals: allSignals,
    scanDurationMs: Date.now() - scanStart,
  };

  // Atomic write
  const tmpFile = OUTPUT_FILE + '.tmp';
  writeFileSync(tmpFile, JSON.stringify(output, null, 2), 'utf-8');
  const fs = require('node:fs');
  try { fs.renameSync(tmpFile, OUTPUT_FILE); }
  catch { writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8'); try { fs.unlinkSync(tmpFile); } catch {} }

  const tradeable = allSignals.filter(s => !s.skipTrade && s.confidence >= CONFIG.minTradeConfidence);
  const summary = tradeable.length > 0
    ? tradeable.map(s => `${s.event}:${s.confidence}%(o=${s.v3Scoring?.oracleEdge||0},v=${s.v3Scoring?.velocityScore||0},t=${s.v3Scoring?.timingBonus||0})`).join(' | ')
    : 'no tradeable signals';
  console.log(`[PM-V3] ${new Date().toISOString().slice(11, 19)} oracle=${oracleSource} regime=${output.regime} signals=${allSignals.length} tradeable=${tradeable.length} (${summary}) [${output.scanDurationMs}ms]`);

  return output;
}

async function main() {
  console.log('[PM-V3] Starting PM Scanner Daemon v3 (Pyth+Velocity+Timing)...');
  console.log(`[PM-V3] Oracle: Pyth Hermes (fallback: CoinGecko)`);
  console.log(`[PM-V3] Velocity: ${CONFIG.velocity.bufferSize} snapshots, windows=${CONFIG.velocity.windows.map(w => w*10+'s').join('/')}`);
  console.log(`[PM-V3] Timing: sweet=${CONFIG.timing.sweetSpotMin}-${CONFIG.timing.sweetSpotMax}s, skip<${CONFIG.timing.hardSkipBelow}s`);
  console.log(`[PM-V3] minConf=${CONFIG.minTradeConfidence}% | oracleEdge=${CONFIG.oracleGap.strongEdgePct}%/${CONFIG.oracleGap.mildEdgePct}%`);

  await initExchange();
  console.log('[PM-V3] Exchange initialized (Bybit via CCXT)');

  // Test Pyth connectivity
  const testPrices = await fetchPythPrices();
  if (testPrices && Object.keys(testPrices).length > 0) {
    console.log(`[PM-V3] Pyth oracle OK: ${Object.entries(testPrices).map(([k,v]) => `${k}=$${v.toFixed(2)}`).join(', ')}`);
  } else {
    console.warn('[PM-V3] Pyth unavailable at startup, will use CoinGecko fallback');
  }

  await runScan();

  setInterval(async () => {
    try { await runScan(); }
    catch (err) { console.error('[PM-V3] Scan error:', err.message); }
  }, SCAN_INTERVAL_MS);
}

main().catch(err => { console.error('[PM-V3] Fatal:', err); process.exit(1); });
