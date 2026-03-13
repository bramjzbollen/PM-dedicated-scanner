import ccxt from 'ccxt';

(async () => {
  const ex = new ccxt.bybit();
  await ex.loadMarkets();
  const tickers = await ex.fetchTickers();
  
  const markets = Object.values(ex.markets).filter(m => 
    m.quote === 'USDT' && 
    m.type === 'spot' && 
    m.active
  );
  
  console.log(`Total spot USDT markets: ${markets.length}`);
  
  // Test first 5 markets
  const testMarkets = markets.slice(0, 5);
  
  testMarkets.forEach(m => {
    const ticker1 = tickers[m.symbol];
    const ticker2 = tickers[`${m.symbol}:USDT`];
    
    console.log(`\n${m.symbol}:`);
    console.log(`  Ticker [${m.symbol}]: ${ticker1 ? 'EXISTS' : 'MISSING'}`);
    console.log(`  Ticker [${m.symbol}:USDT]: ${ticker2 ? 'EXISTS' : 'MISSING'}`);
    
    const ticker = ticker1 || ticker2;
    if (ticker) {
      console.log(`  quoteVolume: ${ticker.quoteVolume}`);
      console.log(`  turnover24h: ${ticker.info?.turnover24h}`);
    }
  });
})();
