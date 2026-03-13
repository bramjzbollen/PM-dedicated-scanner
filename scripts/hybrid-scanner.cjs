const WebSocket = require('ws');
const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const OUTPUT_SCALP = path.join(__dirname, '..', 'public', 'scalping-scanner-data.json');
const OUTPUT_SWING = path.join(__dirname, '..', 'public', 'swing-scanner-data.json');
const REST_INTERVAL = 5 * 60 * 1000; // 5 min for non-top pairs
const WRITE_INTERVAL = 10 * 1000; // write results every 10s
const TOP_COUNT = 50;
const MAX_CANDLES = 150; // Reduced from 200 — 100 needed for indicators + 50 buffer
const MAX_PAIRS = 250;
const LOG_INTERVAL = 60000; // Log signals every 60s instead of every 10s

// Scanner params
const SCALP = {
  stochRsiPeriod: 14, stochRsiStochPeriod: 14, stochRsiKSmoothing: 3, stochRsiDSmoothing: 3,
  oversoldZone: 20, overboughtZone: 80, longMaxK: 45, shortMinK: 55,
  bbPeriod: 20, bbStdDev: 2, volumePeriod: 20, volumeThreshold: 1.2,
  atrPeriod: 14, atrMinimum: 0.08,
};

// In-memory candle storage using typed arrays for memory efficiency
// Instead of { closes: [], highs: [], lows: [], volumes: [] } with boxed Numbers,
// we use a ring-buffer approach with plain arrays but enforce MAX_CANDLES strictly
const candles = Object.create(null);
const allPairs = [];
let topPairs = [];
let restPairs = [];
let exchange = null;
let lastSignalLog = 0;

// ── Indicator calculations (same logic, minor optimizations) ──
function calcRSI(closes, period) {
  const len = closes.length;
  if (len < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = len - period; i < len; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gains += ch; else losses -= ch;
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

function calcStochRSI(closes, rsiP, stochP, kSmooth, dSmooth) {
  const req = rsiP + stochP + kSmooth + dSmooth;
  if (closes.length < req) return { k: 50, d: 50, prevK: 50 };
  const rsiVals = [];
  const lb = stochP + kSmooth + dSmooth;
  for (let i = closes.length - lb; i < closes.length; i++) {
    const sl = closes.slice(Math.max(0, i - rsiP - 1), i + 1);
    if (sl.length >= rsiP + 1) rsiVals.push(calcRSI(sl, rsiP));
  }
  if (rsiVals.length < stochP) return { k: 50, d: 50, prevK: 50 };
  const stochVals = [];
  for (let i = stochP - 1; i < rsiVals.length; i++) {
    const sl = rsiVals.slice(i - stochP + 1, i + 1);
    const mx = Math.max(...sl), mn = Math.min(...sl);
    stochVals.push(mx === mn ? 50 : ((rsiVals[i] - mn) / (mx - mn)) * 100);
  }
  if (stochVals.length < kSmooth) return { k: 50, d: 50, prevK: 50 };
  const kVals = [];
  for (let i = kSmooth - 1; i < stochVals.length; i++) {
    const sl = stochVals.slice(i - kSmooth + 1, i + 1);
    kVals.push(sl.reduce((a, b) => a + b, 0) / kSmooth);
  }
  if (kVals.length < dSmooth + 1) return { k: kVals[kVals.length - 1] || 50, d: 50, prevK: kVals[kVals.length - 2] || 50 };
  const dSl = kVals.slice(-dSmooth);
  return { k: kVals[kVals.length - 1], d: dSl.reduce((a, b) => a + b, 0) / dSmooth, prevK: kVals[kVals.length - 2] };
}

function calcATR(highs, lows, closes, period) {
  if (highs.length < period + 1) return 0;
  let sum = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    sum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1]));
  }
  return sum / period;
}

function calcBB(closes, period, std) {
  const len = closes.length;
  if (len < period) return { upper: 0, middle: 0, lower: 0 };
  let sum = 0;
  for (let i = len - period; i < len; i++) sum += closes[i];
  const sma = sum / period;
  let varSum = 0;
  for (let i = len - period; i < len; i++) varSum += (closes[i] - sma) ** 2;
  const sd = Math.sqrt(varSum / period);
  return { upper: sma + sd * std, middle: sma, lower: sma - sd * std };
}

