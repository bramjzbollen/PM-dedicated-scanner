# Mission Control Dashboard — Data Integration Sprint

## ✅ Completed

### HOME TAB
- **Email Widget**: Aggregates Gmail + bram@studioplanb.be + info@studioplanb.be
  - Shows account badges (Gmail/Plan B/Info) per email
  - Color-coded per account (blue/emerald/violet)
  - Unread count per account
  - 5-minute refresh interval
  - Graceful error handling per account (one failing doesn't break others)
  
- **News Widget**: Reads from `public/bavo-news.json`
  - Bavo writes to this file 2x daily
  - Breaking news support (red highlighted card)
  - 2-hour cache TTL
  - Falls back gracefully when file doesn't exist yet
  
- **Deadlines Widget**: Reads from `public/deadlines.json`
  - Top 5 urgent deadlines for today
  - Color-coded urgency (red/orange/green)
  - 1-minute refresh interval
  - Falls back to demo data if file missing
  
- **Daily P&L Card**: NOW reads from papertrades API (was mock data)
  - Shows total P&L, win rate, trades 24h, open count
  - 30-second refresh interval
  - Shows "Wachten op data..." when no papertrade file exists
  
- **BTC Widget**: Already working ✅
- **Weather Widget**: Already working ✅
- **Quick Stats**: Already working ✅

### TRADING DASHBOARD
- **Two-tab layout**:
  - Tab 1: **1m Scalping** — `scalp_1m` strategy trades from papertrade JSON
  - Tab 2: **5-15m Swing** — `swing_5_15m` strategy trades from papertrade JSON
  
- **Both tabs show**:
  - Stats row (Win Rate, Total P&L, Trades/Hour, Avg Hold Time, Best Trade, Max Drawdown)
  - Open trades table (pair, side, entry, leverage, size, confidence, time)
  - Closed trade history (pair, side, entry/exit, P&L, reason, time)
  - 5-second refresh interval
  
- **Live Prices Bar**: Now fetches from CoinGecko API
  - BTC, ETH, SOL, BNB, XRP, ADA
  - 30-second refresh
  - Fallback to last known prices on error

- **Equity Curve**: Stays as-is (will connect to real data once bot runs longer)

### API ROUTES
| Route | Source | Refresh |
|-------|--------|---------|
| `/api/emails` | Gmail + Work IMAP (3 accounts) | 5 min |
| `/api/bavo-news` | `public/bavo-news.json` | 2 hours |
| `/api/deadlines` | `public/deadlines.json` | 1 min |
| `/api/papertrades` | `public/papertrades.json` | 5 sec (trades), 30 sec (home) |

### DATA FILES
| File | Written By | Format |
|------|-----------|--------|
| `public/bavo-news.json` | Bavo agent | `{ items: [{ id, title, source, url, topic, lang, publishedAt, breaking }] }` |
| `public/deadlines.json` | Planning sync | `{ items: [{ id, title, dueDate }] }` |
| `public/papertrades.json` | Trading bot | `{ trades: [...], stats: {...} }` (see API route for full schema) |

### ENV VARS NEEDED
```
# Already configured:
GMAIL_USER=brambollen@gmail.com
GMAIL_APP_PASSWORD=<needs app password>

# New — add passwords:
WORK_IMAP_HOST=mail.your-server.de
WORK_IMAP_PORT=993
WORK_EMAIL_BRAM=bram@studioplanb.be
WORK_EMAIL_BRAM_PASSWORD=<set this>
WORK_EMAIL_INFO=info@studioplanb.be
WORK_EMAIL_INFO_PASSWORD=<set this>
```

## 🔧 To activate:
1. Set `GMAIL_APP_PASSWORD` in `.env.local`
2. Set `WORK_EMAIL_BRAM_PASSWORD` and `WORK_EMAIL_INFO_PASSWORD` in `.env.local`
3. Have Bavo write news to `public/bavo-news.json`
4. Have trading bot write to `public/papertrades.json`
5. Run `npm run dev` or `npm run build && npm start`

## Error Handling
- Missing JSON files → graceful empty state with helpful message
- Missing env vars → widget shows "config nodig" badge
- Individual email account failure → other accounts still work
- API timeout → keeps showing last known data
- Empty data → clean "no data" UI
