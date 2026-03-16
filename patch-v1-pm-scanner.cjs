#!/usr/bin/env node
/**
 * Patch V1 PM Bot to use v4 PM Scanner as primary signal source.
 * 
 * What this does:
 * 1. Patches v4 scanner to ALSO write to V1's public/ folder
 * 2. Adds readPMScannerFeed() to V1's pm-bot.ts
 * 3. Modifies readBybitFeed() to try PM scanner first
 * 4. Adds edge-gate to bet placement logic
 * 
 * Run from V1 root: node patch-v1-pm-scanner.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const V1_ROOT = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage';
const OLD_ROOT = 'C:\\Users\\bramb\\.openclaw\\workspace-boeboesh\\mission-control-dashboard';

const PM_BOT_FILE = path.join(V1_ROOT, 'lib', 'pm-bot.ts');
const V4_SCANNER_FILE = path.join(OLD_ROOT, 'scripts', 'pm-scanner-daemon-v4.cjs');

let errors = 0;

function backup(filePath) {
  const bak = filePath + '.backup-' + new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(filePath, bak);
    console.log(`  Backup: ${bak}`);
  }
}

function patchFile(filePath, patches) {
  let content = fs.readFileSync(filePath, 'utf-8');
  for (const p of patches) {
    if (p.find && content.includes(p.find)) {
      content = content.replace(p.find, p.replace);
      console.log(`  ✅ ${p.label}`);
    } else if (p.find) {
      console.error(`  ❌ NOT FOUND: ${p.label}`);
      console.error(`     Looking for: "${p.find.slice(0, 80)}..."`);
      errors++;
    }
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return content;
}

// ═══════════════════════════════════════════════════════════
// PATCH 1: v4 scanner — also write to V1's public folder
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 1: v4 scanner dual-output');
backup(V4_SCANNER_FILE);

let v4Content = fs.readFileSync(V4_SCANNER_FILE, 'utf-8');

// Check if already patched
if (v4Content.includes('V1_OUTPUT_FILE')) {
  console.log('  ⏭️  Already patched (V1_OUTPUT_FILE exists)');
} else {
  // Add V1 output path after the existing OUTPUT_FILE line
  const oldLine = "const OUTPUT_FILE = join(__dirname, '..', 'public', 'pm-signals.json');";
  const newLines = `const OUTPUT_FILE = join(__dirname, '..', 'public', 'pm-signals.json');
const V1_OUTPUT_FILE = 'C:\\\\Users\\\\bramb\\\\.openclaw\\\\workspace\\\\tmp\\\\pm-export-stage\\\\public\\\\pm-signals.json';`;

  if (v4Content.includes(oldLine)) {
    v4Content = v4Content.replace(oldLine, newLines);
    console.log('  ✅ Added V1_OUTPUT_FILE path');
  } else {
    console.error('  ❌ Could not find OUTPUT_FILE line');
    errors++;
  }

  // Add V1 write after the existing write block
  // Find the pattern where output is written
  const writePattern = `catch { writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8'); try { fs.unlinkSync(tmpFile); } catch {} }`;
  const writeReplacement = `catch { writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8'); try { fs.unlinkSync(tmpFile); } catch {} }

    // Also write to V1 dashboard
    try { writeFileSync(V1_OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8'); }
    catch (e) { /* V1 write failed, non-fatal */ }`;

  if (v4Content.includes(writePattern)) {
    v4Content = v4Content.replace(writePattern, writeReplacement);
    console.log('  ✅ Added V1 dual-write');
  } else {
    console.error('  ❌ Could not find write pattern');
    errors++;
  }

  fs.writeFileSync(V4_SCANNER_FILE, v4Content, 'utf-8');
}

// ═══════════════════════════════════════════════════════════
// PATCH 2: V1 pm-bot.ts — add PM scanner integration
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 2: V1 pm-bot.ts — PM Scanner integration');
backup(PM_BOT_FILE);

let pmBot = fs.readFileSync(PM_BOT_FILE, 'utf-8');

// Check if already patched
if (pmBot.includes('readPMScannerFeed')) {
  console.log('  ⏭️  Already patched (readPMScannerFeed exists)');
} else {

  // 2a: Add PM_SIGNALS_FILE constant after BYBIT_FEED_FILE
  const feedFileRef = "const BYBIT_FEED_FILE = join(process.cwd(), 'public', 'v2-scalp-signals.json');";
  const feedFileNew = `const BYBIT_FEED_FILE = join(process.cwd(), 'public', 'v2-scalp-signals.json');