// ── Enforce candle cap — trim from front ──
function trimCandles(data) {
  if (data.closes.length > MAX_CANDLES) {
    const excess = data.closes.length - MAX_CANDLES;
    data.closes.splice(0, excess);
    data.highs.splice(0, excess);
    data.lows.splice(0, excess);
    data.volumes.splice(0, excess);
  }
}

// ── Generate signal for a pair ──
function generateSignal(symbol) {
  const data = candles[symbol];
  if (!data || data.closes.length < 50) return null;
  const { closes, highs, lows, volumes } = data;
  const price = closes[closes.length - 1];
  const stoch = calcStochRSI(closes, SCALP.stochRsiPeriod, SCALP.stochRsiStochPeriod, SCALP.stochRsiKSmoothing, SCALP.stochRsiDSmoothing);
  const atr = calcATR(highs, lows, closes, SCALP.atrPeriod);
  const atrPct = (atr / price) * 100;
  const bb = calcBB(closes, SCALP.bbPeriod, SCALP.bbStdDev);
  const bbPos = bb.upper === bb.lower ? 0.5 : (price - bb.lower) / (bb.upper - bb.lower);

  // Calculate volume ratio without slicing (avoid allocation)
  const volLen = volumes.length;
  const volStart = Math.max(0, volLen - SCALP.volumePeriod);
  let volSum = 0;
  for (let i = volStart; i < volLen; i++) volSum += volumes[i];
  const avgVol = volSum / SCALP.volumePeriod;
  const volRatio = avgVol > 0 ? volumes[volLen - 1] / avgVol : 1;
  
  const { k, d, prevK } = stoch;
  const validATR = atrPct > SCALP.atrMinimum;
  const hasVolume = volRatio > SCALP.volumeThreshold;
  
  const longWindow = (prevK < SCALP.oversoldZone) && (k >= SCALP.oversoldZone && k <= SCALP.longMaxK);
  const shortWindow = (prevK > SCALP.overboughtZone) && (k <= SCALP.overboughtZone && k >= SCALP.shortMinK);
  
  let signal = 'NEUTRAL', confidence = 0, reason = '';
  const criteria = { stochRsiCrossover: false, atr: validATR, volume: hasVolume, bbPosition: false };
  
  if (longWindow) {
    signal = 'LONG'; confidence = 60; criteria.stochRsiCrossover = true;
    if (validATR) confidence += 10;
    if (hasVolume) confidence += 10;
    if (bbPos < 0.25) { confidence += 10; criteria.bbPosition = true; }
    confidence = Math.min(95, confidence);
    reason = 'StochRSI ' + prevK.toFixed(0) + '->' + k.toFixed(0) + (validATR ? ' ATR ' + atrPct.toFixed(2) + '%' : '') + (hasVolume ? ' Vol ' + volRatio.toFixed(1) + 'x' : '');
  } else if (shortWindow) {
    signal = 'SHORT'; confidence = 60; criteria.stochRsiCrossover = true;
    if (validATR) confidence += 10;
    if (hasVolume) confidence += 10;
    if (bbPos > 0.75) { confidence += 10; criteria.bbPosition = true; }
    confidence = Math.min(95, confidence);
    reason = 'StochRSI ' + prevK.toFixed(0) + '->' + k.toFixed(0) + (validATR ? ' ATR ' + atrPct.toFixed(2) + '%' : '') + (hasVolume ? ' Vol ' + volRatio.toFixed(1) + 'x' : '');
  } else {
    if (!validATR) reason = 'Low volatility (ATR ' + atrPct.toFixed(2) + '%)';
    else reason = 'No crossover (K: ' + k.toFixed(1) + ' prevK: ' + prevK.toFixed(1) + ')';
  }
  
  return {
    pair: symbol, signal, symbol, direction: signal, confidence: Math.round(confidence), reason,
    criteriaMet: Object.values(criteria).filter(Boolean).length, criteriaTotal: 4, criteriaDetails: criteria,
    indicators: {
      stochRsiK: +k.toFixed(2), stochRsiD: +d.toFixed(2), stochRsiPrevK: +prevK.toFixed(2),
      bbPosition: +(bbPos * 100).toFixed(1), bbUpper: +bb.upper.toFixed(2), bbMiddle: +bb.middle.toFixed(2), bbLower: +bb.lower.toFixed(2),
      volumeRatio: +volRatio.toFixed(2), atr: +atr.toFixed(2), atrPercent: +atrPct.toFixed(3), price: +price.toFixed(6)
    }
  };
}

