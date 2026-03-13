#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const WS_URL = 'wss://stream.bybit.com/v5/public/spot';
const OUT_PATH = join(process.cwd(), 'public', 'live-prices.json');
const FLUSH_MS = 1000;
const RECONNECT_MS = 3000;

const TOP_50_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LTCUSDT',
  'BCHUSDT', 'LINKUSDT', 'ATOMUSDT', 'UNIUSDT', 'XLMUSDT', 'ETCUSDT', 'FILUSDT', 'HBARUSDT', 'AAVEUSDT', 'APTUSDT',
  'OPUSDT', 'ARBUSDT', 'NEARUSDT', 'SUIUSDT', 'SEIUSDT', 'INJUSDT', 'RUNEUSDT', 'PEPEUSDT', 'TRXUSDT', 'TONUSDT',
  'SHIBUSDT', 'WIFUSDT', 'BONKUSDT', 'TIAUSDT', 'JUPUSDT', 'PYTHUSDT', 'DYDXUSDT', 'ICPUSDT', 'GALAUSDT', 'ALGOUSDT',
  'SANDUSDT', 'MANAUSDT', 'CRVUSDT', 'MKRUSDT', 'COMPUSDT', 'SNXUSDT', 'FETUSDT', 'RNDRUSDT', 'IMXUSDT', 'STXUSDT',
];

let ws = null;
let reconnectTimer = null;
const latestPrices = Object.create(null);

async function ensureOutputDir() {
  await mkdir(join(process.cwd(), 'public'), { recursive: true });
}

async function flushToDisk() {
  const payload = {
    prices: latestPrices,
    ts: new Date().toISOString(),
  };

  try {
    await writeFile(OUT_PATH, JSON.stringify(payload));
  } catch (error) {
    console.error('[price-feed] Failed writing live-prices.json:', error);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log('[price-feed] Connecting to Bybit spot websocket...');
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    console.log('[price-feed] Connected. Subscribing to tickers...');
    ws.send(JSON.stringify({ op: 'subscribe', args: TOP_50_PAIRS.map((symbol) => `tickers.${symbol}`) }));
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data));

      if (msg?.topic?.startsWith('tickers.') && msg?.data) {
        const data = Array.isArray(msg.data) ? msg.data : [msg.data];

        for (const item of data) {
          const symbol = item?.symbol;
          const price = Number(item?.lastPrice);
          if (symbol && Number.isFinite(price) && price > 0) {
            latestPrices[symbol] = price;
          }
        }
      }
    } catch (error) {
      console.error('[price-feed] Failed to parse websocket message:', error);
    }
  });

  ws.addEventListener('close', () => {
    console.warn('[price-feed] Connection closed. Reconnecting...');
    scheduleReconnect();
  });

  ws.addEventListener('error', (error) => {
    console.error('[price-feed] WebSocket error:', error);
    try {
      ws?.close();
    } catch {
      // ignore
    }
  });
}

async function main() {
  await ensureOutputDir();
  await flushToDisk();

  setInterval(() => {
    flushToDisk();
  }, FLUSH_MS);

  connect();
}

main().catch((error) => {
  console.error('[price-feed] Fatal error:', error);
  process.exit(1);
});