const PM_SIGNALS_FILE = join(process.cwd(), 'public', 'pm-signals.json');`;

  if (pmBot.includes(feedFileRef)) {
    pmBot = pmBot.replace(feedFileRef, feedFileNew);
    console.log('  ✅ Added PM_SIGNALS_FILE constant');
  } else {
    console.error('  ❌ Could not find BYBIT_FEED_FILE line');
    errors++;
  }

  // 2b: Add PMScannerSignal + PMScannerFeed interfaces + readPMScannerFeed function
  // Insert before readBybitFeed
  const readBybitFeedLine = 'async function readBybitFeed(): Promise<BybitFeed> {';
  const pmScannerCode = `// ── PM Scanner v4 integration ──────────────────────────────────
interface PMScannerSignal {
  event: string;
  symbol: string;
  marketKey: string;
  timeframeMinutes: number;
  side: 'UP' | 'DOWN' | null;
  confidence: number;
  reason: string;
  skipTrade: boolean;
  skipReason?: string;
  edge?: number;
  pmOdds?: { up: number; down: number };
  kelly?: { fullKellyPct: number; recommendedPct: number; edge: number; worthBetting: boolean };
  oraclePrice?: number;
  bybitPrice?: number;
  priceGap?: { usd: number; percent?: number };
  timeToSettle?: number;
  trend?: string;
  momentum?: number;
  volatility?: number;
  velocity?: { direction: string; strength: number; projected: number };
  flashCrash?: any;
}

interface PMScannerFeed {
  timestamp: string;
  version: string;
  regime: string;
  regimeConfidence: number;
  oracleSource: string;
  signals: PMScannerSignal[];
  scanDurationMs: number;
}

