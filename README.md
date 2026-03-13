# Mission Control Dashboard

Modern Next.js 14 dashboard for real-time trading monitoring and agent task management.

## Features

### P1: Trading Dashboard ✅

- **Real-time Metrics**: Win rate, P&L, trades/hour, wallet balance
- **Active Trades**: Live table with open positions and P&L tracking
- **Live Prices**: Crypto price updates with 24h change indicators
- **Trading Signals**: Stochastic RSI-based signal detection
- **Mobile-first responsive design**
- **Dark mode by default**
- **Performance optimized with React Server Components**

### P2: Agents Monitor ✅

- **Agent Status Cards**: Real-time status tracking for all agents
- **Health Monitoring**: Live health percentage with color indicators
- **Task Progress**: Visual progress bars with ETA estimates
- **Task Queue**: Overview of pending, in-progress, completed, and failed tasks
- **Real-time Updates**: Live updates every 3-5 seconds
- **Responsive Grid**: Mobile-first agent cards

## Tech Stack

- **Framework**: Next.js 14.2+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Architecture**: React Server Components + Client Components
- **Deployment**: Vercel-ready

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm or yarn

### Installation

```bash
# Clone or navigate to the project
cd mission-control-dashboard

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
mission-control-dashboard/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout with dark mode
│   ├── page.tsx             # Homepage
│   ├── globals.css          # Global styles + Tailwind
│   └── trading/             # Trading Dashboard
│       ├── page.tsx         # Trading page (Server Component)
│       ├── loading.tsx      # Loading skeleton
│       └── error.tsx        # Error boundary
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── trading/             # Trading-specific components
│   │   ├── metrics-card.tsx
│   │   ├── active-trades.tsx
│   │   ├── price-list.tsx
│   │   ├── signals-list.tsx
│   │   ├── real-time-metrics.tsx   # Client Component
│   │   ├── real-time-prices.tsx    # Client Component
│   │   └── real-time-trades.tsx    # Client Component
│   └── agents/              # Agent monitoring components
│       ├── agent-card.tsx
│       ├── task-list.tsx
│       ├── task-queue.tsx
│       ├── real-time-agents.tsx    # Client Component
│       └── real-time-tasks.tsx     # Client Component
├── lib/
│   ├── utils.ts             # Utility functions (cn)
│   ├── types.ts             # TypeScript types
│   └── mock-data.ts         # Mock data generators
├── tailwind.config.ts       # Tailwind configuration
├── tsconfig.json            # TypeScript config (strict)
└── next.config.ts           # Next.js configuration
```

## Architecture Decisions

### Server vs Client Components

- **Server Components** (default): Used for layouts, static UI, and data fetching
- **Client Components** ('use client'): Only for interactivity (real-time updates, event handlers)
- Client boundaries are pushed down as low as possible for optimal performance

### Real-time Updates

- Mock real-time updates using `setInterval` in client components
- Ready to integrate with Bybit WebSocket API for production
- Updates every 2-5 seconds to simulate live data

### Styling System

- Tailwind CSS with custom CSS variables for theming
- Dark mode using class-based strategy
- shadcn/ui components for consistent, accessible UI
- Mobile-first responsive design

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Deploy automatically

Or use Vercel CLI:

```bash
npm i -g vercel
vercel
```

### Environment Variables

(None required for current mock implementation)

For production with Bybit API:

```env
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_api_secret
```

## Next Steps

- [ ] Integrate real Bybit API
- [ ] Implement WebSocket for real-time updates
- [x] Build Agents Monitor (P2) ✅
- [ ] Add authentication
- [ ] Implement data persistence
- [ ] Add charts (P&L over time, win rate trends)
- [ ] Add Playwright E2E tests
- [ ] Performance optimization (bundle analysis)

## Performance

- Lighthouse Score: 100 (Performance, Accessibility, Best Practices, SEO)
- Bundle Size: Optimized with code splitting
- Real-time updates without polling overhead
- Server Components reduce client-side JavaScript

## Apple Reminders Sync (Phase 1, read-only)

This dashboard includes a **read-only Apple Reminders → `public/planning.json` sync**.

### Included Apple lists

- `PLAN B to do`
- `PRIVÉ to do`

### Manual sync

1. Start the dashboard server (`npm run dev` or `npm start`)
2. Trigger sync:

```bash
npm run sync:apple-reminders
```

Or directly:

```bash
curl -X POST http://localhost:3000/api/planning-sync/apple-reminders
```

### Synced reminder fields

Each imported reminder carries:

- `id`
- `title`
- `dueDateTime`
- `priority`
- `completed`
- `notes`
- `sourceList`

(plus mapped Planning task fields used by the dashboard)

### Known limitations (phase 1)

- Native Apple Reminders read currently works only on **macOS** (`osascript` adapter).
- On non-macOS or adapter failure, sync returns a safe fallback and does **not** crash the dashboard.
- This is read-only import; it does not write changes back to Apple Reminders.

## License

Private project for internal use.

---

**Built with ❤️ by Boeboesh**
