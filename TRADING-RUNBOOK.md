# Trading Platform Runbook (Night Build)

## Scope Delivered
- Live Bybit scanner updates (scalping 1m + swing 15m)
- Stable build/runtime for Next.js app
- Trading UI with scanner feeds, auto-trader controls, queue, history, P&L and position sizing
- Scheduler-driven refresh pipeline
- Basic operational checks + known risks

## Quick Start
1. Install deps
   ```bash
   npm install
   ```
2. (Optional) set Bybit keys in `.env.local`
   ```env
   BYBIT_API_KEY=...
   BYBIT_API_SECRET=...
   ```
   > Public market data works without private trading calls, but keys are recommended for rate-limit resilience.

3. Prime scanner datasets (recommended before opening UI)
   ```bash
   npm run update-scanners
   ```

4. Run dashboard
   ```bash
   npm run dev
   ```

5. Open
   - Trading page: `http://localhost:3000/trading`
   - Scheduler status: `http://localhost:3000/api/scanner-scheduler`
   - Raw scanner feeds:
     - `http://localhost:3000/api/scalping-scanner`
     - `http://localhost:3000/api/swing-scanner`

## Operational Behavior
- Scanner scheduler auto-starts from UI/layout path and updates every 2 minutes.
- Trading engine ticks:
  - Scalping: every 5s
  - Swing: every 15s
- Scanner payload now includes:
  - `signals` (up to 250 sorted by confidence)
  - `prices` map for broad live price refresh
  - `scannedPairs` and timestamp metadata

## Concrete Verification Checks (performed)
- `npm run build` → ✅ success (no TypeScript/runtime build errors)
- `npm run update-scanners` → ✅ success, scanned 250 pairs, wrote fresh JSON files
- Output includes `prices` map in both scanner JSON files for live position mark-to-market continuity.

## Key Implementation Notes
- API scanner routes are now dynamic (`force-dynamic`) and `Cache-Control: no-store` to reduce stale reads.
- Scanner writer uses temp-file + rename to reduce partial-read/corrupt JSON risk during refresh.
- Trading engine fetches scanner API with `{ cache: 'no-store' }` and merges `data.prices` first, then signal prices.

## Performance Check (new hard requirement)

### What was optimized
- **Reduced unnecessary re-renders in trading engine**
  - Skip `setPositions` when position snapshot is unchanged.
  - Skip `setLatestSignals` when signal snapshot is unchanged.
  - Skip `setQueue` cleanup update when queue IDs are unchanged.
  - Skip `setPrices` when merged price map is unchanged.
- **Lower background polling load**
  - Engine polling is now **adaptive by tab visibility**:
    - Visible tab: normal interval (scalp 5s / swing 15s)
    - Background tab: slower interval (`max(interval*6, 30s)`)
- **Lower console/debug overhead**
  - Removed noisy dev-path per-tick debug logging in hot path.

### Expected impact
- Smoother UI when trading tab is open (fewer large list re-renders).
- Lower CPU/RAM usage when browser tab is backgrounded.
- Lower GC churn from repeated object/state updates.

### Trade-offs
- In background tabs, updates are intentionally less frequent (freshness vs efficiency).
- Snapshot comparison adds tiny CPU work, but far less than full subtree re-rendering.

## Known Issues / Remaining Risks
1. **Single-process in-memory scheduler**
   - Current scheduler state is in-process memory. In multi-instance/serverless setups, each instance can run its own loop.
   - Mitigation: move scheduling to one external worker/cron (recommended next step).

2. **Heavy scanner runtime on 250 pairs**
   - Full scan can take minutes depending on network/rate limits.
   - Mitigation: reduce pairs or tune batch size/timeouts for low-latency environments.

3. **Public data dependency and exchange throttling**
   - Bybit or network hiccups can produce temporarily stale scanner files until next successful cycle.
   - Mitigation: monitor scheduler endpoint + scanner timestamps.

4. **Paper-trading only**
   - UI/engine is paper simulation logic; no live order placement/risk controls on exchange yet.

## Morning Hand-off Checklist (06:00)
- [ ] `npm run build` still green
- [ ] `npm run update-scanners` completes in environment
- [ ] `/api/scalping-scanner` and `/api/swing-scanner` timestamps are fresh
- [ ] Trading tab loads and shows price updates + queue + history
- [ ] Scheduler endpoint shows `running: true`
