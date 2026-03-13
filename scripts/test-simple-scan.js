#!/usr/bin/env node
import ccxt from 'ccxt';

async function test() {
  const exchange = new ccxt.bybit({
    apiKey: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_API_SECRET,
    enableRateLimit: true
  });

  const markets = await exchange.loadMarkets();
  const pairs = Object.values(markets)
    .filter(m => m.quote === 'USDT' && m.type === 'spot' && m.active)
    .slice(0, 10)
    .map(m => m.symbol);

  console.log('Top 10 pairs:', pairs);
}

test();
