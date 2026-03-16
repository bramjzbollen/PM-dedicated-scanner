#!/usr/bin/env node
/**
 * Patch V1 PM Bot — Fix PnL + Active Bet Colors + Filters
 * 
 * 1. Fix entryOdds to use real PM market odds (not synthetic formula)
 * 2. Add winning/losing color to active bets in dashboard
 * 3. Add pair + timeframe filter system
 */

const fs = require('node:fs');
const path = require('node:path');

const V1 = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage';
const PM_BOT = path.join(V1, 'lib', 'pm-bot.ts');
const PANEL = path.join(V1, 'components', 'trading', 'pm-bot-panel.tsx');

let ok = 0, fail = 0;
function log(pass, msg) { if (pass) { ok++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ ${msg}`); } }

// Backup both files
fs.copyFileSync(PM_BOT, PM_BOT + '.pre-pnlfix-' + Date.now());
fs.copyFileSync(PANEL, PANEL + '.pre-pnlfix-' + Date.now());
console.log('Backups created');

// ═══════════════════════════════════════════════════════════
// PATCH 1: Fix entryOdds in pm-bot.ts
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 1: Fix entryOdds — use real PM odds');

let bot = fs.readFileSync(PM_BOT, 'utf-8');

// 1a: Add helper to read PM odds from v4 scanner at bet time
const oddsHelperAnchor = 'function calcPnl(sizeUsd: number, entryOdds: number, won: boolean): number {';
const oddsHelper = `/**
 * Get real Polymarket odds for a market from the v4 scanner output.
 * Returns the market odds for the given side, or 0.5 as fallback.
 */
function getRealPMOdds(marketKey: string, side: 'UP' | 'DOWN'): number {
  try {
    const raw = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'public', 'pm-signals.json'), 'utf-8'
    );
    const feed = JSON.parse(raw);
    const age = Date.now() - new Date(feed.timestamp).getTime();
    if (age > 60_000) return 0.5; // stale
    const sig = feed.signals?.find((s: any) => s.marketKey === marketKey);
    if (sig?.pmOdds) {
      const odds = side === 'UP' ? sig.pmOdds.up : sig.pmOdds.down;
      if (typeof odds === 'number' && odds > 0.01 && odds < 0.99) return odds;
    }
    return 0.5;
  } catch {
    return 0.5;
  }
}

