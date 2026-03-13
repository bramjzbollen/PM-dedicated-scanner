const WebSocket = require('ws');
const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'live-prices.json');
const RECONNECT_DELAY = 5000;
const WRITE_INTERVAL = 1000;
const POLL_INTERVAL = 15000;
const LOG_INTERVAL = 60000;
const MAX_PAIRS = 300;
const STALE_PRICE_MS = 60 * 1000;

const prices = Object.create(null);
const symbolTs = Object.create(null);

let ws = null;
let reconnectCount = 0;
let wsConnected = false;
let wsLastMessageTs = 0;
let lastLog = 0;
let exchange = null;

function time() { return new Date().toLocaleTimeString(); }

function getActivePairs() {
  try {
    const scalpRaw = fs.readFileSync(path.join(__dirname, '..', 'public', 'scalping-scanner-data.json'), 'utf-8');
    const scalpData = JSON.parse(scalpRaw);
    const allPrices = scalpData.prices || {};
    return Object.keys(allPrices).map(s => s.replace('/', '')).slice(0, MAX_PAIRS);
  } catch {
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];
  }
}

function updatePrice(formatted, value, ts = Date.now()) {
  if (!Number.isFinite(value) || value <= 0) return;
  prices[formatted] = value;
  symbolTs[formatted] = ts;
}

function cleanupStale() {
  const now = Date.now();
  for (const s of Object.keys(symbolTs)) {
    if (now - symbolTs[s] > STALE_PRICE_MS) {
      delete symbolTs[s];
      delete prices[s];
    }
  }
}

async function pollFallback() {
  try {
    if (!exchange) {
      exchange = new ccxt.bybit({ enableRateLimit: true, rateLimit: 250 });
      await exchange.loadMarkets();
    }

    const pairs = getActivePairs();
    if (pairs.length === 0) return;
    const symbols = pairs.map(s => s.replace('USDT', '/USDT'));
    const tickers = await exchange.fetchTickers(symbols);
    const now = Date.now();

    let refreshed = 0;
    for (const symbol of symbols) {
      const t = tickers[symbol] || tickers[symbol + ':USDT'];
      const px = Number(t?.last || t?.close || 0);
      if (px > 0) {
        updatePrice(symbol, px, now);
        refreshed++;
      }
    }

    if (refreshed > 0 && Date.now() - lastLog > LOG_INTERVAL) {
      console.log(`[${time()}] Fallback poll refreshed ${refreshed} prices`);
      lastLog = Date.now();
    }
  } catch (e) {
    console.error(`[${time()}] Fallback poll error:`, e.message);
  }
}

function connect() {
  if (ws) {
    try { ws.terminate(); } catch {}
    ws = null;
  }

  const pairs = getActivePairs();
  const batches = [];
  for (let i = 0; i < pairs.length; i += 10) {
    batches.push(pairs.slice(i, i + 10).map(p => 'tickers.' + p));
  }

  console.log(`[${time()}] Connecting WS (${pairs.length} pairs)...`);

  ws = new WebSocket('wss://stream.bybit.com/v5/public/spot', { maxPayload: 1024 * 1024 });

  ws.on('open', () => {
    wsConnected = true;
    console.log(`[${time()}] WS connected`);
    batches.forEach((batch, i) => {
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 'subscribe', args: batch }));
        }
      }, i * 100);
    });
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.topic && msg.topic.startsWith('tickers.') && msg.data) {
        const symbol = msg.topic.slice(8);
        const formatted = symbol.replace('USDT', '/USDT');
        const price = parseFloat(msg.data.lastPrice);
        updatePrice(formatted, price);
        wsLastMessageTs = Date.now();
      }
    } catch {}
  });

  ws.on('close', () => {
    wsConnected = false;
    reconnectCount++;
    console.log(`[${time()}] WS disconnected. Reconnecting... (${reconnectCount})`);
    setTimeout(connect, RECONNECT_DELAY);
  });

  ws.on('error', (e) => {
    console.error(`[${time()}] WS error:`, e.message);
  });
}

setInterval(async () => {
  const now = Date.now();
  cleanupStale();

  const staleSymbols = Object.keys(symbolTs).filter((s) => now - symbolTs[s] > 15_000).length;
  const wsSilentMs = wsLastMessageTs ? now - wsLastMessageTs : null;

  if (!wsConnected || wsSilentMs == null || wsSilentMs > 10_000) {
    await pollFallback();
  }

  const count = Object.keys(prices).length;
  if (count === 0) return;

  const payload = {
    prices,
    ts: now,
    count,
    source: (!wsConnected || (wsSilentMs != null && wsSilentMs > 10_000)) ? 'fallback' : 'ws',
    ws: {
      connected: wsConnected,
      reconnectCount,
      lastMessageTs: wsLastMessageTs || null,
      silenceMs: wsSilentMs,
    },
    symbolTs,
    staleSymbols,
  };

  try {
    fs.writeFileSync(OUTPUT, JSON.stringify(payload));
  } catch {}

  if (now - lastLog > LOG_INTERVAL) {
    console.log(`[${time()}] Writing ${count} prices | ws=${wsConnected ? 'up' : 'down'} | stale=${staleSymbols}`);
    lastLog = now;
  }
}, WRITE_INTERVAL);

connect();
console.log('Price feed started. Output: ' + OUTPUT);
