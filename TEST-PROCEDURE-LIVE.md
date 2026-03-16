# Test Procedure: PM Bot Live Execution

## Prerequisites
- Dev server running (`npm run dev`)
- Scenario A config in `.env.local`:
  - `PM_SIGNATURE_TYPE=2`
  - `PM_FUNDER_ADDRESS` (proxy wallet)
  - `PM_PRIVATE_KEY` (signer wallet)
- Polymarket account funded with min $50 USDC (for 2x $25 max orders)
- VPN/proxy if in geoblocked region (or test from allowed location)

## Phase 1: Preflight Validation (5 min)

### 1.1 Check Preflight Status
```bash
curl http://localhost:3000/api/pm-bot/preflight | jq
```

**Expected:**
- `overallState`: `PASS` or `STUB` (STUB is OK for initial test)
- `readinessScorePct`: ≥ 70%
- `liveOrdersEnabled`: `false` (paper mode default)

**If BLOCKED/FAIL:**
- Check failed checks in response
- Most common: `geoblockStatus=BLOCKED` → use VPN
- Or: `apiKeyDeriveReadiness=NEEDS_CONFIG` → verify env vars

### 1.2 Verify Scanner Feed
```bash
curl http://localhost:3000/api/pm-bot/state | jq '.feedAgeMs, .stale'
```

**Expected:**
- `feedAgeMs`: < 12000 (12 seconds)
- `stale`: `false`

**If stale:**
```bash
# Check scanner process
ps aux | grep hybrid-scanner-v2

# Restart if needed
pkill -f hybrid-scanner-v2
npm run dev
```

### 1.3 Test Token Resolution (Offline)
```bash
node scripts/test-live-flow.mjs
```

**Expected output:**
```
Step 1: Preflight check...
  Overall state: PASS
  
Step 2: Runtime state...
  Execution status: PAPER
  Feed stale: false
  
Step 3: Configured events...
  [1] BTC 5m Up/Down
      Enabled: true
      Suggested: UP (65%)
      
✓ Test complete
```

## Phase 2: Paper Mode Baseline (10 min)

### 2.1 Enable Bot (Paper Mode)
```bash
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{"enabled": true, "mode": "paper"}'
```

### 2.2 Observe Paper Cycle
Wait 30-60 seconds, then check:
```bash
curl http://localhost:3000/api/pm-bot/bets?status=open | jq
```

**Expected:**
- At least 1 paper bet if confidence > threshold
- `execution`: `"paper"`
- No `liveOrderId` field

### 2.3 Verify Paper Bet Lifecycle
Wait for market to expire (5-15 minutes depending on timeframe), then:
```bash
curl http://localhost:3000/api/pm-bot/bets?status=closed | jq '.[0]'
```

**Expected:**
- `status`: `"closed"`
- `exit`: `"WIN"` or `"LOSS"`
- `pnlUsd`: positive or negative number

**If no bets created:**
- Check confidence threshold: default 62%
- Check scanner signals: `curl http://localhost:3000/v2-scalp-signals.json`
- Verify events enabled in config

## Phase 3: Live Mode Activation (Critical)

### 3.1 Pre-Flight Safety Check
```bash
# Verify account balance on Polymarket
# Verify geoblock status
curl http://localhost:3000/api/pm-bot/preflight | jq '.checks[] | select(.key=="geoblockStatus")'

# Expected: "state": "PASS"
```

### 3.2 Enable Live Mode (Micro Size)
```bash
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{
    "enabled": true,
    "mode": "live",
    "paperBetSizeUsd": 10,
    "maxOpenBets": 1,
    "confidenceThreshold": 70
  }'
```

**Note:** Start with:
- Size: $10 (minimum)
- Max open: 1
- Threshold: 70% (higher than default to reduce trigger frequency)

### 3.3 Monitor Live Order Log (Real-time)
```bash
# In separate terminal
tail -f C:/Users/bramb/.openclaw/trade-state/pm-bot-live-orders.log
```

or (if fallback dir):
```bash
tail -f C:/Users/bramb/.openclaw/workspace/tmp/pm-export-stage/public/pm-bot-live-orders.log
```

### 3.4 Trigger Live Cycle
```bash
# Force state refresh (triggers runPMCycle)
curl http://localhost:3000/api/pm-bot/state | jq '.executionStatus'
```

**Expected:** `"LIVE"` (if guards pass) or `"BLOCKED"` (with reason)

**If BLOCKED:**
- Check `.statusReason` in response
- Most common:
  - Stale feed → wait 10s, retry
  - Geoblock → enable VPN
  - Preflight fail → check env vars

### 3.5 Verify First Live Order Attempt
Within 1-2 minutes, check log:

**Success pattern:**
```
[2026-03-13T10:45:32.123Z] [POSTED] market=PM-BTC-5M-UPDOWN pmSlug=btc-updown-5m-1773480600 token=6956707950... side=UP sizeUsd=10 orderId=0xabc123...
```

**Fallback pattern:**
```
[2026-03-13T10:45:32.123Z] [FALLBACK:PAPER] market=PM-BTC-5M-UPDOWN reason=No active Polymarket market found for this event
```

