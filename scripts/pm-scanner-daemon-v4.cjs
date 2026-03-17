/**
 * PM Scanner Daemon v4 — Polymarket-Native Edge Scanner
 * 
 * THE FUNDAMENTAL SHIFT: We no longer just predict direction.
 * We measure our EDGE against the Polymarket orderbook odds.
 * 
 * Only bet when: ourProbability > pmOdds + fees
 * 
 * v4 Architecture:
 * ─────────────────────────────────────────────────────────────────────────
 * 1. PM MARKET DISCOVERY — Gamma API: find current 5m/15m UP/DOWN markets
 *    → Deterministic slug generation from timestamps
 *    → Auto-discovers token_ids for UP and DOWN outcomes
 * 
 * 2. PM ODDS FETCHING — CLOB API: get live orderbook + midpoint
 *    → Best bid/ask for UP and DOWN tokens
 *    → Spread analysis (wide spread = low confidence market)
 *    → Orderbook depth imbalance (more bids on UP = crowd bullish)
 * 
 * 3. EDGE CALCULATION — The core innovation
 *    → ourProbability = f(oracleGap, velocity, TA, regime)
 *    → pmImpliedProb = midpoint price of UP token
 *    → edge = ourProbability - pmImpliedProb
 *    → Only trade if edge > minEdge (covers fees + slippage)
 * 
 * 4. FLASH CRASH DETECTION — Track PM odds over time
 *    → If UP odds drop >0.12 in 15s while Bybit barely moves → buy crash
 *    → Mean reversion play: PM orderbook overreacts to small moves
 * 
 * 5. KELLY CRITERION SIZING — Optimal bet sizing per edge
 *    → f = (p*b - q) / b where p=ourProb, b=payout odds, q=1-p
 *    → Fractional Kelly (25%) for safety
 *    → Outputs recommended bet size as % of bankroll
 * 
 * 6. PYTH ORACLE + VELOCITY + TIMING from v3
 * ─────────────────────────────────────────────────────────────────────────
 * 
 * Usage: node scripts/pm-scanner-daemon-v4.cjs
 */

const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const OUTPUT_FILE = join(__dirname, '..', 'public', 'pm-signals.json');
const REGIME_FILE = join(__dirname, '..', 'public', 'pm-market-regime.json');
const CALIBRATION_FILE = join(__dirname, '..', 'public', 'pm-confidence-calibration.json');
const SCAN_INTERVAL_MS = 10_000;
const PM_BOT_STATE_URL = 'http://localhost:3000/api/pm-bot/state';

// ─── API Endpoints ───
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// ─── Config ───
const CONFIG = {
  // Edge thresholds (THIS is what makes v4 different)
  edge: {
    minEdge: 0.05,          // 5% minimum edge to trade (covers ~2% fees + slippage)
    strongEdge: 0.12,       // 12%+ = high conviction trade
    maxOdds: 0.88,          // Don't buy if odds > 88% (already priced in)
    minOdds: 0.12,          // Don't buy if odds < 12% (too extreme)
  },
  // Flash crash detection
  flashCrash: {
    dropThreshold: 0.12,    // 12 cent drop in odds = flash crash
    lookbackMs: 15_000,     // Over last 15 seconds
    recoveryBonus: 20,      // Extra confidence points for flash crash trades
  },
  // Kelly criterion
  kelly: {
    fraction: 0.25,         // 25% Kelly (conservative)
    maxBetPct: 10,          // Never bet more than 10% of bankroll
    minBetPct: 1,           // Minimum 1% to bother
  },
  // Oracle (Pyth primary, CoinGecko fallback)
  oracleGap: {
    strongEdgePct: 0.20,
    mildEdgePct: 0.08,
    dangerPct: 1.5,
  },
  // Timing
  timing: {
    hardSkipBelow: 90,
    sweetSpotMin: 120,
    sweetSpotMax: 180,
  },
  // Velocity
  velocity: {
    bufferSize: 24,
    windows: [3, 6, 12],
  },
  // TA
  ema: { fast: 3, slow: 8 },
  rsiPeriod: 6,
  // Coins to trade (focus on most liquid)
  coins: ['BTC', 'ETH'],  // v4: Focus on BTC+ETH only (most liquid PM markets)
  timeframes: [5, 15],     // 5m and 15m markets
  minCalibrationSamples: 30,
};

