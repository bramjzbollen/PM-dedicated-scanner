# PM Dedicated Scanner

Polymarket-specific trading signal scanner with regime-aware confidence scoring.

## Overview

This scanner generates trading signals specifically optimized for Polymarket binary outcome markets (UP/DOWN predictions), as opposed to traditional spot trading signals.

## Features

- **Bidirectional Signals**: Generates both UP and DOWN signals based on market conditions
- **Market Regime Awareness**: Integrates BTC-based market regime detection (BULLISH/BEARISH/RANGING/HIGH_VOLATILITY)
- **PM-Specific Filters** (Phase 1 - Win Rate Optimized):
  - **Market Timing Filter**: Skips all trades during RANGING/HIGH_VOLATILITY regimes
  - **Oracle Gap Protection**: -10 confidence penalty >0.5%, hard skip >1.0%
  - **Asymmetric Confidence**: Trend-following ≥60%, counter-trend ≥75%
  - **Trend Data Quality**: Hard skip for "Geen trenddata" signals
  - **Time-to-Settlement**: Minimum 180s (increased from 120s)
  - **Volume Confirmation**: Requires 1.2x average volume
  - **Regime Alignment**: Stricter penalties for counter-trend (-25 vs -15)
- **Confidence Calibration System**:
  - Analyzes historical bet performance
  - Generates multipliers per confidence bucket
  - Aligns scanner confidence with actual win probability
  - Re-calibratable as more data accumulates
- **8-Factor Technical Analysis**:
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
- **Performance Target**: 55%+ win rate (achieved from initial 46%)

## Architecture

### Core Components

1. **PM Scanner Module** (`lib/pm-scanner.ts`)
   - Technical analysis engine
   - PM-tuned confidence calculator
   - Filter validation logic
   - Event analyzer

2. **PM Scanner Daemon** (`scripts/pm-scanner-daemon.cjs`)
   - Standalone Node.js process (updates every 10s)
   - Fetches data from multiple sources:
     - Bybit OHLCV (via CCXT)
     - Oracle prices (CoinGecko/Chainlink)
     - PM Bot live events (via state API)
     - Market regime data
   - Outputs to `public/pm-signals.json`

3. **Market Regime Daemon** (`scripts/regime-scanner-daemon.cjs`)
   - Standalone Node.js process (updates every 60s)
   - Analyzes BTC market conditions:
     - 5-factor regime scoring (EMA/RSI/MACD/Volatility/Price Action)
     - Determines BULLISH/BEARISH/RANGING/HIGH_VOLATILITY states
   - Outputs to `public/pm-market-regime.json`

4. **API Endpoint** (`app/api/pm-bot/signals/route.ts`)
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

### Start Both Daemons

**Market Regime Scanner** (run first):
```bash
node scripts/regime-scanner-daemon.cjs
```

The regime daemon will:
- Run every 60 seconds
- Analyze BTC market conditions
- Update `public/pm-market-regime.json`
- Log regime state to console

**PM Signal Scanner**:
```bash
node scripts/pm-scanner-daemon.cjs
```

The PM daemon will:
- Run every 10 seconds
- Read regime from `pm-market-regime.json`
- Fetch PM bot events, OHLCV, and oracle prices
- Update `public/pm-signals.json` with regime-adjusted signals
- Log signal count to console

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
