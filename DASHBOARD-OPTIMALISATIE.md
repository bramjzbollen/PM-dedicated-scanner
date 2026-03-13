# Mission Control Dashboard — Optimalisatie-instructies

## Context

Bram wil drie concrete verbeteringen:
1. Hogere refreshrate van openstaande trades (P&L updates sneller dan 5s)
2. Correct binnenhalen van livedata om papertrades aan te sturen
3. Dashboard lichter maken zodat het stabieler draait

---

## Architectuur: huidige situatie

[Bybit API] -> update-scanner-data.js -> public/*.json (disk)
-> Next.js API route (readFileSync)
-> useTradingEngine (fetch elke 5s/15s)
-> ScalpingAutoTrader / SwingAutoTrader (49KB/53KB components)

### Kernproblemen:
- Prices updaten ALLEEN wanneer de scanner draait - tussen scans zien open trades stale prijzen
- readFileSync in API routes blokkeert de Node.js event loop
- useTradingEngine heeft 15+ useEffect hooks, 12+ refs, en doet ALLES in een tick
- 217KB scanner JSON wordt elke 5s volledig opgehaald en geparsed
- localStorage persistence per state change (10 saveToStorage calls = 10 writes per tick)

---

## FIX 1: Aparte price feed voor open posities (PRIORITEIT 1)

Maak een scripts/price-feed.js dat via Bybit WebSocket elke seconde live prijzen schrijft naar public/live-prices.json.

### Nieuw bestand: scripts/price-feed.js

- Open WebSocket naar wss://stream.bybit.com/v5/public/spot
- Subscribe to tickers voor top 50 pairs (of pairs met open posities)
- Schrijf elke seconde { prices: { symbol: price }, ts: timestamp } naar public/live-prices.json
- Houd het script klein en onafhankelijk van Next.js

### Nieuw bestand: app/api/live-prices/route.ts

- Lees public/live-prices.json met readFile (ASYNC, niet readFileSync)
- Return alleen de price map
- Cache-Control: no-store

### Aanpassing in useTradingEngine:

Splits de engine tick in TWEE loops:

SNELLE LOOP (priceTick): elke 1-2 seconden
- Fetch /api/live-prices (klein, <5KB)
- Update currentPrice op alle open posities
- Herbereken P&L
- Check SL/TP/trailing exits
- GEEN scanner signalen, GEEN queue processing, GEEN auto-entry

TRAGE LOOP (scannerTick): elke 5s (scalping) / 15s (swing)
- Fetch /api/scalping-scanner of /api/swing-scanner
- Process signalen voor auto-entry
- Queue management
- Cleanup expired queue items

---

## FIX 2: Dashboard lichter maken (PRIORITEIT 2)

### 2a. Batch localStorage writes

Vervang de 10 individuele useEffect+saveToStorage hooks door 1 gedebounced batch write (500ms). Gebruik een saveTimeoutRef met setTimeout die alle state in een keer wegschrijft.

### 2b. Verwijder ref-spiegeling

Huidige situatie: 12 state variabelen hebben elk een ref + useEffect om ze te syncen. Vervang door een custom useStateWithRef hook die ref.current direct update in de setter, of gebruik useReducer als single source of truth met 1 ref.

### 2c. Lazy load tab content

In trading/page.tsx: gebruik next/dynamic voor ScalpingAutoTrader en SwingAutoTrader zodat alleen de actieve tab geladen wordt.

### 2d. Agressievere background throttling

Wanneer tab niet visible: stop price polling volledig, houd scanner tick op 60s max.

---

## FIX 3: Scanner data compacter (PRIORITEIT 3)

### 3a. Splits scanner output:
- public/scalping-signals.json -> alleen LONG/SHORT signalen (5-20KB)
- Live prijzen komen via price-feed.js (FIX 1)

### 3b. Gebruik readFile (async) ipv readFileSync in alle API routes

---

## Uitvoervolgorde

1. Maak scripts/price-feed.js + app/api/live-prices/route.ts
2. Split engineTick in priceTick (1-2s) + scannerTick (5-15s)
3. Batch localStorage writes (debounce 500ms)
4. Verwijder ref-spiegeling (useStateWithRef of useReducer)
5. Lazy load tab content (next/dynamic)
6. readFile async ipv readFileSync
7. Split scanner JSON (signals vs prices)
8. Agressievere background throttling

## REGELS

- Een taak per keer. Niet alles tegelijk.
- Test na elke wijziging: npm run build && npm run dev
- Bestanden >5KB: NOOIT edit tool. Altijd read -> modify in memory -> write.
- Commit message per stap zodat je kunt terugdraaien.