// ── Fetch initial candles via REST ──
async function fetchCandles(pairs, timeframe, limit) {
  const BATCH = 10;
  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    await Promise.all(batch.map(async (pair) => {
      try {
        const ohlcv = await exchange.fetchOHLCV(pair, timeframe, undefined, limit);
        if (!ohlcv || ohlcv.length < 30) return;
        
        // Reuse existing object if it exists, otherwise create new
        if (!candles[pair]) {
          candles[pair] = { closes: [], highs: [], lows: [], volumes: [] };
        }
        const c = candles[pair];
        // Clear and refill instead of creating new arrays
        c.closes.length = 0;
        c.highs.length = 0;
        c.lows.length = 0;
        c.volumes.length = 0;
        
        // Only keep last MAX_CANDLES
        const start = Math.max(0, ohlcv.length - MAX_CANDLES);
        for (let j = start; j < ohlcv.length; j++) {
          c.closes.push(ohlcv[j][4]);
          c.highs.push(ohlcv[j][2]);
          c.lows.push(ohlcv[j][3]);
          c.volumes.push(ohlcv[j][5]);
        }
      } catch (e) { /* skip */ }
    }));
    if (i + BATCH < pairs.length) await new Promise(r => setTimeout(r, 500));
  }
}

// ── WebSocket for top pairs ──
let wsInstance = null;

function connectWebSocket() {
  // Clean up previous connection
  if (wsInstance) {
    try { wsInstance.terminate(); } catch {}
    wsInstance = null;
  }

  wsInstance = new WebSocket('wss://stream.bybit.com/v5/public/spot', {
    maxPayload: 1024 * 1024,
  });

  wsInstance.on('open', () => {
    console.log('[WS] Connected, subscribing to ' + topPairs.length + ' klines...');
    const args = topPairs.map(p => 'kline.1.' + p.replace('/', ''));
    for (let i = 0; i < args.length; i += 10) {
      const batch = args.slice(i, i + 10);
      setTimeout(() => {
        if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
          wsInstance.send(JSON.stringify({ op: 'subscribe', args: batch }));
        }
      }, (i / 10) * 100);
    }
  });

  wsInstance.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg.topic || !msg.topic.startsWith('kline.1.') || !msg.data) return;
      const sym = msg.topic.slice(8).replace('USDT', '/USDT'); // Faster than chained replace
      const d = Array.isArray(msg.data) ? msg.data[0] : msg.data;
      if (!d || !candles[sym]) return;
      const c = candles[sym];
      const close = parseFloat(d.close);
      const high = parseFloat(d.high);
      const low = parseFloat(d.low);
      const vol = parseFloat(d.volume);

      if (d.confirm) {
        // Candle closed, push new one
        c.closes.push(close); c.highs.push(high); c.lows.push(low); c.volumes.push(vol);
        // Enforce cap
        trimCandles(c);
      } else {
        // Update current candle in-place
        const last = c.closes.length - 1;
        if (last >= 0) {
          c.closes[last] = close;
          c.highs[last] = Math.max(c.highs[last], high);
          c.lows[last] = Math.min(c.lows[last], low);
          c.volumes[last] = vol;
        }
      }
    } catch (e) { /* skip */ }
  });

  wsInstance.on('close', () => {
    console.log('[WS] Disconnected, reconnecting in 5s...');
    wsInstance = null;
    setTimeout(connectWebSocket, 5000);
  });

  wsInstance.on('error', (e) => console.error('[WS] Error:', e.message));
}

// ── Write scanner results ──
// Reuse output object structure to reduce GC pressure
const outputTemplate = {
  success: true, timestamp: '', scannedPairs: 0,
  params: SCALP, prices: null, signals: null,
};

