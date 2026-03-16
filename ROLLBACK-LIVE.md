# Rollback Guide: PM Bot Live Execution

## Emergency Disable (Immediate, No Code Changes)

### Option 1: API Endpoint (Fastest)
```bash
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{"mode": "paper"}'
```

**Effect:** Immediate switch to paper mode. All future cycles will NOT attempt live orders.

**Verification:**
```bash
curl http://localhost:3000/api/pm-bot/state | jq '.executionStatus'
# Expected: "PAPER"
```

### Option 2: Disable Bot Entirely
```bash
curl -X POST http://localhost:3000/api/pm-bot/config \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'
```

**Effect:** Bot stops creating bets (paper or live).

### Option 3: Manual Config Edit
Edit `pm-bot-config.json` in:
- `C:/Users/bramb/.openclaw/trade-state/pm-bot-config.json`
- or fallback: `public/pm-bot-config.json`

Change:
```json
{
  "enabled": false,
  "mode": "paper"
}
```

**Restart server:**
```bash
npm run dev
```

## Cancel Pending Orders

**Important:** Disabling live mode does NOT cancel existing open orders on Polymarket.

### Manual Cancellation (Recommended)
1. Go to: https://polymarket.com/activity
2. Click "Open orders" tab
3. Click "Cancel" on each PM bot order
4. Verify cancellation

### Programmatic Cancellation (Advanced)
If you need to cancel via API:

```typescript
// Example: cancel all open orders for a specific market
const client = await createPMClobClient();
const openOrders = await client.getOpenOrders();
for (const order of openOrders) {
  await client.cancelOrder(order.id);
}
```

## Code Rollback

### If Token Resolver Has Bugs

**Symptoms:**
- Repeated "No active market found" errors
- Wrong tokens selected
- Gamma API timeouts

**Quick Fix (Disable Dynamic Resolution):**

1. Edit `lib/pm-bot.ts`, find line ~590 (in `runPMCycle()`):
```typescript
// Comment out dynamic resolution
// let tokenResolved;
// try {
//   tokenResolved = await getTokenIdForSide(ev.marketKey, decision.side);
// } catch (err: any) {
//   baseBet.fallbackReason = `Token resolution failed: ${err?.message || err}`;
//   await appendLiveOrderLog(`[FALLBACK:PAPER] market=${ev.marketKey} reason=${baseBet.fallbackReason}`);
//   mutable.unshift(baseBet);
//   continue;
// }

// Force fallback
baseBet.fallbackReason = 'Dynamic resolution temporarily disabled';
mutable.unshift(baseBet);
continue;
```

2. Restart server

**Effect:** All live order attempts will fall back to paper with logged reason.

### Git Revert (Full Rollback)

If changes need to be reverted entirely:

```bash
# Find commit hash
git log --oneline -5

# Revert the live execution commit
git revert <commit-hash>

# Rebuild
npm run build

# Restart (if using PM2)
pm2 restart all

# Or dev mode
npm run dev
```

**Files reverted:**
- `lib/pm-token-resolver.ts` → deleted
- `lib/pm-bot.ts` → restored to pre-dynamic-resolution state

**Effect:** Live order flow disabled. Only paper mode available.

## Data Cleanup (Optional)

If you want to clear live order history:

### Clear Live Order Log
```bash
# Windows
del C:\Users\bramb\.openclaw\trade-state\pm-bot-live-orders.log

# Or fallback
del C:\Users\bramb\.openclaw\workspace\tmp\pm-export-stage\public\pm-bot-live-orders.log
```

### Clear Live Bets from History
**Warning:** This clears ALL bets (paper + live).

```bash
# Backup first
cp C:\Users\bramb\.openclaw\trade-state\pm-bot-paper-bets.json pm-bot-paper-bets.backup.json

# Clear
echo "[]" > C:\Users\bramb\.openclaw\trade-state\pm-bot-paper-bets.json
```

**Restore from backup:**
```bash
cp pm-bot-paper-bets.backup.json C:\Users\bramb\.openclaw\trade-state\pm-bot-paper-bets.json
```

## Verification After Rollback

### 1. Check Mode
```bash
curl http://localhost:3000/api/pm-bot/state | jq '{mode, executionStatus, statusReason}'
```

**Expected after rollback:**
```json
{
  "mode": "paper",
  "executionStatus": "PAPER",
  "statusReason": "Paper mode actief"
}
```

### 2. Verify No Live Orders
```bash
curl http://localhost:3000/api/pm-bot/bets?status=open | jq 'map(select(.execution=="live"))'
```

**Expected:** `[]` (empty array)

### 3. Check Polymarket UI
- Go to: https://polymarket.com/activity
- Verify no PM bot orders in "Open orders"
- Check recent fills match expected closures

## Re-enable Live Mode (After Fix)

Once issues are resolved:

1. Verify fix in code
2. Deploy updated version
3. Run test procedure: `TEST-PROCEDURE-LIVE.md`
4. Start with micro-size ($10) again
5. Gradually scale up if stable

## Emergency Contacts

**If funds are at risk:**
1. **Immediately disable:** `{"enabled": false, "mode": "paper"}`
2. **Cancel all orders:** https://polymarket.com/activity
3. **Withdraw funds:** Transfer USDC from Polymarket → external wallet
4. **Report issue:** Document symptoms + logs for post-mortem

## Safety Net Reminders

Even in worst case, the following limits are enforced:
- Max concurrent orders: 2
- Max order size: $25
- Daily loss limit: $75 (default)
- Geoblock auto-fails to paper
- Stale feed auto-fails to paper
- Token resolution fail auto-fails to paper

**Maximum exposure:** 2 orders × $25 = $50 at any moment.

---
**Keep this document accessible during live testing.**
