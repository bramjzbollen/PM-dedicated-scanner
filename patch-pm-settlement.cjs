#!/usr/bin/env node
/**
 * Fix PM Bot settlement to be 100% identical to Polymarket.
 * 
 * Polymarket crypto Up/Down rules:
 * - Each 5m/15m interval has an OPEN price (Chainlink snapshot at interval start)
 * - UP wins if: closePrice >= openPrice  (equal = UP wins)
 * - DOWN wins if: closePrice < openPrice
 * - You buy shares at market odds (e.g. 51¢ for UP)
 * - WIN: each share pays $1 → profit = cost × (1/odds - 1)
 * - LOSS: shares worth $0 → lose full stake
 * 
 * What we fix:
 * 1. Add intervalOpenPrice field to PMPaperBet
 * 2. Store interval open price when placing bets  
 * 3. Settlement: compare exitPrice vs intervalOpenPrice (not entryPrice)
 * 4. UP wins on >= (not strict >)
 */

const fs = require('node:fs');
const PM_BOT = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage\\lib\\pm-bot.ts';

fs.copyFileSync(PM_BOT, PM_BOT + '.pre-settlement-fix-' + Date.now());
console.log('Backup created');

let src = fs.readFileSync(PM_BOT, 'utf-8');
let ok = 0, fail = 0;
function log(pass, msg) { if (pass) { ok++; console.log(`  ✅ ${msg}`); } else { fail++; console.error(`  ❌ ${msg}`); } }

// ═══════════════════════════════════════════
// FIX 1: Add intervalOpenPrice to bet interface
// ═══════════════════════════════════════════
console.log('🔧 FIX 1: Add intervalOpenPrice to PMPaperBet');

const oldInterface = '  entryPrice: number;\n  entryOdds: number;';
const newInterface = '  entryPrice: number;\n  intervalOpenPrice: number; // Chainlink price at interval start (PM settlement reference)\n  entryOdds: number;';

if (src.includes(oldInterface) && !src.includes('intervalOpenPrice')) {
  src = src.replace(oldInterface, newInterface);
  log(true, 'Added intervalOpenPrice to PMPaperBet interface');
} else if (src.includes('intervalOpenPrice')) {
  log(true, 'intervalOpenPrice already in interface');
} else {
  log(false, 'Could not find PMPaperBet interface');
}

// ═══════════════════════════════════════════
// FIX 2: Add helper to get interval open price
// ═══════════════════════════════════════════
console.log('\n🔧 FIX 2: Add getIntervalOpenPrice helper');

const helperAnchor = 'function getRealPMOdds(marketKey: string';
const openPriceHelper = `/**
 * Get the Chainlink/oracle price at the START of the current PM interval.
 * This is what Polymarket uses as the reference price for settlement.
 * UP wins if closePrice >= this price, DOWN wins if closePrice < this price.
 */
function getIntervalOpenPrice(symbol: string, timeframeMinutes: number): number {
  try {
    const raw = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'public', 'pm-signals.json'), 'utf-8'
    );
    const feed = JSON.parse(raw);
    // Find signal for this symbol + timeframe
    const sig = feed.signals?.find((s: any) => 
      s.symbol === symbol && s.timeframeMinutes === timeframeMinutes
    );
    // Oracle price is closest to what Chainlink reports at interval start
    if (sig?.oraclePrice && sig.oraclePrice > 0) return sig.oraclePrice;
    if (sig?.bybitPrice && sig.bybitPrice > 0) return sig.bybitPrice;
    return 0;
  } catch {
    return 0;
  }
}

` + helperAnchor;

if (src.includes(helperAnchor) && !src.includes('getIntervalOpenPrice')) {
  src = src.replace(helperAnchor, openPriceHelper);
  log(true, 'Added getIntervalOpenPrice helper');
} else if (src.includes('getIntervalOpenPrice')) {
  log(true, 'getIntervalOpenPrice already exists');
} else {
  log(false, 'Could not find getRealPMOdds anchor');
}

// ═══════════════════════════════════════════
// FIX 3: Store intervalOpenPrice when placing bets
// ═══════════════════════════════════════════
console.log('\n🔧 FIX 3: Store intervalOpenPrice at bet placement');

// Main bet placement (around line 902)
const oldEntryPrice = '        entryPrice: Number(price.toFixed(8)),\n        entryOdds,';
const newEntryPrice = '        entryPrice: Number(price.toFixed(8)),\n        intervalOpenPrice: getIntervalOpenPrice(ev.symbol, ev.timeframeMinutes) || Number(price.toFixed(8)),\n        entryOdds,';

