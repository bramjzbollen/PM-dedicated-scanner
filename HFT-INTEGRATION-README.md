# Micro-Profit HFT Integration

## Bestanden

Kopieer deze 3 bestanden naar `lib/` in je mission-control-dashboard:

```
lib/
  execution-adapter.ts        ← Paper ↔ Live switching layer
  micro-profit-config.ts      ← HFT config, kill switches, presets
  server-trade-state-hft.ts   ← Integratie patch (wraps existing state)
```

## Stap 1: Bestanden plaatsen

```powershell
# Vanuit je project root
copy execution-adapter.ts lib\execution-adapter.ts
copy micro-profit-config.ts lib\micro-profit-config.ts
copy server-trade-state-hft.ts lib\server-trade-state-hft.ts
```

## Stap 2: Route.ts aanpassen

In `app/api/trade/route.ts`, voeg het HFT action handling toe:

```typescript
// Bovenaan, voeg import toe:
import { handleHFTAction, processSignalsHFT } from '@/lib/server-trade-state-hft';

// In de POST handler, vóór de default case:
case 'processSignals':
  if (params.signals && params.prices) {
    state = updatePricesAndCheckExits(state, params.prices);
    // USE HFT VERSION for micro-profit mode
    state = await processSignalsHFT(state, params.signals, params.prices, params.cooldownMs || 0);
  }
  break;

// En voeg toe vóór default:
default: {
  // Try HFT actions first
  const hftResult = handleHFTAction(state, action, params);
  if (hftResult) {
    state = hftResult;
    break;
  }
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
```

## Stap 3: Micro-Profit Mode activeren

Via de API (of voeg een knop toe in je dashboard):

```bash
# Switch naar micro-profit config
curl -X POST http://localhost:3000/api/trade \
  -H "Content-Type: application/json" \
  -d '{"mode":"v2-scalping","action":"setMicroProfitMode"}'

# Of kies een preset
curl -X POST http://localhost:3000/api/trade \
  -H "Content-Type: application/json" \
  -d '{"mode":"v2-scalping","action":"setPreset","preset":"balanced"}'
```

### Presets:

| Preset | TP | SL | Leverage | Trades/uur target |
|--------|----|----|----------|-------------------|
| `conservative` | 0.20% | 0.15% | 10× | 100-150 |
| `balanced` | 0.15% | 0.12% | 15× | 150-200 |
| `aggressive` | 0.10% | 0.10% | 20× | 200-300 |

## Stap 4: Paper → Live switch

```bash
# Stap 1: Dry run (logt orders zonder uitvoering)
curl -X POST http://localhost:3000/api/trade \
  -d '{"mode":"v2-scalping","action":"switchExecutionMode","mode":"live"}'

# Live executor start altijd in dry-run mode.
# Bekijk de console logs om te verifiëren dat orders correct zijn.

# Stap 2: Zodra dry-run OK is, disable dry-run in code:
# In execution-adapter.ts, verander:
#   dryRunFirst: true  →  dryRunFirst: false
```

## Stap 5: Kill Switch monitoren

Kill switches worden automatisch gecontroleerd na elke gesloten trade.
Status is zichtbaar in de state response:

```json
{
  "killSwitch": {
    "isPaused": false,
    "hourlyPnl": -12.50,
    "dailyPnl": 234.00,
    "consecutiveLosses": 2,
    "fillRate": 87.5
  }
}
```

### Triggers:
- Uurlijks verlies > 2% → pauze 30 min
- Daily verlies > 5% → stop 24h  
- Weekly verlies > 7% → manuele review
- 10× loss op rij → pauze 1h
- Account < 90% → ALLES STOPPEN
- Fill rate < 60% → WARNING (widen TP)

### Kill switch resetten:
```bash
curl -X POST http://localhost:3000/api/trade \
  -d '{"mode":"v2-scalping","action":"resetKillSwitch"}'
```

## Wat er NIET verandert

- Je bestaande scanner (`hybrid-scanner-v2.cjs`) blijft werken
- Je dashboard componenten blijven werken
- WebSocket connectie naar Bybit blijft intact
- Alle bestaande API endpoints blijven functioneel
- Je kunt naadloos switchen tussen standaard en micro-profit mode

## Volgende stappen

1. Plaats bestanden en test met paper mode
2. Monitor kill switch triggers en fill rates
3. Tune presets op basis van paper trade resultaten
4. Als winrate >70% over 500+ trades → overweeg live dry-run
5. Als dry-run OK → live met minimal capital
