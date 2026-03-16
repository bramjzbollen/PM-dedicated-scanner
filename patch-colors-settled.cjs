#!/usr/bin/env node
/**
 * Fix active bet winning/losing colors + add settled counter
 * 
 * Problem: colors compare livePrice vs entryPrice, but PM settles on
 * interval open vs close. Near settlement the color flickers.
 * 
 * Fix: use live PM odds — if our side's odds > 50%, we're winning.
 * Also: add total settled trades counter to the stats bar.
 */

const fs = require('node:fs');
const PANEL = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage\\components\\trading\\pm-bot-panel.tsx';

let src = fs.readFileSync(PANEL, 'utf-8');
let ok = 0, fail = 0;
function log(pass, msg) { if (pass) { ok++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ ${msg}`); } }

// ═══════════════════════════════════════════
// FIX 1: Active bet colors — use PM odds instead of price comparison
// ═══════════════════════════════════════════
console.log('🔧 FIX 1: Active bet winning/losing colors');

const oldWinning = `              const isWinning = livePrice
                ? (b.side === 'UP' ? livePrice > b.entryPrice : livePrice < b.entryPrice)
                : null;
              // Calculate unrealized PnL
              const unrealizedPnl = isWinning !== null
                ? isWinning
                  ? +(b.sizeUsd * ((1 / Math.max(b.entryOdds, 0.05)) - 1)).toFixed(2)
                  : -b.sizeUsd
                : null;`;

const newWinning = `              // Use PM odds to determine winning/losing (more reliable than price comparison)
              const v4market = v4ByKey.get(b.marketKey);
              const ourSideOdds = v4market?.pmOdds
                ? (b.side === 'UP' ? v4market.pmOdds.up : v4market.pmOdds.down)
                : null;
              const isWinning = ourSideOdds !== null && ourSideOdds !== undefined
                ? ourSideOdds > 0.50
                : null;
              // Calculate unrealized PnL based on current odds vs entry odds
              const unrealizedPnl = ourSideOdds !== null && ourSideOdds !== undefined
                ? +(b.sizeUsd * ((ourSideOdds / Math.max(b.entryOdds, 0.05)) - 1)).toFixed(2)
                : null;`;

if (src.includes(oldWinning)) {
  src = src.replace(oldWinning, newWinning);
  log(true, 'Replaced price-based winning check with PM odds-based');
} else {
  // Try partial match
  if (src.includes("b.side === 'UP' ? livePrice > b.entryPrice")) {
    // Find and replace the block line by line
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("b.side === 'UP' ? livePrice > b.entryPrice")) {
        // Replace from isWinning through unrealizedPnl
        const start = i - 1; // const isWinning line
        let end = i;
        for (let j = i; j < Math.min(i + 8, lines.length); j++) {
          if (lines[j].includes(': null;') && lines[j-1]?.includes('-b.sizeUsd')) {
            end = j;
            break;
          }
        }
        const replacement = newWinning.split('\n');
        lines.splice(start, end - start + 1, ...replacement);
        src = lines.join('\n');
        log(true, 'Replaced winning check (partial match)');
        break;
      }
    }
  } else {
    log(false, 'Could not find isWinning block');
  }
}

// ═══════════════════════════════════════════
// FIX 2: Add settled trades counter to stats bar
// ═══════════════════════════════════════════
console.log('\n🔧 FIX 2: Add settled counter to stats');

// Find the "Open Bets" stat card and add a "Settled" card after it
const openBetsCard = `              <div className="text-[10px] uppercase tracking-wider text-white/30">Open Bets</div>
              <div className="text-xl font-bold font-mono text-cyan-300">{runtime.stats?.openBets ?? 0}</div>`;

const openBetsPlusSettled = `              <div className="text-[10px] uppercase tracking-wider text-white/30">Open Bets</div>
              <div className="text-xl font-bold font-mono text-cyan-300">{runtime.stats?.openBets ?? 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Settled</div>
              <div className="text-xl font-bold font-mono text-violet-300">{runtime.stats?.closedBets ?? 0}</div>`;

if (src.includes(openBetsCard)) {
  src = src.replace(openBetsCard, openBetsPlusSettled);
  log(true, 'Added Settled counter to stats bar');
} else {
  log(false, 'Could not find Open Bets stat card');
}

// Also update the grid to accommodate the extra card
const oldGrid = 'grid grid-cols-2 md:grid-cols-5';
const newGrid = 'grid grid-cols-2 md:grid-cols-6';
if (src.includes(oldGrid)) {
  src = src.replace(oldGrid, newGrid);
  log(true, 'Updated stats grid to 6 columns');
} else {
  log(true, 'Stats grid already updated or different format');
}

fs.writeFileSync(PANEL, src, 'utf-8');

// ═══════════════════════════════════════════
console.log(`\n${ok} passed, ${fail} failed`);
if (fail === 0) {
  console.log('\n✅ Fixes applied!');
  console.log('  1. Active bets: groen/rood gebaseerd op PM odds (niet prijs)');
  console.log('     → odds > 50% voor onze side = groen, < 50% = rood');
  console.log('     → unrealized PnL berekend op basis van odds-verhouding');
  console.log('  2. Settled counter toegevoegd aan stats bar');
  console.log('\nHerstart server: Ctrl+C → npm run dev');
}
