#!/usr/bin/env node
/**
 * Simple top pairs fetcher - just takes first 250 USDT pairs from Bybit
 * (their order is already based on popularity/market cap)
 */

import ccxt from 'ccxt';

export async function getTop250Pairs(exchange) {
  try {
    console.log('  Loading markets...');
    const markets = await exchange.loadMarkets();
    
    const usdtPairs = Object.values(markets)
      .filter(m => m.quote === 'USDT' && m.type === 'spot' && m.active)
      .slice(0, 250) // Bybit already sorts by popularity
      .map(m => m.symbol);
    
    console.log(`✓ Selected ${usdtPairs.length} USDT pairs`);
    console.log(`  Top 10: ${usdtPairs.slice(0, 10).map(s => s.replace('/USDT', '')).join(', ')}`);
    
    return usdtPairs;
  } catch (error) {
    console.error('Error loading markets:', error.message);
    return ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
  }
}
