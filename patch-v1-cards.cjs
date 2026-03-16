#!/usr/bin/env node
/**
 * Patch V1 PM Bot Dashboard — Polymarket-Style Event Cards
 * 
 * 1. Installs /api/pm-bot/signals route (serves v4 scanner data)
 * 2. Patches pm-bot-panel.tsx with:
 *    - v4 signal fetching (PM odds, edge, kelly)
 *    - Polymarket-style event card design
 *    - Live odds display with edge indicators
 */

const fs = require('node:fs');
const path = require('node:path');

const V1 = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage';
const PANEL = path.join(V1, 'components', 'trading', 'pm-bot-panel.tsx');

let errors = 0;
let successes = 0;

function log(ok, msg) {
  if (ok) { successes++; console.log(`  ✅ ${msg}`); }
  else { errors++; console.error(`  ❌ ${msg}`); }
}

// ═══════════════════════════════════════════
// STEP 1: Install signals API route
// ═══════════════════════════════════════════
console.log('\n🔧 STEP 1: Signals API route');

const signalsDir = path.join(V1, 'app', 'api', 'pm-bot', 'signals');
if (!fs.existsSync(signalsDir)) fs.mkdirSync(signalsDir, { recursive: true });

const signalsRoute = `import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await readFile(join(process.cwd(), 'public', 'pm-signals.json'), 'utf-8');
    const feed = JSON.parse(raw);
    const age = Date.now() - new Date(feed.timestamp).getTime();
    return NextResponse.json({ ...feed, ageMs: age, stale: age > 60000 }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ signals: [], stale: true }, { status: 500 });
  }
}
`;
fs.writeFileSync(path.join(signalsDir, 'route.ts'), signalsRoute, 'utf-8');
log(true, 'Created /api/pm-bot/signals/route.ts');

// ═══════════════════════════════════════════
// STEP 2: Patch pm-bot-panel.tsx
// ═══════════════════════════════════════════
console.log('\n🔧 STEP 2: Patch pm-bot-panel.tsx');

// Backup
const bak = PANEL + '.backup-cards-' + Date.now();
fs.copyFileSync(PANEL, bak);
log(true, `Backup: ${path.basename(bak)}`);

let src = fs.readFileSync(PANEL, 'utf-8');

// 2a: Add V4Signal type after existing types
const typeAnchor = 'type WalletBalance = {';
const v4Types = `// V4 Scanner signal (from pm-signals.json)
type V4Signal = {
  event: string;
  symbol: string;
  marketKey: string;
  timeframeMinutes: number;
  side: 'UP' | 'DOWN' | null;
  confidence: number;
  reason: string;
  skipTrade: boolean;
  edge?: number;
  pmOdds?: { up: number; down: number };
  pmSpread?: number;
  kelly?: { fullKellyPct: number; recommendedPct: number; edge: number; worthBetting: boolean };
  oraclePrice?: number;
  bybitPrice?: number;
  timeToSettle?: number;
  trend?: string;
  momentum?: number;
  volatility?: number;
  velocity?: { direction: string; strength: number; projected: number };
  flashCrash?: any;
  probUp?: number;
  probDown?: number;
};
type V4Feed = { timestamp: string; version: string; regime: string; regimeConfidence: number; signals: V4Signal[]; ageMs?: number; stale?: boolean };

`;

if (src.includes(typeAnchor) && !src.includes('V4Signal')) {
  src = src.replace(typeAnchor, v4Types + typeAnchor);
  log(true, 'Added V4Signal + V4Feed types');
} else if (src.includes('V4Signal')) {
  log(true, 'V4Signal types already present');
} else {
  log(false, 'Could not find type anchor for V4Signal');
}

// 2b: Add v4 signals state + fetch inside component
// Find the component's state declarations area
const stateAnchor = 'const [collapsedEvents, setCollapsedEvents]';
const v4State = `// V4 scanner signals (live PM odds + edge)
  const [v4Signals, setV4Signals] = useState<V4Signal[]>([]);
  const [v4Regime, setV4Regime] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const fetchV4 = async () => {
      try {
        const res = await fetch('/api/pm-bot/signals', { cache: 'no-store' });
        if (!res.ok) return;
        const data: V4Feed = await res.json();
        if (!cancelled && data.signals) {
          setV4Signals(data.signals);
          setV4Regime(data.regime || '');
        }
      } catch { /* silent */ }
    };
    fetchV4();
    const id = setInterval(fetchV4, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Map v4 signals by marketKey for quick lookup
  const v4ByKey = useMemo(() => {
    const map = new Map<string, V4Signal>();
    for (const s of v4Signals) map.set(s.marketKey, s);
    return map;
  }, [v4Signals]);

  `;

