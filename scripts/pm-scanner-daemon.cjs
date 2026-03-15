#!/usr/bin/env node
/**
 * PM Scanner Daemon
 * Runs every 10 seconds:
 *   1. Fetch OHLCV from Bybit (BTC/ETH/SOL/XRP — 5m/15m/1h)
 *   2. Fetch oracle prices (CoinGecko)
 *   3. Fetch PM odds (Gamma API or static fallback)
 *   4. Read market-regime.json
 *   5. Run PM scanner logic
 *   6. Write public/pm-signals.json
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ─────────────────────────────────────────────────────────────

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];
const TIMEFRAMES = ['5m', '15m', '1h'];
const SCAN_INTERVAL_MS = 10_000;

const ROOT_DIR = path.resolve(__dirname, '..');
const REGIME_PATH = path.join(ROOT_DIR, 'public', 'market-regime.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'pm-signals.json');
const COINGECKO_IDS = {
  'BTC/USDT': 'bitcoin',
  'ETH/USDT': 'ethereum',
  'SOL/USDT': 'solana',
  'XRP/USDT': 'ripple',
};

// ── Exchange ───────────────────────────────────────────────────────────

const exchange = new ccxt.bybit({ enableRateLimit: true });

// ── HTTP helper (no deps) ──────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// ── Technical analysis (inline — mirrors lib/pm-scanner.ts logic) ─────

function ema(values, period) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function sma(values, period) {
  if (values.length < period) return values[values.length - 1] || 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes, period) {
  period = period || 14;
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function analyzeTechnicals(ohlcv, timeframe) {
  if (ohlcv.length < 2) return { upScore: 50, downScore: 50, factors: ['insufficient data'] };

  const closes = ohlcv.map((c) => c[4]);
  const volumes = ohlcv.map((c) => c[5]);
  const factors = [];
  let upScore = 50, downScore = 50;

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  if (ema9 > ema21) { upScore += 10; factors.push(`${timeframe} EMA9>EMA21 bullish`); }
  else { downScore += 10; factors.push(`${timeframe} EMA9<EMA21 bearish`); }

  const r = rsi(closes);
  if (r > 70) { downScore += 8; factors.push(`${timeframe} RSI ${r.toFixed(1)} overbought`); }
  else if (r < 30) { upScore += 8; factors.push(`${timeframe} RSI ${r.toFixed(1)} oversold`); }

  const recent = closes.length >= 4
    ? ((closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4]) * 100
    : 0;
  if (recent > 1) { upScore += 6; factors.push(`${timeframe} mom +${recent.toFixed(2)}%`); }
  else if (recent < -1) { downScore += 6; factors.push(`${timeframe} mom ${recent.toFixed(2)}%`); }

  const avgVol = sma(volumes, 20);
  const lastVol = volumes[volumes.length - 1];
  if (lastVol > avgVol * 1.8) {
    const bias = closes[closes.length - 1] > closes[closes.length - 2] ? 'up' : 'down';
    if (bias === 'up') upScore += 5; else downScore += 5;
    factors.push(`${timeframe} vol spike ${(lastVol / avgVol).toFixed(1)}x`);
  }

  const total = upScore + downScore;
  upScore = Math.round((upScore / total) * 100);
  downScore = 100 - upScore;
  return { upScore, downScore, factors };
}

// ── Data fetchers ──────────────────────────────────────────────────────

async function fetchAllOHLCV() {
  const result = {};
  for (const symbol of SYMBOLS) {
    result[symbol] = {};
    for (const tf of TIMEFRAMES) {
      try {
        result[symbol][tf] = await exchange.fetchOHLCV(symbol, tf, undefined, 100);
      } catch (err) {
        console.error(`OHLCV ${symbol} ${tf}: ${err.message}`);
        result[symbol][tf] = [];
      }
    }
  }
  return result;
}

async function fetchOraclePrices() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  try {
    const data = await httpGet(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    );
    const prices = {};
    for (const [symbol, cgId] of Object.entries(COINGECKO_IDS)) {
      prices[symbol] = data[cgId]?.usd ?? 0;
    }
    return prices;
  } catch (err) {
    console.error('Oracle prices error:', err.message);
    return {};
  }
}

async function fetchPMOdds() {
  // Try Gamma/Polymarket API, fall back to static demo events
  try {
    const data = await httpGet('https://gamma-api.polymarket.com/events?closed=false&limit=10');
    if (Array.isArray(data) && data.length > 0) {
      return data.map((ev) => ({
        eventSlug: ev.slug || ev.id || 'unknown',
        title: ev.title || '',
        odds: ev.markets?.[0]?.outcomePrices
          ? parseFloat(JSON.parse(ev.markets[0].outcomePrices)[0]) || 0.5
          : 0.5,
        threshold: 0, // resolved from market context
        expiresAt: ev.endDate ? new Date(ev.endDate).getTime() : Date.now() + 86400000,
      }));
    }
  } catch (err) {
    console.error('PM odds fetch error:', err.message);
  }

  // Static fallback
  return [
    { eventSlug: 'btc-above-100k-march', title: 'BTC above $100k March 2026', odds: 0.62, threshold: 100000, expiresAt: Date.now() + 86400000 },
    { eventSlug: 'eth-above-5k-march', title: 'ETH above $5000 March 2026', odds: 0.35, threshold: 5000, expiresAt: Date.now() + 86400000 },
  ];
}

function readRegime() {
  try {
    const raw = fs.readFileSync(REGIME_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { label: 'neutral', score: 0 };
  }
}

// ── Signal generation ──────────────────────────────────────────────────

function generateSignals(ohlcvAll, oraclePrices, pmEvents, regime) {
  const signals = [];

  for (const event of pmEvents) {
    // Match event to a symbol (simple heuristic)
    let matchedSymbol = null;
    const title = (event.title || event.eventSlug || '').toLowerCase();
    if (title.includes('btc') || title.includes('bitcoin')) matchedSymbol = 'BTC/USDT';
    else if (title.includes('eth') || title.includes('ethereum')) matchedSymbol = 'ETH/USDT';
    else if (title.includes('sol') || title.includes('solana')) matchedSymbol = 'SOL/USDT';
    else if (title.includes('xrp') || title.includes('ripple')) matchedSymbol = 'XRP/USDT';
    else continue; // skip non-crypto PM events

    const oraclePrice = oraclePrices[matchedSymbol] || 0;
    if (!oraclePrice) continue;

    // Analyze across timeframes
    const allFactors = [];
    let totalUp = 0, totalDown = 0, tfCount = 0;
    for (const tf of TIMEFRAMES) {
      const candles = ohlcvAll[matchedSymbol]?.[tf] || [];
      if (candles.length < 5) continue;
      const tech = analyzeTechnicals(candles, tf);
      totalUp += tech.upScore;
      totalDown += tech.downScore;
      allFactors.push(...tech.factors);
      tfCount++;
    }

    if (tfCount === 0) continue;
    const avgUp = totalUp / tfCount;
    const avgDown = totalDown / tfCount;

    // Confidence
    let confidence = event.threshold > oraclePrice ? avgUp : avgDown;

    // Regime adj
    if (regime.label === 'risk-on') confidence += 5;
    else if (regime.label === 'risk-off') confidence -= 5;
    else if (regime.label === 'volatile') confidence -= 3;

    // Time decay
    const hoursLeft = Math.max(0, (event.expiresAt - Date.now()) / 3600000);
    if (hoursLeft < 1) confidence -= 10;
    else if (hoursLeft < 4) confidence -= 5;

    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    // Edge
    const impliedProb = confidence / 100;
    const edge = Math.abs(impliedProb - event.odds);
    const direction = impliedProb > event.odds ? 'YES' : 'NO';

    // Filters
    if (confidence < 55) continue;
    if (edge < 0.03) continue;
    if (hoursLeft < 0.25) continue;
    if (event.odds > 0.92 || event.odds < 0.08) continue;

    signals.push({
      eventSlug: event.eventSlug,
      symbol: matchedSymbol,
      direction,
      confidence,
      edge: parseFloat(edge.toFixed(4)),
      oraclePrice,
      currentOdds: event.odds,
      factors: allFactors,
      regime: regime.label,
      timestamp: Date.now(),
    });
  }

  return signals;
}

// ── Main loop ──────────────────────────────────────────────────────────

let running = false;

async function scanOnce() {
  if (running) return;
  running = true;
  const t0 = Date.now();
  try {
    const [ohlcvAll, oraclePrices, pmEvents] = await Promise.all([
      fetchAllOHLCV(),
      fetchOraclePrices(),
      fetchPMOdds(),
    ]);
    const regime = readRegime();
    const signals = generateSignals(ohlcvAll, oraclePrices, pmEvents, regime);

    const output = {
      generatedAt: new Date().toISOString(),
      scanDurationMs: Date.now() - t0,
      regime,
      signalCount: signals.length,
      signals,
    };

    // Ensure output dir exists
    const outDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(
      `[${new Date().toISOString()}] Scan done — ${signals.length} signals (${Date.now() - t0}ms)`,
    );
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Scan error:`, err.message);
  } finally {
    running = false;
  }
}

// ── Boot ───────────────────────────────────────────────────────────────

console.log('PM Scanner Daemon starting…');
console.log(`  Symbols : ${SYMBOLS.join(', ')}`);
console.log(`  Timeframes: ${TIMEFRAMES.join(', ')}`);
console.log(`  Interval : ${SCAN_INTERVAL_MS / 1000}s`);
console.log(`  Output   : ${OUTPUT_PATH}`);

// Initial scan
scanOnce();

// Recurring scan
setInterval(scanOnce, SCAN_INTERVAL_MS);
