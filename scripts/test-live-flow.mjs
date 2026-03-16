#!/usr/bin/env node
/**
 * Test live order flow (dry-run - checks guards and token resolution)
 */

const BASE_URL = process.env.PM_TEST_BASE_URL || 'http://localhost:3000';

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log('=== PM Bot Live Flow Test ===\n');
  
  // Step 1: Check preflight
  console.log('Step 1: Preflight check...');
  const preflight = await fetchJson('/api/pm-bot/preflight');
  console.log(`  Overall state: ${preflight.overallState}`);
  console.log(`  Readiness: ${preflight.readinessScorePct}%`);
  console.log(`  Mode: ${preflight.mode}`);
  console.log(`  Live orders enabled: ${preflight.liveOrdersEnabled}`);
  
  if (preflight.overallState !== 'PASS' && preflight.overallState !== 'STUB') {
    console.log('\n⚠️  Preflight not ready for live orders');
    console.log('   Failed checks:');
    preflight.checks
      .filter(c => c.state === 'FAIL' || c.state === 'BLOCKED' || c.state === 'NEEDS_CONFIG')
      .forEach(c => console.log(`   - ${c.label}: ${c.detail}`));
  }
  
  // Step 2: Check current state
  console.log('\nStep 2: Runtime state...');
  const state = await fetchJson('/api/pm-bot/state');
  console.log(`  Execution status: ${state.executionStatus}`);
  console.log(`  Status reason: ${state.statusReason}`);
  console.log(`  Enabled: ${state.enabled}`);
  console.log(`  Feed stale: ${state.stale}`);
  console.log(`  Feed age: ${state.feedAgeMs}ms`);
  
  // Step 3: Check events and token resolution (implicit)
  console.log('\nStep 3: Configured events...');
  state.events.forEach((ev, i) => {
    console.log(`  [${i + 1}] ${ev.label}`);
    console.log(`      Market key: ${ev.marketKey}`);
    console.log(`      Symbol: ${ev.symbol}`);
    console.log(`      Enabled: ${ev.enabled}`);
    console.log(`      Suggested: ${ev.suggestedSide} (${ev.confidence}%)`);
    console.log(`      Reason: ${ev.reason}`);
    if (ev.tokenId) {
      console.log(`      Token (live bet): ${ev.tokenId.slice(0, 20)}...`);
    }
    if (ev.activeBetId) {
      console.log(`      Active bet: ${ev.activeBetId} (${ev.countdownSec}s left)`);
    }
  });
  
  // Step 4: Check open bets
  console.log('\nStep 4: Open bets...');
  const openBets = await fetchJson('/api/pm-bot/bets?status=open');
  if (openBets.length === 0) {
    console.log('  No open bets');
  } else {
    openBets.forEach((bet, i) => {
      console.log(`  [${i + 1}] ${bet.id}`);
      console.log(`      Market: ${bet.marketKey}`);
      console.log(`      Side: ${bet.side}`);
      console.log(`      Execution: ${bet.execution || 'paper'}`);
      console.log(`      Size: $${bet.sizeUsd}`);
      console.log(`      Confidence: ${bet.confidence}%`);
      if (bet.execution === 'live') {
        console.log(`      Live order ID: ${bet.liveOrderId}`);
        console.log(`      Live token: ${bet.liveTokenId?.slice(0, 20)}...`);
        console.log(`      Status: ${bet.liveOrderStatus}`);
      }
      if (bet.fallbackReason) {
        console.log(`      Fallback reason: ${bet.fallbackReason}`);
      }
    });
  }
  
  // Step 5: Summary
  console.log('\n' + '='.repeat(60));
  if (state.executionStatus === 'LIVE') {
    console.log('✅ LIVE mode is active');
    console.log('   Next cycle will attempt live token resolution + order placement');
    console.log('   if signal confidence exceeds threshold.');
  } else if (state.executionStatus === 'BLOCKED') {
    console.log('⚠️  LIVE mode requested but BLOCKED');
    console.log(`   Reason: ${state.statusReason}`);
    console.log('   Orders will fall back to PAPER mode');
  } else {
    console.log('ℹ️  PAPER mode active');
    console.log('   Set mode=live in config to test live flow');
  }
  
  console.log('\n✓ Test complete');
}

main().catch(err => {
  console.error('\n❌ Test failed:', err.message || err);
  process.exit(1);
});
