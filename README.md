# PM Dedicated Scanner

Polymarket-specific trading signal scanner with regime-aware confidence scoring.

## Overview

This scanner generates trading signals specifically optimized for Polymarket binary outcome markets (UP/DOWN predictions), as opposed to traditional spot trading signals.

## Features

- **Bidirectional Signals**: Generates both UP and DOWN signals based on market conditions
- **Market Regime Awareness**: Integrates BTC-based market regime detection (BULLISH/BEARISH/RANGING/HIGH_VOLATILITY)
- **PM-Specific Filters**:
  - Oracle-Bybit price gap validation (<0.8% threshold)
  - Time-to-settlement filtering (minimum 120s)
  - Trend data quality checks
  - Regime alignment validation
- **8-Factor Confidence Calculation**:
  - EMA trend alignment (9/21/50)
  - RSI momentum analysis
  - MACD directional confirmation
  - Volume confirmation
  - VWAP positioning
  - Higher timeframe confirmation
  - Candle structure analysis
  - Volatility assessment
- **Real-time Updates**: Scans every 10 seconds
- **Multi-Coin Support**: BTC, ETH, SOL, XRP
- **Multi-Timeframe**: 5m and 15m events

## Architecture

### Core Components

1. **PM Scanner Module** (`lib/pm-scanner.ts`)
   - Technical analysis engine
   - PM-tuned confidence calculator
   - Filter validation logic
   - Event analyzer

2. **Scanner Daemon** (`scripts/pm-scanner-daemon.cjs`)
   - Standalone Node.js process
   - Fetches data from multiple sources:
     - Bybit OHLCV (via CCXT)
     - Oracle prices (CoinGecko/Chainlink)
     - Polymarket odds (Gamma API)
     - Market regime data
   - Outputs to `public/pm-signals.json`

3. **API Endpoint** (`app/api/pm-bot/signals/route.ts`)
   - Next.js API route for dashboard consumption

## Signal Format

```json
{
  "timestamp": "2026-03-15T10:00:00.000Z",
  "regime": "BULLISH",
  "signals": [
    {
      "event": "BTC 5m UP/DOWN",
      "symbol": "BTC/USDT",
      "marketKey": "PM-BTC-5M-UPDOWN",
      "timeframeMinutes": 5,
      "side": "UP",
      "confidence": 73,
      "reason": "BULLISH regime + Strong uptrend + Volume spike",
      "skipTrade": false,
      "oraclePrice": 71826.47,
      "bybitPrice": 71482.6,
      "priceGap": { "usd": 343.87, "percent": 0.48 },
      "timeToSettle": 287,
      "trend": "BULLISH",
      "momentum": 65,
      "volatility": 0.42
    }
  ]
}
```

## Installation

```bash
npm install
```

## Usage

### Start the Scanner Daemon

```bash
node scripts/pm-scanner-daemon.cjs
```

The daemon will:
- Run every 10 seconds
- Update `public/pm-signals.json` with fresh signals
- Log activity to console

### Consume Signals

Read from `public/pm-signals.json` or use the API endpoint:

```typescript
const response = await fetch('/api/pm-bot/signals');
const data = await response.json();
```

## Configuration

Scanner behavior is controlled by:
- Market regime data (`public/pm-market-regime.json`)
- PM event configuration (embedded in PM bot config)

## Integration

Designed to integrate with the PM Trading Bot (`lib/pm-bot.ts`):

```typescript
const signals = await readPMScannerFeed();
// Bot decision logic uses these signals instead of Bybit scalp signals
```

## Differences from Bybit Scalp Scanner

| Aspect | Bybit Scalp | PM Scanner |
|--------|-------------|------------|
| **Purpose** | 1m spot trades | 5m-1h binary predictions |
| **Confidence** | Trade win probability | Outcome prediction accuracy |
| **Direction** | LONG-biased | Bidirectional (UP/DOWN) |
| **Filters** | Exchange execution focus | Oracle settlement focus |
| **Regime** | Not regime-aware | Regime-integrated |
| **Time Sensitivity** | Immediate execution | Settlement-aware (min 2min) |

## Performance Considerations

- **Update Frequency**: 10s (6 updates/min)
- **API Calls**: ~12 per update (4 coins × 3 timeframes)
- **File Size**: ~15-25KB per update
- **Memory**: <50MB typical

## License

MIT

## Author

Built for Bram's Mission Control trading system.