if (src.includes(stateAnchor) && !src.includes('v4Signals')) {
  src = src.replace(stateAnchor, v4State + stateAnchor);
  log(true, 'Added v4 signals state + useEffect + useMemo');
} else if (src.includes('v4Signals')) {
  log(true, 'v4Signals state already present');
} else {
  log(false, 'Could not find state anchor for v4Signals');
}

// 2c: Check that useMemo and useState are imported
if (!src.includes('useMemo')) {
  src = src.replace("import { useState, useEffect", "import { useState, useEffect, useMemo");
  if (src.includes('useMemo')) {
    log(true, 'Added useMemo to imports');
  } else {
    // Try alternative import pattern
    src = src.replace("'use client';", "'use client';\nimport { useMemo } from 'react';");
    log(src.includes('useMemo'), 'Added useMemo import');
  }
}

// 2d: Replace event cards with Polymarket-style design
const oldEventCards = `<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(runtime.events || []).map((e) => {
              const cfg = config.events.find((x) => x.marketKey === e.marketKey);
              const timeframe = formatTimeframe(cfg?.timeframeMinutes ?? 60);
              const isOpen = Boolean(e.activeBetId && e.countdownSec > 0);
              const isClosing = isOpen && e.countdownSec <= 120;
              const statusLabel = isOpen ? (isClosing ? 'CLOSING' : 'OPEN') : (e.confidence > 0 ? 'SETTLED' : 'IDLE');
              const statusClass = isOpen
                ? (isClosing ? 'border-amber-500/40 text-amber-200' : 'border-emerald-500/40 text-emerald-200')
                : e.confidence > 0
                  ? 'border-cyan-500/30 text-cyan-200'
                  : 'border-white/20 text-white/60';

              const isCollapsed = collapsedEvents[e.marketKey] ?? false;

              return (
                <div key={e.marketKey} className="rounded-xl border border-white/[0.1] bg-white/[0.02] p-3 space-y-3">
                  <div
                    className="flex items-start justify-between gap-2 cursor-pointer"
                    onClick={() => setCollapsedEvents(prev => ({ ...prev, [e.marketKey]: !prev[e.marketKey] }))}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white font-semibold truncate">{e.label}</div>
                      <div className="text-[11px] text-white/55 truncate">{e.symbol} \u2022 {timeframe} \u2022 {e.marketKey}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[10px]', statusClass)}>{statusLabel}</Badge>
                      <span className="text-white/40 text-xs">{isCollapsed ? '\u25BC' : '\u25B2'}</span>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className={cn('rounded-md border px-2 py-1.5', e.suggestedSide === 'UP' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200/60')}>
                      YES / UP
                    </div>
                    <div className={cn('rounded-md border px-2 py-1.5 text-right', e.suggestedSide === 'DOWN' ? 'border-rose-500/40 bg-rose-500/15 text-rose-200' : 'border-rose-500/20 bg-rose-500/5 text-rose-200/60')}>
                      NO / DOWN
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] border-violet-500/35 text-violet-200">
                      Side: {e.suggestedSide}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-cyan-500/35 text-cyan-200">
                      {e.confidence}%
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-white/20 text-white/70 max-w-full truncate">
                      {e.reason}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="text-[10px] text-white/55">
                      Countdown: <span className="text-white/85 font-mono">{formatCountdown(e.countdownSec)}</span>
                    </div>
                    <EventSparkline points={decisionSeriesByMarket[e.marketKey]} />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        events: config.events.map((x) => x.marketKey === e.marketKey ? { ...x, enabled: !x.enabled } : x),
                      })}
                      disabled={isRuntimeStale}
                      className={cn(
                        'px-2.5 py-1 rounded-md border text-[11px] transition-colors disabled:opacity-50',
                        cfg?.enabled
                          ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/20 bg-white/[0.03] text-white/70'
                      )}
                    >
                      {cfg?.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        events: config.events.filter((x) => x.marketKey !== e.marketKey),
                      })}
                      disabled={isRuntimeStale}
                      className="px-2.5 py-1 rounded-md border border-rose-500/30 bg-rose-500/15 text-rose-200 text-[11px] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                  </>
                  )}
                </div>
              );
            })}
          </div>`;