` + oddsHelperAnchor;

if (bot.includes(oddsHelperAnchor) && !bot.includes('getRealPMOdds')) {
  bot = bot.replace(oddsHelperAnchor, oddsHelper);
  log(true, 'Added getRealPMOdds helper');
} else if (bot.includes('getRealPMOdds')) {
  log(true, 'getRealPMOdds already exists');
} else {
  log(false, 'Could not find calcPnl anchor');
}

// 1b: Replace the synthetic entryOdds formula with real PM odds
const oldOddsCalc = `      const edge = clamp((decision.confidence - 50) / 100, 0.02, 0.35);
      const entryOdds = Number(clamp(0.5 - edge, 0.12, 0.88).toFixed(3));`;

const newOddsCalc = `      // Use REAL Polymarket odds — not synthetic formula
      const realOdds = getRealPMOdds(ev.marketKey, decision.side);
      const entryOdds = Number(clamp(realOdds, 0.05, 0.95).toFixed(3));`;

if (bot.includes(oldOddsCalc)) {
  bot = bot.replace(oldOddsCalc, newOddsCalc);
  log(true, 'Replaced synthetic entryOdds with real PM odds');
} else {
  // Try partial match
  if (bot.includes('const edge = clamp((decision.confidence - 50) / 100')) {
    const lines = bot.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('const edge = clamp((decision.confidence - 50) / 100')) {
        lines[i] = '      // Use REAL Polymarket odds — not synthetic formula';
        if (lines[i+1] && lines[i+1].includes('const entryOdds')) {
          lines[i+1] = '      const realOdds = getRealPMOdds(ev.marketKey, decision.side);\n      const entryOdds = Number(clamp(realOdds, 0.05, 0.95).toFixed(3));';
        }
        bot = lines.join('\n');
        log(true, 'Replaced entryOdds (partial match)');
        break;
      }
    }
  } else {
    log(false, 'Could not find entryOdds formula to replace');
  }
}

// 1c: Also fix the fallback hardcoded 0.5 — use real odds when available
const oldFallbackOdds = '            entryOdds: 0.5,';
const newFallbackOdds = '            entryOdds: getRealPMOdds(ev.marketKey, decision.side),';

if (bot.includes(oldFallbackOdds)) {
  bot = bot.replace(oldFallbackOdds, newFallbackOdds);
  log(true, 'Fixed fallback bet entryOdds too');
} else {
  log(false, 'Could not find fallback entryOdds');
}

fs.writeFileSync(PM_BOT, bot, 'utf-8');

// ═══════════════════════════════════════════════════════════
// PATCH 2: Active bets winning/losing colors + Filters
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 2: Active bet colors + Filter system');

let panel = fs.readFileSync(PANEL, 'utf-8');

// 2a: Add filter state after v4Signals state
const filterAnchor = 'const [collapsedEvents, setCollapsedEvents]';
const filterState = `// Market filters
  const [filterTimeframes, setFilterTimeframes] = useState<Set<number>>(new Set([5, 15]));
  const [filterPairs, setFilterPairs] = useState<Set<string>>(new Set(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT']));

  const allPairs = useMemo(() => {
    const pairs = new Set<string>();
    (runtime?.events || []).forEach((e: any) => { if (e.symbol) pairs.add(e.symbol); });
    return [...pairs].sort();
  }, [runtime]);

  const allTimeframes = useMemo(() => {
    const tfs = new Set<number>();
    (config?.events || []).forEach((e: any) => { if (e.timeframeMinutes) tfs.add(e.timeframeMinutes); });
    return [...tfs].sort((a, b) => a - b);
  }, [config]);

  const filteredEvents = useMemo(() => {
    return (runtime?.events || []).filter((e: any) => {
      const cfg = config?.events?.find((x: any) => x.marketKey === e.marketKey);
      return filterPairs.has(e.symbol) && filterTimeframes.has(cfg?.timeframeMinutes ?? 5);
    });
  }, [runtime, config, filterPairs, filterTimeframes]);

  `;

if (panel.includes(filterAnchor) && !panel.includes('filterTimeframes')) {
  panel = panel.replace(filterAnchor, filterState + filterAnchor);
  log(true, 'Added filter state + memoized filteredEvents');
} else if (panel.includes('filterTimeframes')) {
  log(true, 'Filter state already exists');
} else {
  log(false, 'Could not find filter anchor');
}

// 2b: Add filter UI before the event cards grid
// Find the Markets header and add filters after it
const marketsHeaderEnd = panel.indexOf('xl:grid-cols-4 gap-3');
if (marketsHeaderEnd > -1) {
  // Find the CardContent opening before the grid
  const searchBack = panel.lastIndexOf('<CardContent>', marketsHeaderEnd);
  if (searchBack > -1) {
    const insertPoint = panel.indexOf('>', searchBack) + 1;
    const filterUI = `
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-white/30">Timeframe</span>
              {allTimeframes.map((tf: number) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setFilterTimeframes(prev => {
                    const next = new Set(prev);
                    next.has(tf) ? next.delete(tf) : next.add(tf);
                    return next;
                  })}
                  className={cn(
                    'px-2 py-1 rounded-md border text-[10px] font-medium transition-all',
                    filterTimeframes.has(tf)
                      ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
                      : 'border-white/10 bg-white/[0.02] text-white/30 hover:text-white/50'
                  )}
                >
                  {tf < 60 ? tf + 'm' : (tf / 60) + 'h'}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-white/30">Pairs</span>
              {allPairs.map((pair: string) => {
                const coin = pair.replace('/USDT', '');
                return (
                  <button
                    key={pair}
                    type="button"
                    onClick={() => setFilterPairs(prev => {
                      const next = new Set(prev);
                      next.has(pair) ? next.delete(pair) : next.add(pair);
                      return next;
                    })}
                    className={cn(
                      'px-2 py-1 rounded-md border text-[10px] font-medium transition-all',
                      filterPairs.has(pair)
                        ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300'
                        : 'border-white/10 bg-white/[0.02] text-white/30 hover:text-white/50'
                    )}
                  >
                    {coin}
                  </button>
                );
              })}
            </div>
          </div>
`;
    if (!panel.includes('filterTimeframes.has')) {
      panel = panel.slice(0, insertPoint) + filterUI + panel.slice(insertPoint);
      log(true, 'Added filter UI bar');
    } else {
      log(true, 'Filter UI already exists');
    }
  }
}

// 2c: Replace runtime.events with filteredEvents in the card grid
if (panel.includes('(runtime.events || []).map((e)') && panel.includes('filteredEvents')) {
  panel = panel.replace('(runtime.events || []).map((e)', 'filteredEvents.map((e: any)');
  log(true, 'Switched event cards to use filteredEvents');
} else if (!panel.includes('filteredEvents.map')) {
  log(false, 'Could not replace runtime.events with filteredEvents');
}

// 2d: Replace active bets section with winning/losing colors
// Find and replace the active bet row rendering
const oldBetRow = `              const isLongSide = b.side === 'UP';
              const borderClass = isLongSide ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-rose-500/30 bg-rose-500/[0.03]';`;

const newBetRow = `              const isLongSide = b.side === 'UP';
              // Determine if bet is currently winning or losing based on live price
              const v4sig = v4Signals.find((s: any) => s.marketKey === b.marketKey);
              const livePrice = v4sig?.oraclePrice || v4sig?.bybitPrice;
              const isWinning = livePrice
                ? (b.side === 'UP' ? livePrice > b.entryPrice : livePrice < b.entryPrice)
                : null;
              // Calculate unrealized PnL
              const unrealizedPnl = isWinning !== null
                ? isWinning
                  ? +(b.sizeUsd * ((1 / Math.max(b.entryOdds, 0.05)) - 1)).toFixed(2)
                  : -b.sizeUsd
                : null;
              const borderClass = isWinning === true
                ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                : isWinning === false
                  ? 'border-rose-500/40 bg-rose-500/[0.06]'
                  : isLongSide ? 'border-emerald-500/20 bg-emerald-500/[0.02]' : 'border-rose-500/20 bg-rose-500/[0.02]';`;

if (panel.includes(oldBetRow)) {
  panel = panel.replace(oldBetRow, newBetRow);
  log(true, 'Added winning/losing detection to active bets');
} else {
  log(false, 'Could not find active bet row to patch');
}

// 2e: Add PnL indicator to the bet display line
const oldBetDisplay = `                      <div className="text-white/70 truncate"><span className="text-white font-medium">{b.pair}</span>`;
const newBetDisplay = `                      <div className="text-white/70 truncate"><span className="text-white font-medium">{b.pair}</span>`;

// Find and add unrealized PnL after the timer badge in active bets
const timerBadgeEnd = `                  <Badge variant="outline" className={cn('text-[10px] font-mono shrink-0', timer.className)}>
                    {timer.status === 'COUNTDOWN' ? \`T-\${timer.label}\` : timer.label}
                  </Badge>`;

const timerBadgeNew = `                  <div className="flex items-center gap-1.5 shrink-0">
                    {unrealizedPnl !== null && (
                      <span className={cn('text-[10px] font-mono font-semibold', unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}
                      </span>
                    )}
                    <Badge variant="outline" className={cn('text-[10px] font-mono shrink-0', timer.className)}>
                      {timer.status === 'COUNTDOWN' ? \`T-\${timer.label}\` : timer.label}
                    </Badge>
                  </div>`;

if (panel.includes(timerBadgeEnd)) {
  panel = panel.replace(timerBadgeEnd, timerBadgeNew);
  log(true, 'Added unrealized PnL to active bets');
} else {
  log(false, 'Could not find timer badge to add PnL');
}

fs.writeFileSync(PANEL, panel, 'utf-8');

// ═══════════════════════════════════════════════════════════
// VERIFY
// ═══════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
const finalBot = fs.readFileSync(PM_BOT, 'utf-8');
const finalPanel = fs.readFileSync(PANEL, 'utf-8');

const checks = [
  ['getRealPMOdds helper', finalBot.includes('getRealPMOdds')],
  ['Real odds in bet placement', finalBot.includes('getRealPMOdds(ev.marketKey')],
  ['No synthetic edge formula', !finalBot.includes('const edge = clamp((decision.confidence - 50) / 100')],
  ['Filter state', finalPanel.includes('filterTimeframes')],
  ['Filter UI', finalPanel.includes('Timeframe')],
  ['filteredEvents in grid', finalPanel.includes('filteredEvents.map')],
  ['Winning/losing detection', finalPanel.includes('isWinning')],
  ['Unrealized PnL', finalPanel.includes('unrealizedPnl')],
];

for (const [label, pass] of checks) {
  console.log(`  ${pass ? '✅' : '❌'} ${label}`);
}

console.log(`\n${ok} passed, ${fail} failed`);
if (fail === 0) {
  console.log('\n✅ All patches applied!');
  console.log('\nWat is gefixt:');
  console.log('  1. PnL: entryOdds gebruikt nu echte PM marktprijzen (bijv. 51¢)');
  console.log('     i.p.v. synthetische formule (die 15¢ gaf = 5x te hoge winst)');
  console.log('  2. Active bets: groen als winning, rood als losing + unrealized PnL');
  console.log('  3. Filters: toggle knoppen voor timeframe (5m/15m) en pairs (BTC/ETH/SOL/XRP)');
  console.log('\n⚠️  Reset bets zodat de nieuwe odds van toepassing zijn:');
  console.log('  Set-Content "C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\trade-state\\pm-bot-paper-bets.json" "[]"');
  console.log('\nHerstart server: Ctrl+C → npm run dev');
}
