# Changelog: PM Bot Live Execution (2026-03-13)

## Summary
Completed live CLOB order execution flow with dynamic token resolution for Polymarket's rotating "Up or Down" markets.

## Problem Solved
Polymarket creates new 5m/15m crypto up/down markets every few minutes with fresh token IDs. Static hardcoded token mapping doesn't work. Solution: dynamic Gamma API token resolver with brief caching.

## Changes Made

### 1. New Module: `lib/pm-token-resolver.ts`
**Purpose:** Dynamic token ID resolution from Polymarket Gamma API

**Key features:**
- Queries Gamma API for active markets (BTC/ETH/SOL, 5m/15m/1h/4h)
- Maps internal market keys (e.g., `PM-BTC-5M-UPDOWN`) to live Polymarket markets
- Parses token IDs for "Up" and "Down" outcomes
- 45-second cache to avoid API spam (markets rotate every 5m)
- Prefers markets ending soonest (most current)

**Exports:**
- `resolveMarketTokens(marketKey)` → full market + token details
- `getTokenIdForSide(marketKey, side)` → token ID + price for UP/DOWN
- `clearTokenCache()` → manual cache flush

**Market slug patterns recognized:**
- `btc-updown-5m-{timestamp}`
- `eth-updown-15m-{timestamp}`
- `sol-updown-1h-{timestamp}`
- Daily markets: `bitcoin-up-or-down-march-14-4am-et`

### 2. Updated: `lib/pm-bot.ts`

**Removed:**
- `parseTokenMapFromEnv()` → legacy env-based static mapping
- `resolveTokenId()` → replaced with dynamic resolver
- `PM_MARKET_TOKEN_MAP` env var dependency

**Modified: `tryPlaceLiveOrder()`**
- Parameter change: `entryOdds` → `marketPrice`
- Now uses live market price from Gamma API instead of calculated edge
- Applies min/max bounds (0.01-0.99) for safety

**Modified: `runPMCycle()` live order flow**
- **Before:** Check static token from env/config → fail if missing
- **After:** 
  1. Call `getTokenIdForSide(marketKey, side)` → resolves live token
  2. If resolution fails → fallback to paper + log reason
  3. If succeeds → extract `tokenId`, `marketPrice`, `resolved` metadata
  4. Pass to `tryPlaceLiveOrder()` with dynamic token + price
  5. Log Polymarket slug + token (truncated) on success

**Enhanced logging:**
- Live order logs now include PM market slug for traceability
- Token IDs truncated in console (first 12 chars) for readability
- Full token ID still logged to `pm-bot-live-orders.log`

**Modified: `getPMRuntimeState()`**
- Runtime state now shows `tokenId` from active live bet (if any)
- No longer relies on static env mapping

### 3. Safety Guards (unchanged)
Live execution still requires ALL of:
- `mode: 'live'` in config
- Preflight checks pass (signature type, funder, credentials)
- Feed freshness < 12s
- Geoblock check pass
- Token resolution succeeds
- Max concurrent orders limit (2)
- Daily loss limit not exceeded

On ANY guard failure → automatic fallback to paper mode + reason logged

## Files Changed
```
lib/pm-token-resolver.ts             [NEW - 220 lines]
lib/pm-bot.ts                        [MODIFIED - dynamic token flow]
scripts/test-live-flow.mjs           [NEW - integration test]
CHANGELOG-2026-03-13-LIVE-EXECUTION.md [NEW - this file]
```

## Configuration
No new env vars required. Old `PM_MARKET_TOKEN_MAP` is now optional (ignored).

Existing vars still needed for live execution:
- `PM_PRIVATE_KEY` or API key set
- `PM_FUNDER_ADDRESS`
- `PM_SIGNATURE_TYPE=2`
- `PM_LIVE_MIN_BET_USD=10`
- `PM_LIVE_MAX_BET_USD=25`

## Testing

### Unit Test: Token Resolver
```bash
# Verify dynamic token resolution for all configured markets
node scripts/test-live-flow.mjs
```

Expected output:
- ✅ Preflight status
- ✅ Runtime state (LIVE/BLOCKED/PAPER)
- ✅ Configured events with suggested sides
- ✅ Open bets (paper or live)

### Integration Test: Live Micro-Order
1. Start dev server: `npm run dev`
2. Verify preflight: `http://localhost:3000/api/pm-bot/preflight`
3. Set `mode: live` in config
4. Wait for next cycle (auto-runs every time state endpoint called)
5. Check `pm-bot-live-orders.log` for order attempts
6. Verify on Polymarket UI: https://polymarket.com/activity

## Rollback Procedure
If live execution fails:

1. **Immediate disable (no code changes):**
   ```
   POST /api/pm-bot/config
   { "mode": "paper" }
   ```

2. **Git rollback (if bugs found):**
   ```bash
   git revert <commit-hash>
   npm run build
   pm2 restart all
   ```

3. **Emergency paper-only lock:**
   ```typescript
   // In lib/pm-bot.ts, line ~500:
   const executionStatus = 'PAPER'; // Force paper mode
   ```

## Known Limitations
1. Token resolver queries Gamma API (~500ms latency) → first order per market slightly slower
2. 45s cache means stale tokens possible if market rotates mid-cycle (rare, auto-recovers next cycle)
3. No batch token resolution yet → each market queries separately (acceptable for 3-6 events)

## Next Steps (Future)
- [ ] Add token resolution retry logic (3 attempts with backoff)
- [ ] Batch token resolution for multiple markets
- [ ] Expose token cache metrics in /api/pm-bot/state
- [ ] Add manual token refresh endpoint
- [ ] Monitor Gamma API rate limits (currently no issues at <10 req/min)

## Verification Checklist
- [x] TypeScript compiles without errors in pm-bot.ts and pm-token-resolver.ts
- [x] Preflight endpoint returns valid state
- [x] Runtime state shows correct execution status
- [x] Paper mode works unchanged
- [x] Live mode guards enforce all safety checks
- [x] Token resolution logs market slug on success
- [x] Fallback to paper logs clear reason
- [x] Test script validates flow end-to-end

---
**Completed:** 2026-03-13 10:45 GMT+1  
**Model:** Claude Opus 4 (anthropic/claude-opus-4-6)  
**Execution time:** ~18 minutes