const newEventCards = `<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(runtime.events || []).map((e) => {
              const cfg = config.events.find((x) => x.marketKey === e.marketKey);
              const v4 = v4ByKey.get(e.marketKey);
              const timeframe = formatTimeframe(cfg?.timeframeMinutes ?? 60);
              const isOpen = Boolean(e.activeBetId && e.countdownSec > 0);
              const isClosing = isOpen && e.countdownSec <= 120;
              const hasEdge = v4 && typeof v4.edge === 'number' && v4.edge >= 0.05;
              const edgePct = v4?.edge ? (v4.edge * 100).toFixed(1) : null;
              const kellyPct = v4?.kelly?.recommendedPct?.toFixed(1);
              const upOdds = v4?.pmOdds?.up;
              const downOdds = v4?.pmOdds?.down;
              const coin = e.symbol?.replace('/USDT', '') || '?';
              const coinColors: Record<string, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', XRP: '#23292F', BNB: '#F3BA2F' };
              const coinColor = coinColors[coin] || '#8B5CF6';
              const isV4 = e.reason?.includes('PM-V4');

              return (
                <div
                  key={e.marketKey}
                  className={cn(
                    'group relative rounded-2xl border p-4 transition-all duration-200',
                    isOpen
                      ? 'border-white/[0.15] bg-gradient-to-b from-white/[0.05] to-white/[0.02]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
                  )}
                >
                  {/* Header: coin + title + live indicator */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: coinColor + '30', border: '1.5px solid ' + coinColor + '60' }}
                      >
                        {coin.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-white/90 truncate">{e.label}</div>
                        <div className="text-[10px] text-white/40">{timeframe}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isOpen && (
                        <span className="flex items-center gap-1 text-[9px] font-medium">
                          <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', isClosing ? 'bg-amber-400' : 'bg-emerald-400')} />
                          <span className={isClosing ? 'text-amber-300' : 'text-emerald-300'}>{isClosing ? 'CLOSING' : 'LIVE'}</span>
                        </span>
                      )}
                      {isV4 && (
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">V4</span>
                      )}
                    </div>
                  </div>

                  {/* UP / DOWN odds buttons — Polymarket style */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      type="button"
                      className={cn(
                        'relative rounded-xl border px-3 py-2.5 text-center transition-all',
                        e.suggestedSide === 'UP'
                          ? 'border-emerald-500/50 bg-emerald-500/[0.12] shadow-[0_0_12px_rgba(16,185,129,0.08)]'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-emerald-500/25'
                      )}
                      onClick={() => {/* future: manual override */}}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-emerald-300/70 mb-0.5">Up</div>
                      <div className={cn('text-lg font-bold font-mono', e.suggestedSide === 'UP' ? 'text-emerald-300' : 'text-white/50')}>
                        {upOdds ? (upOdds * 100).toFixed(0) + '\u00A2' : '\u2014'}
                      </div>
                      {e.suggestedSide === 'UP' && hasEdge && (
                        <div className="text-[9px] text-emerald-400 font-medium mt-0.5">+{edgePct}% edge</div>
                      )}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'relative rounded-xl border px-3 py-2.5 text-center transition-all',
                        e.suggestedSide === 'DOWN'
                          ? 'border-rose-500/50 bg-rose-500/[0.12] shadow-[0_0_12px_rgba(244,63,94,0.08)]'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-rose-500/25'
                      )}
                      onClick={() => {/* future: manual override */}}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-rose-300/70 mb-0.5">Down</div>
                      <div className={cn('text-lg font-bold font-mono', e.suggestedSide === 'DOWN' ? 'text-rose-300' : 'text-white/50')}>
                        {downOdds ? (downOdds * 100).toFixed(0) + '\u00A2' : '\u2014'}
                      </div>
                      {e.suggestedSide === 'DOWN' && hasEdge && (
                        <div className="text-[9px] text-rose-400 font-medium mt-0.5">+{edgePct}% edge</div>
                      )}
                    </button>
                  </div>

                  {/* Edge + Kelly + Confidence bar */}
                  {v4 && (
                    <div className="space-y-2 mb-3">
                      {/* Edge bar */}
                      <div>
                        <div className="flex justify-between text-[9px] mb-1">
                          <span className="text-white/40">Edge</span>
                          <span className={hasEdge ? 'text-emerald-300 font-medium' : 'text-white/40'}>{edgePct ? edgePct + '%' : 'none'}</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500', hasEdge ? 'bg-emerald-500/70' : 'bg-white/10')}
                            style={{ width: Math.min(100, (v4.edge || 0) * 300) + '%' }}
                          />
                        </div>
                      </div>
                      {/* Meta row */}
                      <div className="flex items-center justify-between text-[9px] text-white/40">
                        <span>{kellyPct ? 'Kelly ' + kellyPct + '%' : ''}</span>
                        <span>conf {e.confidence}%</span>
                      </div>
                    </div>
                  )}

                  {/* Countdown + Sparkline */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    {isOpen && (
                      <div className="text-[10px] font-mono text-white/60">
                        T-{formatCountdown(e.countdownSec)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <EventSparkline points={decisionSeriesByMarket[e.marketKey]} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        events: config.events.map((x) => x.marketKey === e.marketKey ? { ...x, enabled: !x.enabled } : x),
                      })}
                      disabled={isRuntimeStale}
                      className={cn(
                        'flex-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-colors disabled:opacity-40',
                        cfg?.enabled
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                          : 'border-white/15 bg-white/[0.03] text-white/50 hover:text-white/70'
                      )}
                    >
                      {cfg?.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        events: config.events.filter((x) => x.marketKey !== e.marketKey),
                      })}
                      disabled={isRuntimeStale}
                      className="px-2 py-1.5 rounded-lg border border-rose-500/20 text-rose-300/60 text-[10px] hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                    >
                      \u2715
                    </button>
                  </div>
                </div>
              );
            })}
          </div>`;