// ═══════════════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS (same as v3)
// ═══════════════════════════════════════════════════════════════════════

function calcEMA(data, period) {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  return ema;
}

function calcRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

function calcATR(candles, period = 14) {
  if (candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i][2] - candles[i][3], Math.abs(candles[i][2] - candles[i-1][4]), Math.abs(candles[i][3] - candles[i-1][4])));
  }
  if (trs.length < period) return trs.reduce((a, b) => a + b, 0) / trs.length;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// ═══════════════════════════════════════════════════════════════════════
// REGIME READER + CALIBRATION
// ═══════════════════════════════════════════════════════════════════════

function readRegime() {
  try {
    if (!existsSync(REGIME_FILE)) return null;
    const raw = JSON.parse(readFileSync(REGIME_FILE, 'utf-8'));
    if (Date.now() - new Date(raw.timestamp).getTime() > 300_000) return null;
    return raw;
  } catch { return null; }
}

let calibrationCache = null, calibrationCacheTime = 0;
function readCalibration() {
  const now = Date.now();
  if (calibrationCache && now - calibrationCacheTime < 60_000) return calibrationCache;
  try {
    if (!existsSync(CALIBRATION_FILE)) return null;
    const raw = JSON.parse(readFileSync(CALIBRATION_FILE, 'utf-8'));
    calibrationCache = raw?.calibration ? raw : null;
    calibrationCacheTime = now;
    return calibrationCache;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════
// PYTH ORACLE (from v3)
// ═══════════════════════════════════════════════════════════════════════

const PYTH_FEED_IDS = {
  'BTC/USDT': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USDT': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL/USDT': 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
};
const COINGECKO_IDS = { 'BTC/USDT': 'bitcoin', 'ETH/USDT': 'ethereum', 'SOL/USDT': 'solana' };

let oraclePriceCache = {}, oracleCacheTime = 0, oracleSource = 'none';

async function fetchPythPrices() {
  const ids = Object.values(PYTH_FEED_IDS);
  const url = `https://hermes.pyth.network/v2/updates/price/latest?${ids.map(id => `ids[]=0x${id}`).join('&')}&parsed=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const prices = {}, feedToPair = {};
    for (const [pair, fid] of Object.entries(PYTH_FEED_IDS)) feedToPair[fid] = pair;
    for (const feed of (data.parsed || [])) {
      const pair = feedToPair[feed.id];
      if (!pair || !feed.price) continue;
      const price = Number(feed.price.price) * Math.pow(10, feed.price.expo);
      const age = Math.round(Date.now() / 1000 - feed.price.publish_time);
      if (price > 0 && age < 30) prices[pair] = price;
    }
    if (Object.keys(prices).length > 0) { oraclePriceCache = prices; oracleCacheTime = Date.now(); oracleSource = 'pyth'; return prices; }
    throw new Error('No prices');
  } catch { return null; }
}

async function fetchCoinGeckoPrices() {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COINGECKO_IDS).join(',')}&vs_currencies=usd&precision=8`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return oraclePriceCache;
    const data = await res.json();
    const prices = {};
    for (const [pair, cgId] of Object.entries(COINGECKO_IDS)) if (data[cgId]?.usd) prices[pair] = data[cgId].usd;
    oraclePriceCache = prices; oracleCacheTime = Date.now(); oracleSource = 'coingecko';
    return prices;
  } catch { return oraclePriceCache; }
}

async function fetchOraclePrices() {
  const ttl = oracleSource === 'pyth' ? 5_000 : 15_000;
  if (Date.now() - oracleCacheTime < ttl && Object.keys(oraclePriceCache).length > 0) return oraclePriceCache;
  return (await fetchPythPrices()) || (await fetchCoinGeckoPrices());
}

// ═══════════════════════════════════════════════════════════════════════
// PRICE VELOCITY (from v3)
// ═══════════════════════════════════════════════════════════════════════

const priceHistory = {};
function recordPrice(coin, price) {
  if (!priceHistory[coin]) priceHistory[coin] = [];
  priceHistory[coin].push({ ts: Date.now(), price });
  if (priceHistory[coin].length > CONFIG.velocity.bufferSize) priceHistory[coin].shift();
}

function calcVelocity(coin, currentPrice, ttl) {
  const h = priceHistory[coin];
  if (!h || h.length < 3) return { direction: 'FLAT', strength: 0, projected: currentPrice };
  const now = Date.now();
  const vels = CONFIG.velocity.windows.map(lb => {
    const old = h[Math.max(0, h.length - lb)];
    if (!old || old.price <= 0) return 0;
    const elapsed = (now - old.ts) / 1000;
    return elapsed > 5 ? (((currentPrice - old.price) / old.price) * 100) / elapsed : 0;
  });
  const wv = vels[0] * 0.5 + vels[1] * 0.3 + vels[2] * 0.2;
  const projected = currentPrice * (1 + (wv * ttl) / 100);
  const allSame = (vels[0] >= 0 && vels[1] >= 0 && vels[2] >= 0) || (vels[0] <= 0 && vels[1] <= 0 && vels[2] <= 0);
  const avgAbs = vels.reduce((a, v) => a + Math.abs(v), 0) / 3;
  const dir = allSame && avgAbs > 0.0001 ? (wv > 0 ? 'UP' : 'DOWN') : 'FLAT';
  const str = allSame ? Math.min((avgAbs / 0.001) * 1.5, 5) : 0;
  return { direction: dir, strength: Number(str.toFixed(2)), projected: Number(projected.toFixed(8)) };
}

// ═══════════════════════════════════════════════════════════════════════
// NEW: POLYMARKET MARKET DISCOVERY + ODDS FETCHING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate deterministic PM market slug from coin + timeframe + current time.
 * Format: "btc-updown-5m-{unix_timestamp}" where timestamp = interval start
 */
function generatePMSlug(coin, tfMinutes) {
  const now = Math.floor(Date.now() / 1000);
  const intervalSec = tfMinutes * 60;
  const intervalStart = Math.floor(now / intervalSec) * intervalSec;
  return `${coin.toLowerCase()}-updown-${tfMinutes}m-${intervalStart}`;
}

// Cache for PM market data (token IDs, etc.)
const pmMarketCache = {};
const PM_MARKET_CACHE_TTL = 30_000; // 30s

/**
 * Discover current PM market and get token IDs via Gamma API
 */
async function discoverPMMarket(coin, tfMinutes) {
  const slug = generatePMSlug(coin, tfMinutes);
  const cacheKey = slug;
  const cached = pmMarketCache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < PM_MARKET_CACHE_TTL) return cached.data;

  try {
    const url = `${GAMMA_API}/events?slug=${slug}&active=true&closed=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) return null;

    const event = events[0];
    const market = event.markets?.[0];
    if (!market) return null;

    // Parse token IDs and outcome prices
    let tokenIds, outcomePrices, outcomes;
    try {
      tokenIds = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : market.clobTokenIds;
      outcomePrices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices;
      outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes;
    } catch { return null; }

    if (!tokenIds || tokenIds.length < 2) return null;

    // Determine which token is UP and which is DOWN
    const upIdx = outcomes?.indexOf('Up') ?? outcomes?.indexOf('Yes') ?? 0;
    const downIdx = upIdx === 0 ? 1 : 0;

    const result = {
      slug,
      eventId: event.id,
      marketId: market.id,
      conditionId: market.conditionId,
      question: market.question,
      upTokenId: tokenIds[upIdx],
      downTokenId: tokenIds[downIdx],
      upPrice: parseFloat(outcomePrices?.[upIdx]) || 0.5,
      downPrice: parseFloat(outcomePrices?.[downIdx]) || 0.5,
      endDate: market.endDate || event.endDate,
    };

    pmMarketCache[cacheKey] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (err) {
    console.error(`[PM-V4] Gamma API error for ${slug}:`, err.message);
    return null;
  }
}

/**
 * Fetch live CLOB orderbook data for a token
 * Returns: { midpoint, bestBid, bestAsk, spread, bidDepth, askDepth }
 */
async function fetchCLOBData(tokenId) {
  if (!tokenId) return null;
  try {
    // Fetch midpoint + orderbook in parallel
    const [midRes, bookRes] = await Promise.all([
      fetch(`${CLOB_API}/midpoint?token_id=${tokenId}`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${CLOB_API}/book?token_id=${tokenId}`, { signal: AbortSignal.timeout(3000) }),
    ]);

    let midpoint = 0.5;
    if (midRes.ok) {
      const midData = await midRes.json();
      midpoint = parseFloat(midData.mid) || 0.5;
    }

    let bestBid = 0, bestAsk = 1, bidDepth = 0, askDepth = 0;
    if (bookRes.ok) {
      const book = await bookRes.json();
      const bids = book.bids || [];
      const asks = book.asks || [];
      if (bids.length > 0) { bestBid = parseFloat(bids[0].price) || 0; bidDepth = bids.reduce((s, b) => s + parseFloat(b.size || 0), 0); }
      if (asks.length > 0) { bestAsk = parseFloat(asks[0].price) || 1; askDepth = asks.reduce((s, a) => s + parseFloat(a.size || 0), 0); }
    }

    return {
      midpoint,
      bestBid,
      bestAsk,
      spread: bestAsk - bestBid,
      bidDepth: Number(bidDepth.toFixed(2)),
      askDepth: Number(askDepth.toFixed(2)),
      imbalance: (bidDepth + askDepth) > 0 ? Number(((bidDepth - askDepth) / (bidDepth + askDepth)).toFixed(3)) : 0,
    };
  } catch (err) {
    console.error(`[PM-V4] CLOB fetch error:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NEW: FLASH CRASH DETECTION
// ═══════════════════════════════════════════════════════════════════════

// Ring buffer of PM odds per market: { ts, upOdds, downOdds }[]
const oddsHistory = {};

function recordOdds(slug, upOdds, downOdds) {
  if (!oddsHistory[slug]) oddsHistory[slug] = [];
  oddsHistory[slug].push({ ts: Date.now(), upOdds, downOdds });
  if (oddsHistory[slug].length > 30) oddsHistory[slug].shift(); // 30 × 10s = 5 min
}

function detectFlashCrash(slug) {
  const history = oddsHistory[slug];
  if (!history || history.length < 2) return null;

  const now = Date.now();
  const recent = history[history.length - 1];
  const lookbackCutoff = now - CONFIG.flashCrash.lookbackMs;

  // Find the price at lookback point
  let baseline = null;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].ts <= lookbackCutoff) { baseline = history[i]; break; }
  }
  if (!baseline) baseline = history[0];

  const upDrop = baseline.upOdds - recent.upOdds;
  const downDrop = baseline.downOdds - recent.downOdds;

  if (upDrop >= CONFIG.flashCrash.dropThreshold) {
    return { side: 'UP', drop: Number(upDrop.toFixed(3)), from: baseline.upOdds, to: recent.upOdds, type: 'flash_crash' };
  }
  if (downDrop >= CONFIG.flashCrash.dropThreshold) {
    return { side: 'DOWN', drop: Number(downDrop.toFixed(3)), from: baseline.downOdds, to: recent.downOdds, type: 'flash_crash' };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// NEW: KELLY CRITERION BET SIZING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate optimal bet size using fractional Kelly criterion.
 * @param ourProb - Our estimated probability of winning (0-1)
 * @param odds - PM odds price we'd buy at (0-1, e.g. 0.55)
 * @returns { kellyPct, recommendedPct, edge }
 */
function calcKelly(ourProb, odds) {
  // For binary options: payout is (1/odds - 1) if we win
  // Kelly: f = (p*b - q) / b where b = net payout per unit bet
  const b = (1 / odds) - 1; // e.g. odds=0.55 → b=0.818
  const p = ourProb;
  const q = 1 - p;
  const fullKelly = (p * b - q) / b;
  const fractionalKelly = fullKelly * CONFIG.kelly.fraction;
  const recommended = clamp(fractionalKelly * 100, 0, CONFIG.kelly.maxBetPct);

  return {
    fullKellyPct: Number((fullKelly * 100).toFixed(2)),
    recommendedPct: Number(recommended.toFixed(2)),
    edge: Number((ourProb - odds).toFixed(4)),
    worthBetting: recommended >= CONFIG.kelly.minBetPct,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// v4 SIGNAL ENGINE — Edge-Based
// ═══════════════════════════════════════════════════════════════════════

async function analyzeMarket(coin, tfMinutes, eventCandles, htfCandles, oraclePrice, bybitPrice, regime, timeToSettle) {
  const closes = eventCandles.map(c => c[4]);
  const currentPrice = closes[closes.length - 1] || 0;
  const details = [];
  const pair = `${coin}/USDT`;

  if (closes.length < 10 || timeToSettle < CONFIG.timing.hardSkipBelow) return null;

  // ─── STEP 1: Discover PM market + fetch live odds ───
  const pmMarket = await discoverPMMarket(coin, tfMinutes);
  if (!pmMarket) {
    details.push('PM market not found via Gamma API');
    // Fallback: use PM bot state if available
  }

  let pmUpOdds = 0.5, pmDownOdds = 0.5;
  let clobData = null;
  let pmSpread = 0;

  if (pmMarket) {
    clobData = await fetchCLOBData(pmMarket.upTokenId);
    if (clobData) {
      pmUpOdds = clobData.midpoint;
      pmDownOdds = 1 - pmUpOdds;
      pmSpread = clobData.spread;
      details.push(`PM odds: UP=${pmUpOdds.toFixed(3)} DOWN=${pmDownOdds.toFixed(3)} spread=${pmSpread.toFixed(3)}`);

      // Record for flash crash detection
      recordOdds(pmMarket.slug, pmUpOdds, pmDownOdds);
    }
  }

  // ─── STEP 2: Calculate our probability estimate ───
  // Start at 50/50 base, adjust with each signal
  let probUp = 0.50;

  // Oracle gap signal (+/- up to 15%)
  if (oraclePrice > 0 && bybitPrice > 0) {
    const signedGapPct = ((bybitPrice - oraclePrice) / oraclePrice) * 100;
    const gapPct = Math.abs(signedGapPct);
    if (gapPct > CONFIG.oracleGap.dangerPct) return null; // danger

    if (gapPct > CONFIG.oracleGap.strongEdgePct) {
      const shift = signedGapPct > 0 ? -0.15 : 0.15; // Bybit above oracle → DOWN likely
      probUp += shift;
      details.push(`Oracle(${oracleSource}) gap ${signedGapPct.toFixed(3)}% → probUp ${shift > 0 ? '+' : ''}${(shift*100).toFixed(0)}%`);
    } else if (gapPct > CONFIG.oracleGap.mildEdgePct) {
      const shift = signedGapPct > 0 ? -0.08 : 0.08;
      probUp += shift;
      details.push(`Oracle gap ${signedGapPct.toFixed(3)}% → probUp ${shift > 0 ? '+' : ''}${(shift*100).toFixed(0)}%`);
    }
  }

  // Velocity signal (+/- up to 12%)
  const velocity = calcVelocity(coin, currentPrice, timeToSettle);
  if (velocity.direction === 'UP' && velocity.strength >= 1.5) {
    const shift = Math.min(velocity.strength * 0.04, 0.12);
    probUp += shift;
    details.push(`Velocity UP str=${velocity.strength} → +${(shift*100).toFixed(0)}%`);
  } else if (velocity.direction === 'DOWN' && velocity.strength >= 1.5) {
    const shift = Math.min(velocity.strength * 0.04, 0.12);
    probUp -= shift;
    details.push(`Velocity DOWN str=${velocity.strength} → -${(shift*100).toFixed(0)}%`);
  }

  // Fast EMA trend (+/- up to 6%)
  const emaFast = calcEMA(closes, CONFIG.ema.fast);
  const emaSlow = calcEMA(closes, CONFIG.ema.slow);
  const emaDist = emaFast[closes.length-1] && emaSlow[closes.length-1]
    ? ((emaFast[closes.length-1] - emaSlow[closes.length-1]) / emaSlow[closes.length-1]) * 100 : 0;
  if (emaDist > 0.05) probUp += 0.06;
  else if (emaDist > 0.01) probUp += 0.03;
  else if (emaDist < -0.05) probUp -= 0.06;
  else if (emaDist < -0.01) probUp -= 0.03;

  // RSI-6 (+/- up to 4%)
  const rsi = calcRSI(closes, CONFIG.rsiPeriod);
  if (rsi > 65) probUp += 0.04;
  else if (rsi > 55) probUp += 0.02;
  else if (rsi < 35) probUp -= 0.04;
  else if (rsi < 45) probUp -= 0.02;

  // Regime (+/- up to 5%)
  if (regime) {
    if (regime.regime === 'BULLISH') probUp += 0.05;
    else if (regime.regime === 'MILD_BULLISH') probUp += 0.025;
    else if (regime.regime === 'BEARISH') probUp -= 0.05;
    else if (regime.regime === 'MILD_BEARISH') probUp -= 0.025;
  }

  // Timing adjustment
  let timingMult = 1.0;
  if (timeToSettle >= CONFIG.timing.sweetSpotMin && timeToSettle <= CONFIG.timing.sweetSpotMax) {
    timingMult = 1.05; // 5% more confident in sweet spot
    details.push(`Timing sweet spot (${timeToSettle}s)`);
  } else if (timeToSettle > CONFIG.timing.sweetSpotMax) {
    timingMult = 0.90; // 10% less confident when too early
    details.push(`Timing early (${timeToSettle}s) -10%`);
  }

  // PM orderbook imbalance (+/- up to 3%)
  if (clobData && Math.abs(clobData.imbalance) > 0.2) {
    const shift = clobData.imbalance > 0 ? 0.03 : -0.03; // More bids = bullish crowd
    probUp += shift;
    details.push(`Orderbook imbalance ${clobData.imbalance.toFixed(3)} → ${shift > 0 ? '+' : ''}${(shift*100).toFixed(0)}%`);
  }

  // HTF confirmation (+/- 2%)
  if (htfCandles && htfCandles.length >= 10) {
    const htfCloses = htfCandles.map(c => c[4]);
    const htfF = calcEMA(htfCloses, 3), htfS = calcEMA(htfCloses, 8);
    if (htfF[htfCloses.length-1] > htfS[htfCloses.length-1]) probUp += 0.02;
    else probUp -= 0.02;
  }

  // Apply timing multiplier and clamp
  probUp = clamp(probUp * timingMult, 0.05, 0.95);
  const probDown = 1 - probUp;

  // ─── STEP 3: Flash crash detection ───
  let flashCrash = null;
  if (pmMarket) {
    flashCrash = detectFlashCrash(pmMarket.slug);
    if (flashCrash) {
      details.push(`FLASH CRASH: ${flashCrash.side} dropped ${flashCrash.drop} (${flashCrash.from.toFixed(2)}→${flashCrash.to.toFixed(2)})`);
      // Boost the crashed side's probability
      if (flashCrash.side === 'UP') probUp = clamp(probUp + 0.10, 0.05, 0.95);
      else probUp = clamp(probUp - 0.10, 0.05, 0.95);
    }
  }

  // ─── STEP 4: Edge calculation — THE CORE ───
  const upEdge = probUp - pmUpOdds;
  const downEdge = probDown - pmDownOdds;

  let bestSide, bestEdge, bestOdds, bestProb;
  if (upEdge > downEdge && upEdge > 0) {
    bestSide = 'UP'; bestEdge = upEdge; bestOdds = pmUpOdds; bestProb = probUp;
  } else if (downEdge > 0) {
    bestSide = 'DOWN'; bestEdge = downEdge; bestOdds = pmDownOdds; bestProb = probDown;
  } else {
    // No edge on either side
    return {
      side: null, confidence: 0, details: [...details, `No edge: UP=${upEdge.toFixed(3)} DOWN=${downEdge.toFixed(3)}`],
      skipTrade: true, skipReason: `No positive edge vs PM odds (UP=${upEdge.toFixed(3)} DOWN=${downEdge.toFixed(3)})`,
      pmOdds: { up: pmUpOdds, down: pmDownOdds }, oraclePrice, bybitPrice, timeToSettle,
      probUp, probDown, upEdge, downEdge,
    };
  }

  details.push(`EDGE: ${bestSide} = ${(bestEdge*100).toFixed(1)}% (prob=${bestProb.toFixed(3)} vs odds=${bestOdds.toFixed(3)})`);

  // ─── STEP 5: Kelly criterion sizing ───
  const kelly = calcKelly(bestProb, bestOdds);
  details.push(`Kelly: ${kelly.recommendedPct.toFixed(1)}% of bankroll (full=${kelly.fullKellyPct.toFixed(1)}%)`);

  // ─── STEP 6: Final confidence (edge-based, not arbitrary score) ───
  // Confidence = how much edge we have, normalized to 0-100
  // Edge of 5% = 55 confidence, edge of 15% = 75, edge of 25% = 90
  let confidence = Math.round(50 + (bestEdge * 200));
  if (flashCrash && flashCrash.side === bestSide) confidence += CONFIG.flashCrash.recoveryBonus;
  confidence = clamp(confidence, 0, 99);

  const skipTrade = bestEdge < CONFIG.edge.minEdge
    || bestOdds > CONFIG.edge.maxOdds
    || bestOdds < CONFIG.edge.minOdds
    || !kelly.worthBetting;

  const skipReason = bestEdge < CONFIG.edge.minEdge ? `Edge ${(bestEdge*100).toFixed(1)}% < min ${CONFIG.edge.minEdge*100}%`
    : bestOdds > CONFIG.edge.maxOdds ? `Odds ${bestOdds.toFixed(2)} > max ${CONFIG.edge.maxOdds}`
    : bestOdds < CONFIG.edge.minOdds ? `Odds ${bestOdds.toFixed(2)} < min ${CONFIG.edge.minOdds}`
    : !kelly.worthBetting ? `Kelly too small (${kelly.recommendedPct.toFixed(1)}%)`
    : undefined;

  const atr = calcATR(eventCandles, 14);
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

  return {
    side: bestSide,
    confidence,
    details,
    skipTrade,
    skipReason,
    // PM market data
    pmSlug: pmMarket?.slug,
    pmOdds: { up: Number(pmUpOdds.toFixed(4)), down: Number(pmDownOdds.toFixed(4)) },
    pmSpread: Number(pmSpread.toFixed(4)),
    pmOrderbook: clobData ? { bidDepth: clobData.bidDepth, askDepth: clobData.askDepth, imbalance: clobData.imbalance } : null,
    // Edge data
    probUp: Number(probUp.toFixed(4)),
    probDown: Number(probDown.toFixed(4)),
    upEdge: Number(upEdge.toFixed(4)),
    downEdge: Number(downEdge.toFixed(4)),
    bestEdge: Number(bestEdge.toFixed(4)),
    // Kelly sizing
    kelly,
    // Flash crash
    flashCrash,
    // Oracle + price
    oraclePrice, bybitPrice,
    gapPct: oraclePrice > 0 ? Number((Math.abs(bybitPrice - oraclePrice) / oraclePrice * 100).toFixed(3)) : 0,
    timeToSettle,
    // TA context
    trend: probUp > 0.55 ? 'BULLISH' : probUp < 0.45 ? 'BEARISH' : 'NEUTRAL',
    momentum: clamp(Math.round((rsi - 50) * 2), -100, 100),
    volatility: Number(atrPct.toFixed(4)),
    velocity,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN SCANNER
// ═══════════════════════════════════════════════════════════════════════

let ccxt = null, exchange = null;

async function initExchange() {
  const mod = await import('ccxt');
  ccxt = mod.default || mod;
  exchange = new ccxt.bybit({ enableRateLimit: true });
}

async function fetchCandles(pair, timeframe, limit) {
  try { return await exchange.fetchOHLCV(pair, timeframe, undefined, limit); }
  catch (err) { console.error(`[PM-V4] Candles ${pair} ${timeframe}: ${err.message}`); return []; }
}

async function runScan() {
  const scanStart = Date.now();
  const regime = readRegime();
  const oraclePrices = await fetchOraclePrices();
  const allSignals = [];

  // Fetch candles for all coins
  const candleCache = {};
  for (const coin of CONFIG.coins) {
    const pair = `${coin}/USDT`;
    const [c5m, c15m] = await Promise.all([fetchCandles(pair, '5m', 50), fetchCandles(pair, '15m', 50)]);
    candleCache[coin] = { '5m': c5m, '15m': c15m };
    // Record for velocity
    const latest = c5m.length > 0 ? c5m[c5m.length - 1][4] : 0;
    if (latest > 0) recordPrice(coin, latest);
  }

  // Analyze each coin × timeframe
  for (const coin of CONFIG.coins) {
    for (const tfMin of CONFIG.timeframes) {
      const pair = `${coin}/USDT`;
      const cache = candleCache[coin];
      if (!cache) continue;

      const tf = tfMin <= 5 ? '5m' : '15m';
      const eventCandles = cache[tf] || [];
      const htfCandles = cache['15m'] || [];
      if (eventCandles.length < 10) continue;

      const bybitPrice = eventCandles[eventCandles.length - 1][4];
      const oraclePrice = oraclePrices[pair] || 0;
      const now = Date.now();
      const nextSettle = Math.ceil(now / (tfMin * 60_000)) * (tfMin * 60_000);
      const timeToSettle = Math.round((nextSettle - now) / 1000);

      const result = await analyzeMarket(coin, tfMin, eventCandles, htfCandles, oraclePrice, bybitPrice, regime, timeToSettle);
      if (!result) continue;

      allSignals.push({
        event: `${coin} ${tfMin}m ${result.side || '?'}`,
        symbol: pair,
        marketKey: `PM-${coin}-${tfMin}M-UPDOWN`,
        timeframeMinutes: tfMin,
        side: result.side,
        confidence: result.confidence,
        reason: result.details.slice(0, 8).join(' | '),
        skipTrade: result.skipTrade,
        skipReason: result.skipReason,
        // PM-native data
        pmSlug: result.pmSlug,
        pmOdds: result.pmOdds,
        pmSpread: result.pmSpread,
        pmOrderbook: result.pmOrderbook,
        // Edge — the key metric
        edge: result.bestEdge,
        probUp: result.probUp,
        probDown: result.probDown,
        kelly: result.kelly,
        flashCrash: result.flashCrash,
        // Price data
        oraclePrice: result.oraclePrice,
        bybitPrice: result.bybitPrice,
        priceGap: { usd: Number(Math.abs(result.oraclePrice - result.bybitPrice).toFixed(2)), percent: result.gapPct },
        timeToSettle: result.timeToSettle,
        trend: result.trend,
        momentum: result.momentum,
        volatility: result.volatility,
        velocity: result.velocity,
      });
    }
  }

  const output = {
    timestamp: new Date().toISOString(),
    version: 'v4-pm-native-edge',
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

  const tradeable = allSignals.filter(s => !s.skipTrade);
  const summary = tradeable.length > 0
    ? tradeable.map(s => `${s.event}:edge=${(s.edge*100).toFixed(1)}%,kelly=${s.kelly?.recommendedPct?.toFixed(0)}%${s.flashCrash ? '⚡' : ''}`).join(' | ')
    : 'no edge signals';
  console.log(`[PM-V4] ${new Date().toISOString().slice(11, 19)} oracle=${oracleSource} regime=${output.regime} signals=${allSignals.length} tradeable=${tradeable.length} (${summary}) [${output.scanDurationMs}ms]`);

  return output;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PM Scanner v4 — Polymarket-Native Edge Scanner             ║');
  console.log('║  Bet only when: ourProbability > pmOdds + fees              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Oracle: Pyth → CoinGecko fallback                          ║`);
  console.log(`║  PM Data: Gamma API + CLOB orderbook                        ║`);
  console.log(`║  Coins: ${CONFIG.coins.join(', ')} | TFs: ${CONFIG.timeframes.join(', ')}m           ║`);
  console.log(`║  Min edge: ${(CONFIG.edge.minEdge*100)}% | Kelly fraction: ${CONFIG.kelly.fraction*100}%                 ║`);
  console.log(`║  Flash crash: >${CONFIG.flashCrash.dropThreshold} drop in ${CONFIG.flashCrash.lookbackMs/1000}s             ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await initExchange();
  console.log('[PM-V4] Bybit exchange initialized');

  // Test Pyth
  const pyth = await fetchPythPrices();
  console.log(`[PM-V4] Pyth oracle: ${pyth ? Object.entries(pyth).map(([k,v]) => `${k}=$${v.toFixed(0)}`).join(', ') : 'UNAVAILABLE (using CoinGecko)'}`);

  // Test PM market discovery
  for (const coin of CONFIG.coins) {
    const mkt = await discoverPMMarket(coin, 5);
    console.log(`[PM-V4] PM market ${coin} 5m: ${mkt ? `slug=${mkt.slug} UP=${mkt.upPrice} DOWN=${mkt.downPrice}` : 'NOT FOUND'}`);
  }

  await runScan();
  setInterval(async () => {
    try { await runScan(); }
    catch (err) { console.error('[PM-V4] Scan error:', err.message); }
  }, SCAN_INTERVAL_MS);
}

main().catch(err => { console.error('[PM-V4] Fatal:', err); process.exit(1); });