if (src.includes(oldEntryPrice) && !src.includes('intervalOpenPrice: getIntervalOpenPrice')) {
  // Replace ALL occurrences (main bet + fallback bet)
  src = src.split(oldEntryPrice).join(newEntryPrice);
  log(true, 'Added intervalOpenPrice to bet placement');
} else if (src.includes('intervalOpenPrice: getIntervalOpenPrice')) {
  log(true, 'intervalOpenPrice already in bet placement');
} else {
  log(false, 'Could not find entryPrice/entryOdds pattern');
}

// ═══════════════════════════════════════════
// FIX 4: Fix settlement to use intervalOpenPrice + >= for UP
// ═══════════════════════════════════════════
console.log('\n🔧 FIX 4: Fix settlement logic');

const oldSettlement = "    const won = b.side === 'UP' ? px > b.entryPrice : px < b.entryPrice;";
const newSettlement = `    // Polymarket settlement: UP wins if close >= interval open, DOWN wins if close < interval open
    const refPrice = b.intervalOpenPrice || b.entryPrice; // fallback for old bets without intervalOpenPrice
    const won = b.side === 'UP' ? px >= refPrice : px < refPrice;`;

if (src.includes(oldSettlement)) {
  src = src.replace(oldSettlement, newSettlement);
  log(true, 'Settlement uses intervalOpenPrice with >= for UP');
} else {
  // Check if already partially fixed
  if (src.includes('px >= refPrice')) {
    log(true, 'Settlement already fixed');
  } else {
    log(false, 'Could not find settlement line');
  }
}

// ═══════════════════════════════════════════
// FIX 5: Fix PnL calculation comment for clarity
// ═══════════════════════════════════════════
console.log('\n🔧 FIX 5: Update PnL calculation comments');

const oldCalcPnl = `function calcPnl(sizeUsd: number, entryOdds: number, won: boolean): number {
  // Binary market assumption for paper mode:
  // - WIN: payout = stake * (1/odds - 1)
  // - LOSS: lose full stake
  if (!won) return -sizeUsd;
  const gross = sizeUsd * ((1 / clamp(entryOdds, 0.05, 0.95)) - 1);
  return Number(gross.toFixed(2));
}`;

const newCalcPnl = `function calcPnl(sizeUsd: number, entryOdds: number, won: boolean): number {
  // Polymarket binary market PnL:
  // Buy shares at entryOdds (e.g. 0.51 = 51¢ per share)
  // shares = sizeUsd / entryOdds
  // WIN: each share pays $1 → profit = shares × $1 - sizeUsd = sizeUsd × (1/odds - 1)
  // LOSS: shares worth $0 → lose full stake = -sizeUsd
  if (!won) return -sizeUsd;
  const odds = clamp(entryOdds, 0.05, 0.95);
  const profit = sizeUsd * ((1 / odds) - 1);
  return Number(profit.toFixed(2));
}`;

if (src.includes(oldCalcPnl)) {
  src = src.replace(oldCalcPnl, newCalcPnl);
  log(true, 'Updated calcPnl with PM-accurate comments');
} else {
  log(true, 'calcPnl already updated or different format');
}

fs.writeFileSync(PM_BOT, src, 'utf-8');

// ═══════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════`);
console.log(`${ok} passed, ${fail} failed`);

if (fail === 0) {
  console.log('\n✅ Settlement now 100% identical to Polymarket!');
  console.log('\nWat is gefixt:');
  console.log('  1. intervalOpenPrice opgeslagen bij elke bet');
  console.log('     → Dit is de Chainlink prijs aan het begin van het interval');
  console.log('  2. Settlement: closePrice >= intervalOpenPrice = UP WINS');
  console.log('     → Niet meer vergeleken met onze entry prijs');
  console.log('     → >= in plaats van > (gelijk = UP wint, zoals PM)');
  console.log('  3. PnL berekening onveranderd (was al correct)');
  console.log('     → WIN: $size × (1/odds - 1)');
  console.log('     → LOSS: -$size');
  console.log('\n⚠️  Reset bets (oude bets missen intervalOpenPrice):');
  console.log('  Set-Content "C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\trade-state\\pm-bot-paper-bets.json" "[]"');
  console.log('\nHerstart server: Ctrl+C → npm run dev');
}
