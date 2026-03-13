# Auto Trading System - Architecture

## Overview
Fully automated paper trading system with two modes: **Scalping (1m)** and **Swing (15m)**. Both run independently with their own wallet ($1000 starting), positions, queue, and stats.

## Architecture

```
lib/
  trading-engine.ts        — Core types, constants, pure functions (Position, QueueItem, P&L calc, exit logic)
  use-trading-engine.ts    — React hook managing full engine state, intervals, localStorage persistence

components/trading/
  auto-trader.tsx           — Main auto-trader UI (controls, settings, positions, queue, stats)
  scalping-auto-trader.tsx  — Scalping wrapper (mode="scalping")
  swing-auto-trader.tsx     — Swing wrapper (mode="swing")
  trading-stats.tsx         — Stats dashboard (11 KPI cards)
  position-card.tsx         — Single position row (direction, P&L, SL/TP, close button)
  queue-panel.tsx           — Queue visualization (FIFO, expiry timers)

app/trading/page.tsx        — Trading page with 3 tabs: Scalping Auto, Swing Auto, Trade History
```

## Engine Loop

**Scalping:** every 5 seconds | **Swing:** every 15 seconds

1. **Fetch** scanner data from `/api/scalping-scanner` or `/api/swing-scanner`
2. **Update prices** for all open positions from scanner `indicators.price`
3. **Check exit conditions** — SL, TP, trailing stop, timeout (scalping: 15min)
4. **Process queue** — fill empty slots with queued candidates (FIFO)
5. **Auto-entry** — new signals with confidence >= threshold → open or queue
6. **Clean queue** — remove expired items (>5 min)
7. **Update stats** — wallet, P&L, win rate, etc.

## Scalping Config
- Position size: $20
- SL: 0.4%, TP: 0.8%
- Trailing: 0.3% (activates after +0.6%)
- Max positions: 50
- Timeout: 15 min
- Queue: max 20

## Swing Config
- Position size: $100
- SL: 1.5%, TP1: 3%, TP2: 6%
- Partial close at TP1: 50%, move SL to breakeven
- Partial close at TP2: 25%, activate trailing (1.5%)
- Max positions: 10
- No timeout
- Queue: max 5

## Storage
All state persisted to LocalStorage:
- `{mode}-positions` — open positions
- `{mode}-closed` — closed positions history
- `{mode}-queue` — queued candidates
- `{mode}-stats` — wallet balance, P&L, win/loss counts
- `{mode}-config` — user settings
- `{mode}-running` — engine on/off state

## Controls
- **Start/Stop Engine** — toggle auto-trading
- **Close All** — emergency close all positions (with confirmation)
- **Reset** — reset wallet to $1000, clear everything (with confirmation)
- **Settings panel** — auto-entry toggle, queue toggle, min confidence slider, max positions slider