if (src.includes('Event mapping + signal status') && src.includes('YES / UP')) {
  src = src.replace(oldEventCards, newEventCards);
  log(true, 'Replaced event cards with Polymarket-style design');
} else if (src.includes('YES / UP')) {
  // Try more targeted replacement
  log(false, 'Exact event cards match not found — trying targeted patches');
  
  // At minimum replace the grid-cols-3 with grid-cols-4
  if (src.includes('xl:grid-cols-3 gap-3')) {
    src = src.replace('xl:grid-cols-3 gap-3', 'xl:grid-cols-4 gap-3');
    log(true, 'Updated grid to 4 columns');
  }
} else {
  log(false, 'Could not find event cards to replace');
}

// 2e: Replace header title with regime indicator
const oldHeader = '<CardTitle className="text-sm text-white/90">Event mapping + signal status</CardTitle>';
const newHeader = `<div className="flex items-center gap-2">
              <CardTitle className="text-sm text-white/90">Markets</CardTitle>
              {v4Regime && (
                <span className={cn(
                  'text-[9px] font-semibold px-1.5 py-0.5 rounded-md border',
                  v4Regime === 'BULLISH' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' :
                  v4Regime === 'BEARISH' ? 'border-rose-500/40 bg-rose-500/15 text-rose-300' :
                  'border-white/20 bg-white/[0.04] text-white/60'
                )}>
                  {v4Regime}
                </span>
              )}
            </div>`;

if (src.includes(oldHeader)) {
  src = src.replace(oldHeader, newHeader);
  log(true, 'Updated header with regime indicator');
} else {
  log(false, 'Could not find header to update');
}

// Write final file
fs.writeFileSync(PANEL, src, 'utf-8');

// ═══════════════════════════════════════════
// VERIFY
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log(`✅ ${successes} patches applied`);
if (errors > 0) console.log(`❌ ${errors} patches failed`);

if (errors === 0) {
  console.log('\n🎨 Polymarket-style cards geïnstalleerd!');
  console.log('\nNext: herstart de V1 server om de changes te laden:');
  console.log('  → In het PowerShell venster van de server: Ctrl+C, dan npm run dev');
  console.log('\nNieuwe features:');
  console.log('  • Coin logo badges met kleur per crypto');
  console.log('  • Live PM odds als UP/DOWN knoppen (51¢/49¢ style)');
  console.log('  • Edge indicator balk + percentage');
  console.log('  • Kelly sizing info');
  console.log('  • V4 badge op scanner-driven signals');
  console.log('  • Regime indicator (BULLISH/BEARISH) in header');
  console.log('  • 4-kolommen grid op desktop');
}
