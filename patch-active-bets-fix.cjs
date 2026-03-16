#!/usr/bin/env node
const fs = require('node:fs');
const PANEL = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage\\components\\trading\\pm-bot-panel.tsx';

let src = fs.readFileSync(PANEL, 'utf-8');

// FIX 1: Active bet color — use runtime feed prices as fallback when v4sig is missing
const oldPriceLookup = `              const v4sig = v4Signals.find((s: any) => s.marketKey === b.marketKey);
              const livePrice = v4sig?.oraclePrice || v4sig?.bybitPrice;`;

const newPriceLookup = `              // Use v4 scanner price, fallback to runtime feed prices (always available)
              const v4sig = v4Signals.find((s: any) => s.marketKey === b.marketKey);
              const feedPrice = runtime?.events?.find((e: any) => e.marketKey === b.marketKey);
              const livePrice = v4sig?.oraclePrice || v4sig?.bybitPrice || (feedPrice as any)?.lastPrice || (() => {
                // Last resort: extract price from the event reason string
                const m = (feedPrice?.reason || '').match(/price\\s+([\\d.]+)/);
                return m ? parseFloat(m[1]) : null;
              })();`;

if (src.includes(oldPriceLookup)) {
  src = src.replace(oldPriceLookup, newPriceLookup);
  console.log('✅ Fixed active bet price lookup (fallback to feed prices)');
} else {
  console.log('❌ Could not find price lookup pattern');
}

// FIX 2: Add "Settled" stat card after "Open Bets"
const oldOpenBets = `            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Open Bets</div>
              <div className="text-xl font-bold font-mono text-cyan-300">{runtime.stats?.openBets ?? 0}</div>
            </div>`;

const newOpenBetsWithSettled = `            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Open</div>
              <div className="text-xl font-bold font-mono text-cyan-300">{runtime.stats?.openBets ?? 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Settled</div>
              <div className="text-xl font-bold font-mono text-white/80">{runtime.stats?.closedBets ?? 0}</div>
              <div className="text-[9px] text-white/40 mt-0.5">
                <span className="text-emerald-400">{runtime.stats?.wins ?? 0}W</span>
                {' / '}
                <span className="text-rose-400">{runtime.stats?.losses ?? 0}L</span>
              </div>
            </div>`;

if (src.includes(oldOpenBets)) {
  src = src.replace(oldOpenBets, newOpenBetsWithSettled);
  console.log('✅ Added Settled stat card (with W/L breakdown)');
} else {
  console.log('❌ Could not find Open Bets card pattern');
}

fs.writeFileSync(PANEL, src, 'utf-8');
console.log('\nHerstart server: Ctrl+C → npm run dev');