function writeResults() {
  const now = Date.now();
  const signals = [];
  const prices = Object.create(null);

  // Generate signals — only push non-null
  for (let i = 0; i < allPairs.length; i++) {
    const sig = generateSignal(allPairs[i]);
    if (sig) {
      signals.push(sig);
      if (sig.indicators.price > 0) prices[sig.symbol] = sig.indicators.price;
    }
  }

  const active = signals.filter(s => s.signal !== 'NEUTRAL');
  
  // Sort by confidence desc and cap at 250
  signals.sort((a, b) => b.confidence - a.confidence);
  if (signals.length > MAX_PAIRS) signals.length = MAX_PAIRS;

  outputTemplate.timestamp = new Date().toISOString();
  outputTemplate.scannedPairs = allPairs.length;
  outputTemplate.prices = prices;
  outputTemplate.signals = signals;

  try {
    const tmp = OUTPUT_SCALP + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(outputTemplate));
    fs.renameSync(tmp, OUTPUT_SCALP);
  } catch (e) { console.error('Write error:', e.message); }
  
  // Throttle logging
  if (now - lastSignalLog > LOG_INTERVAL) {
    const time = new Date().toLocaleTimeString();
    console.log('[' + time + '] Signals: ' + active.length + ' (' + active.filter(s=>s.signal==='LONG').length + 'L/' + active.filter(s=>s.signal==='SHORT').length + 'S) from ' + allPairs.length + ' pairs | Candle memory: ~' + estimateMemoryMB() + 'MB');
    lastSignalLog = now;
  }
}

// Estimate candle memory usage
function estimateMemoryMB() {
  let totalEntries = 0;
  for (const sym in candles) {
    totalEntries += candles[sym].closes.length * 4; // 4 arrays per pair
  }
  // ~8 bytes per number in V8
  return ((totalEntries * 8) / 1024 / 1024).toFixed(1);
}

// ── Main ──
async function main() {
  console.log('Hybrid Scanner starting...');
  exchange = new ccxt.bybit({ enableRateLimit: true, rateLimit: 200 });
  await exchange.loadTimeDifference();
  
  console.log('Fetching markets...');
  const markets = await exchange.loadMarkets();
  const tickers = await exchange.fetchTickers();
  
  const usdtPairs = Object.values(markets)
    .filter(m => m.quote === 'USDT' && m.type === 'spot' && m.active)
    .map(m => {
      const t = tickers[m.symbol + ':USDT'] || tickers[m.symbol];
      return { symbol: m.symbol, volume: t?.quoteVolume || 0 };
    })
    .filter(p => p.volume >= 100000)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, MAX_PAIRS);
  
  allPairs.push(...usdtPairs.map(p => p.symbol));
  topPairs.push(...allPairs.slice(0, TOP_COUNT));
  restPairs.push(...allPairs.slice(TOP_COUNT));
  
  console.log('Top ' + topPairs.length + ' pairs: WebSocket (realtime)');
  console.log('Rest ' + restPairs.length + ' pairs: REST (every 5 min)');
  
  // Initial candle fetch — use MAX_CANDLES instead of 100
  console.log('Fetching initial candles for all ' + allPairs.length + ' pairs...');
  await fetchCandles(allPairs, '1m', MAX_CANDLES);
  console.log('Initial candles loaded: ' + Object.keys(candles).length + ' pairs (~' + estimateMemoryMB() + 'MB)');
  
  // Connect WebSocket for top pairs
  connectWebSocket();
  
  // REST refresh for remaining pairs — with error handling
  setInterval(async () => {
    try {
      await fetchCandles(restPairs, '1m', MAX_CANDLES);
    } catch (e) {
      console.error('[REST] Refresh error:', e.message);
    }
  }, REST_INTERVAL);
  
  // Write results periodically
  writeResults();
  setInterval(writeResults, WRITE_INTERVAL);
  
  // Memory cleanup: remove pairs that are no longer in the active set every 30 min
  setInterval(() => {
    const activeSet = new Set(allPairs);
    let cleaned = 0;
    for (const sym in candles) {
      if (!activeSet.has(sym)) {
        delete candles[sym];
        cleaned++;
      }
    }
    if (cleaned > 0) console.log('[cleanup] Removed ' + cleaned + ' stale pair candles');
    if (global.gc) global.gc();
  }, 30 * 60 * 1000);
  
  console.log('Hybrid Scanner running! Results every 10s.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
