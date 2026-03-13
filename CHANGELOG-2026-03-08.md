# Dashboard Optimalisaties - 2026-03-08
## Door Claude (via Bram SSH sessie)
### 1. Live Price Feed (DONE)
- scripts/price-feed.cjs: Bybit WebSocket, elke seconde naar public/live-prices.json
- app/api/live-prices/route.ts: returnt flat price map
- use-trading-engine.ts: priceTick (1-2s) + scannerTick (5-15s) gesplitst
### 2. Trading Engine Fixes (DONE)
- Duplicate prevention: pendingSymbols Set + prev.some() check
- Live prijs bij entry ipv stale scanner prijs
- Grace period: 10s scalping, 30s swing
### 3. Scalping Config (DONE)
- 10x leverage, $20 size, SL 2.0% ($4), TP 2.5% ($5)
- Trailing 1.0% na 1.5% profit, timeout 30min, max 5 posities
### 4. Scanner Optimalisaties (DONE)
- Scalping: StochRSI <20/>80, ATR >0.15%, volume >1.5x
- Swing: EMA proximity 1.5%, RSI 35-65, SL 2.5%, TP1 4%, TP2 8%
### 5. Apple Reminders Sync (DONE)
- Mac bridge op poort 8765, sync elke 5min, Sync knop in UI
### 6. Automatisering (DONE)
- start-dashboard.bat + Mac shortcut, passwordless SSH
## REGELS VOOR BOEBOESH
- use-trading-engine.ts: NOOIT edit tool, altijd read->write
- Config waarden NIET aanpassen zonder overleg met Bram
- Scanner thresholds zijn getuned, niet resetten
- Gebruik ALTIJD architect skill bij wijzigingen
