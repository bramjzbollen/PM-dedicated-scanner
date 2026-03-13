import ccxt from 'ccxt';

(async () => {
  const ex = new ccxt.bybit();
  await ex.loadMarkets();
  const tickers = await ex.fetchTickers();
  
  console.log('Total tickers:', Object.keys(tickers).length);
  console.log('\nFirst 10 ticker keys:');
  console.log(Object.keys(tickers).slice(0, 10));
  
  const firstTicker = tickers[Object.keys(tickers)[0]];
  console.log('\nFirst ticker structure:');
  console.log(JSON.stringify(firstTicker, null, 2).substring(0, 1500));
})();