async function readPMScannerFeed(): Promise<BybitFeed | null> {
  try {
    const raw = await readFile(PM_SIGNALS_FILE, 'utf-8');
    const feed = JSON.parse(raw) as PMScannerFeed;

    // Check freshness: max 60 seconds old
    const age = Date.now() - new Date(feed.timestamp).getTime();
    if (age > 60_000 || !feed.signals?.length) return null;

    console.log(\`[PM Bot] Using PM Scanner v4 (age: \${Math.round(age / 1000)}s, \${feed.signals.length} signals, regime: \${feed.regime})\`);

    const prices: Record<string, number> = {};
    const bestByPair = new Map<string, BybitSignal>();

    for (const sig of feed.signals) {
      // Track prices (oracle preferred)
      if (!prices[sig.symbol]) {
        prices[sig.symbol] = sig.oraclePrice || sig.bybitPrice || 0;
      }

      // Skip filtered signals or null side
      if (sig.skipTrade || !sig.side) continue;

      // Only take signals with positive edge
      if (typeof sig.edge === 'number' && sig.edge < 0.05) continue;

      const mapped: BybitSignal = {
        pair: sig.symbol,
        signal: sig.side === 'UP' ? 'LONG' as const : 'SHORT' as const,
        confidence: sig.confidence,
        reason: \`PM-V4: edge=\${sig.edge ? (sig.edge * 100).toFixed(1) : '?'}% | \${sig.reason}\`,
        indicators: {
          price: sig.oraclePrice || sig.bybitPrice || 0,
          emaTrend: sig.bybitPrice || 0,
          atrPercent: sig.volatility || 0.2,
          stochK: 50 + (sig.momentum || 0) / 2,
          stochD: 50,
        },
      };

      const existing = bestByPair.get(sig.symbol);
      if (!existing || (mapped.confidence ?? 0) > (existing.confidence ?? 0)) {
        bestByPair.set(sig.symbol, mapped);
      }
    }

    // Must have at least 1 actionable signal
    if (bestByPair.size === 0) {
      console.log('[PM Bot] PM Scanner v4: no actionable signals (all skipped/no-edge)');
      return null;
    }

    return {
      timestamp: feed.timestamp,
      prices,
      signals: [...bestByPair.values()],
    };
  } catch (err) {
    console.error('[PM Bot] readPMScannerFeed FAILED:', err instanceof Error ? err.message : err);
    return null;
  }
}

` + readBybitFeedLine;

  if (pmBot.includes(readBybitFeedLine)) {
    pmBot = pmBot.replace(readBybitFeedLine, pmScannerCode);
    console.log('  ✅ Added PMScannerFeed interfaces + readPMScannerFeed()');
  } else {
    console.error('  ❌ Could not find readBybitFeed function');
    errors++;
  }

  // 2c: Modify readBybitFeed to try PM scanner first
  const oldReadBybit = `async function readBybitFeed(): Promise<BybitFeed> {
  try {
    // Ensure the V2 scanner producer is alive whenever PM bot reads feed state.
    ensureV2ScannerRunning();
  } catch {
    // non-fatal; we'll still try to read latest file snapshot
  }

  try {
    return JSON.parse(await readFile(BYBIT_FEED_FILE, 'utf-8')) as BybitFeed;
  } catch {
    return { prices: {}, signals: [] };
  }
}`;

  const newReadBybit = `async function readBybitFeed(): Promise<BybitFeed> {
  // 1. PRIMARY: Try PM Scanner v4 (edge-based, Polymarket-native)
  const pmFeed = await readPMScannerFeed();
  if (pmFeed) return pmFeed;

  // 2. FALLBACK: Bybit scalp signals
  try {
    ensureV2ScannerRunning();
  } catch {
    // non-fatal
  }

  try {
    console.log('[PM Bot] Fallback: Using Bybit v2-scalp-signals');
    return JSON.parse(await readFile(BYBIT_FEED_FILE, 'utf-8')) as BybitFeed;
  } catch {
    return { prices: {}, signals: [] };
  }
}`;

  if (pmBot.includes(oldReadBybit)) {
    pmBot = pmBot.replace(oldReadBybit, newReadBybit);
    console.log('  ✅ Modified readBybitFeed() to try PM Scanner first');
  } else {
    console.error('  ❌ Could not find exact readBybitFeed body');
    console.log('     Trying partial match...');
    
    // Try a simpler replacement - just the inner body
    const simpleOld = `    return JSON.parse(await readFile(BYBIT_FEED_FILE, 'utf-8')) as BybitFeed;
  } catch {
    return { prices: {}, signals: [] };
  }
}`;
    const simpleNew = `    console.log('[PM Bot] Fallback: Using Bybit v2-scalp-signals');
    return JSON.parse(await readFile(BYBIT_FEED_FILE, 'utf-8')) as BybitFeed;
  } catch {
    return { prices: {}, signals: [] };
  }
}`;
    // Also need to add PM scanner call at top of function
    const funcStart = 'async function readBybitFeed(): Promise<BybitFeed> {';
    const funcStartNew = `async function readBybitFeed(): Promise<BybitFeed> {
  // PRIMARY: Try PM Scanner v4
  const pmFeed = await readPMScannerFeed();
  if (pmFeed) return pmFeed;
`;
    if (pmBot.includes(funcStart) && pmBot.includes(simpleOld)) {
      pmBot = pmBot.replace(funcStart, funcStartNew);
      pmBot = pmBot.replace(simpleOld, simpleNew);
      console.log('  ✅ Partial match: modified readBybitFeed()');
    } else {
      console.error('  ❌ Could not patch readBybitFeed - manual edit needed');
      errors++;
    }
  }

  fs.writeFileSync(PM_BOT_FILE, pmBot, 'utf-8');
}

// ═══════════════════════════════════════════════════════════
// PATCH 3: Initial copy of pm-signals.json to V1
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 3: Copy pm-signals.json to V1');
const srcSignals = path.join(OLD_ROOT, 'public', 'pm-signals.json');
const dstSignals = path.join(V1_ROOT, 'public', 'pm-signals.json');
if (fs.existsSync(srcSignals)) {
  fs.copyFileSync(srcSignals, dstSignals);
  const check = JSON.parse(fs.readFileSync(dstSignals, 'utf-8'));
  console.log(`  ✅ Copied: version=${check.version}, signals=${check.signals?.length || 0}`);
} else {
  console.error('  ❌ Source pm-signals.json not found');
  errors++;
}

// ═══════════════════════════════════════════════════════════
// VERIFY
// ═══════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
if (errors === 0) {
  console.log('✅ ALL PATCHES APPLIED SUCCESSFULLY');
  console.log('\nNext steps:');
  console.log('  1. Restart v4 scanner:');
  console.log('     Get-WmiObject Win32_Process -Filter "name=\'node.exe\'" | Where-Object { $_.CommandLine -match "pm-scanner-daemon-v4" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }');
  console.log('     cd ' + OLD_ROOT);
  console.log('     Start-Process node -ArgumentList "scripts\\pm-scanner-daemon-v4.cjs" -WindowStyle Hidden');
  console.log('');
  console.log('  2. Restart V1 server (in its PowerShell window):');
  console.log('     Ctrl+C then: npm run dev');
  console.log('');
  console.log('  3. Verify:');
  console.log('     Invoke-RestMethod -Uri "http://localhost:3000/api/pm-bot/decisions" | Select -First 3 | ConvertTo-Json');
  console.log('     → Should show source: "PM-V4" in reason');
} else {
  console.log(`❌ ${errors} PATCH(ES) FAILED — check errors above`);
}