**Failure pattern:**
```
[2026-03-13T10:45:32.123Z] [FAIL] market=PM-BTC-5M-UPDOWN token=6956707950... error=Insufficient balance
```

### 3.6 Verify on Polymarket UI
1. Go to: https://polymarket.com/activity
2. Check "Open orders" tab
3. Verify order matches:
   - Market: BTC/ETH/SOL up or down
   - Side: UP or DOWN
   - Size: $10

**If order visible but not filled:**
- Normal! Market price may have moved (slippage)
- Order sits in book until filled or market expires
- Cancel manually if needed: https://polymarket.com/activity

## Phase 4: Validation (30 min)

### 4.1 Check Bet Record
```bash
curl http://localhost:3000/api/pm-bot/bets?status=open | jq '.[0]'
```

**Expected:**
```json
{
  "id": "pm-live-...",
  "execution": "live",
  "liveOrderId": "0xabc123...",
  "liveTokenId": "695670795...",
  "liveOrderStatus": "posted",
  "marketKey": "PM-BTC-5M-UPDOWN",
  "side": "UP",
  "sizeUsd": 10,
  "reason": "... | liveOrder=0xabc... | pmMarket=btc-updown-5m-..."
}
```

### 4.2 Monitor Settlement
Wait for market expiry (check `countdownSec` in state endpoint).

After settlement:
```bash
curl http://localhost:3000/api/pm-bot/bets?status=closed | jq '.[0] | {exit, pnlUsd, execution}'
```

**Expected:**
- `execution`: `"live"`
- `exit`: `"WIN"` or `"LOSS"`
- `pnlUsd`: actual P&L from Polymarket fill

### 4.3 Verify Stats
```bash
curl http://localhost:3000/api/pm-bot/stats | jq
```

**Expected:**
- `closedBets`: increased by 1
- `wins` or `losses`: incremented
- `totalPnlUsd`: updated

## Phase 5: Scale-Up (Optional, only if Phase 4 succeeds)

### 5.1 Increase Size Gradually
```bash
# Increment to $15
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{"paperBetSizeUsd": 15}'
  
# Wait for 1 cycle, verify
# Then increment to $20, $25 (max)
```

### 5.2 Enable Multiple Events
```bash
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{"maxOpenBets": 2}'
  
# Enables concurrent BTC + ETH markets
```

### 5.3 Monitor Concurrent Limit
Hard cap: 2 concurrent live orders (enforced in code).

Check:
```bash
curl http://localhost:3000/api/pm-bot/bets?status=open | jq 'map(select(.execution=="live")) | length'
```

**Expected:** ≤ 2

## Emergency Stop

### Immediate (No Code Changes)
```bash
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{"mode": "paper"}'
```

### Cancel Open Orders (Manual)
1. Go to: https://polymarket.com/activity
2. Click "Cancel" on each open order
3. Verify cancellation in UI

### Disable Bot Entirely
```bash
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'
```

## Troubleshooting

### Token Resolution Fails
**Symptom:** Log shows `[FALLBACK:PAPER] ... reason=No active Polymarket market found`

**Causes:**
1. No active 5m/15m markets at that moment → wait 5 minutes, Polymarket creates new ones
2. Gamma API timeout → check network, retry
3. Market slug pattern changed → update `pm-token-resolver.ts` regex

**Test manually:**
```bash
curl 'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=50' | jq '.[] | select(.slug | contains("btc-updown"))'
```

### Auth Errors
**Symptom:** `[ALERT_AUTH_SIGNATURE] ... error=401 Unauthorized`

**Fix:**
1. Verify `PM_PRIVATE_KEY` is correct signer for funder address
2. Check `PM_SIGNATURE_TYPE=2` (Polymarket standard)
3. Verify funder address matches Polymarket proxy wallet

### Geoblock
**Symptom:** `executionStatus=BLOCKED reason=geoblock=BLOCKED`

**Fix:**
- Enable VPN to allowed region (Singapore, UK, etc.)
- Restart server after VPN connection
- Re-check: `curl https://polymarket.com/api/geoblock`

### Stale Feed
**Symptom:** `executionStatus=BLOCKED reason=Scanner feed stale (age 15000ms)`

**Fix:**
```bash
# Restart scanner
pkill -f hybrid-scanner-v2
npm run dev
```

## Success Criteria
- [x] Preflight shows PASS or STUB
- [x] Paper mode creates bets correctly
- [x] Live mode activates (executionStatus=LIVE)
- [x] Token resolution succeeds for BTC/ETH/SOL 5m markets
- [x] Live order posted to Polymarket CLOB API
- [x] Order visible on https://polymarket.com/activity
- [x] Bet record shows `execution: "live"` with order ID
- [x] Settlement updates P&L correctly
- [x] Fallback to paper logs clear reason on any guard failure

---
**Test Duration:** 45-60 minutes end-to-end  
**Required Funds:** $50 USDC minimum (for 2 concurrent $25 max orders)  
**Risk:** Micro-size ($10-25/order), guarded by daily loss limit
