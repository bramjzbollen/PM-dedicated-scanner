#!/usr/bin/env node
/**
 * Test script: verify dynamic token resolver for PM markets
 */

const testMarkets = [
  'PM-BTC-5M-UPDOWN',
  'PM-ETH-5M-UPDOWN',
  'PM-SOL-5M-UPDOWN',
  'PM-BTC-15M-UPDOWN',
];

async function testResolver() {
  console.log('--- Token Resolver Test ---\n');
  
  // Import the resolver (using dynamic import since we're in .mjs)
  const { resolveMarketTokens, getTokenIdForSide } = await import('../lib/pm-token-resolver.ts');
  
  for (const marketKey of testMarkets) {
    console.log(`\nTesting: ${marketKey}`);
    console.log('─'.repeat(60));
    
    try {
      const resolved = await resolveMarketTokens(marketKey);
      
      if (!resolved) {
        console.log('❌ No active market found');
        continue;
      }
      
      console.log('✅ Resolved market:');
      console.log(`   Polymarket slug: ${resolved.slug}`);
      console.log(`   Question: ${resolved.question}`);
      console.log(`   End date: ${resolved.endDate}`);
      console.log(`   Token UP: ${resolved.tokenIdUp.slice(0, 16)}...`);
      console.log(`   Price UP: ${resolved.priceUp}`);
      console.log(`   Token DOWN: ${resolved.tokenIdDown.slice(0, 16)}...`);
      console.log(`   Price DOWN: ${resolved.priceDown}`);
      console.log(`   Cached at: ${new Date(resolved.cachedAt).toISOString()}`);
      
      // Test side-specific lookup
      const upToken = await getTokenIdForSide(marketKey, 'UP');
      const downToken = await getTokenIdForSide(marketKey, 'DOWN');
      
      if (upToken && downToken) {
        console.log('✅ Side lookups work:');
        console.log(`   UP token matches: ${upToken.tokenId === resolved.tokenIdUp}`);
        console.log(`   DOWN token matches: ${downToken.tokenId === resolved.tokenIdDown}`);
      }
      
    } catch (err) {
      console.log(`❌ Error: ${err.message || err}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test complete');
}

testResolver().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
