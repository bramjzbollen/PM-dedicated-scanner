/**
 * PM Confidence Calibration Script
 * 
 * Analyzes actual PM bot bet history to calculate real win rates per
 * confidence bucket. Generates calibration multipliers that align
 * scanner confidence scores with actual win probability.
 * 
 * Usage: node scripts/calibrate-pm-confidence.cjs [--bets-file path]
 * 
 * Reads: pm-bot-paper-bets.json (from trade-state or public dir)
 * Writes: public/pm-confidence-calibration.json
 */

const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

// ─── Config ───

const OUTPUT_FILE = join(__dirname, '..', 'public', 'pm-confidence-calibration.json');

// Search paths for bets file (in order of preference)
const BETS_SEARCH_PATHS = [
  join(__dirname, '..', '..', 'trade-state', 'pm-bot-paper-bets.json'),         // boeboesh workspace
  join(__dirname, '..', 'public', 'pm-bot-paper-bets.json'),                     // public dir
  join(process.cwd(), '..', 'trade-state', 'pm-bot-paper-bets.json'),           // relative to cwd
  // Also check the main workspace trade-state (larger dataset)
  join(__dirname, '..', '..', '..', 'workspace', 'tmp', 'trade-state', 'pm-bot-paper-bets.json'),
];

const BUCKET_SIZE = 5;
const MIN_BUCKET_SAMPLES = 3; // Minimum bets per bucket to generate a multiplier

// ─── Main ───

function findBetsFile() {
  // Check CLI arg first
  const argIdx = process.argv.indexOf('--bets-file');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    const f = process.argv[argIdx + 1];
    if (existsSync(f)) return f;
    console.error(`[CALIBRATE] Specified bets file not found: ${f}`);
    process.exit(1);
  }

  // Search default paths
  for (const p of BETS_SEARCH_PATHS) {
    if (existsSync(p)) {
      console.log(`[CALIBRATE] Found bets file: ${p}`);
      return p;
    }
  }
  return null;
}

function loadBets(filePath) {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  // Filter to closed/settled bets only
  return raw.filter(b => b.status === 'closed' && b.exit && b.confidence);
}

function bucketKey(conf) {
  const bucket = Math.floor(conf / BUCKET_SIZE) * BUCKET_SIZE;
  return `${bucket}-${bucket + BUCKET_SIZE}`;
}

function calibrate(bets) {
  // Group by confidence bucket
  const buckets = {};
  
  for (const bet of bets) {
    const key = bucketKey(bet.confidence);
    if (!buckets[key]) buckets[key] = { wins: 0, losses: 0, total: 0, bets: [] };
    buckets[key].total++;
    if (bet.exit === 'WIN') buckets[key].wins++;
    else buckets[key].losses++;
    buckets[key].bets.push({
      id: bet.id,
      confidence: bet.confidence,
      side: bet.side,
      exit: bet.exit,
      pair: bet.pair,
      pnlUsd: bet.pnlUsd,
    });
  }

  // Calculate calibration multipliers
  const calibration = {};
  const sortedKeys = Object.keys(buckets).sort((a, b) => parseInt(a) - parseInt(b));

  for (const key of sortedKeys) {
    const b = buckets[key];
    const actualWR = b.total > 0 ? b.wins / b.total : 0;
    const bucketMid = parseInt(key.split('-')[0]) + BUCKET_SIZE / 2;
    const expectedWR = bucketMid / 100; // confidence should = win probability
    
    // Multiplier: how much to adjust confidence so it matches actual WR
    // If actual WR is 45% but confidence bucket is 70-75 (mid=72.5), 
    // multiplier = 0.45 / 0.725 ≈ 0.62
    let multiplier = 1.0;
    if (b.total >= MIN_BUCKET_SAMPLES && expectedWR > 0) {
      multiplier = Number((actualWR / expectedWR).toFixed(3));
      // Clamp multiplier to reasonable range
      multiplier = Math.max(0.5, Math.min(1.5, multiplier));
    }

    calibration[key] = {
      actualWR: Number(actualWR.toFixed(3)),
      expectedWR: Number(expectedWR.toFixed(3)),
      multiplier,
      wins: b.wins,
      losses: b.losses,
      total: b.total,
      reliable: b.total >= MIN_BUCKET_SAMPLES,
    };
  }

  return calibration;
}

function generateReport(calibration, totalBets) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           PM CONFIDENCE CALIBRATION REPORT                  ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total settled bets analyzed: ${String(totalBets).padStart(4)}                        ║`);
  console.log('╠══════════════╦════════╦════════╦══════════╦═════════════════╣');
  console.log('║   Bucket     ║ Actual ║ Expect ║ Multipl. ║ Samples (W/L)   ║');
  console.log('╠══════════════╬════════╬════════╬══════════╬═════════════════╣');

  for (const [key, data] of Object.entries(calibration).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const reliable = data.reliable ? ' ' : '⚠';
    const actualStr = (data.actualWR * 100).toFixed(1).padStart(5) + '%';
    const expectStr = (data.expectedWR * 100).toFixed(1).padStart(5) + '%';
    const multStr = data.multiplier.toFixed(3).padStart(6);
    const sampStr = `${data.total} (${data.wins}W/${data.losses}L)`.padEnd(14);
    console.log(`║  ${key.padEnd(11)}║ ${actualStr} ║ ${expectStr} ║  ${multStr}  ║ ${sampStr}${reliable}║`);
  }

  console.log('╚══════════════╩════════╩════════╩══════════╩═════════════════╝');
  
  // Key insights
  console.log('\n📊 Key Insights:');
  for (const [key, data] of Object.entries(calibration)) {
    if (!data.reliable) continue;
    if (data.multiplier < 0.85) {
      console.log(`  ⚠️  ${key}%: Overconfident! Actual WR ${(data.actualWR*100).toFixed(1)}% vs expected ${(data.expectedWR*100).toFixed(1)}% → multiply by ${data.multiplier}`);
    } else if (data.multiplier > 1.15) {
      console.log(`  ✅ ${key}%: Underconfident. Actual WR ${(data.actualWR*100).toFixed(1)}% is better than expected → multiply by ${data.multiplier}`);
    }
  }
}

// ─── Run ───

function main() {
  console.log('[CALIBRATE] PM Confidence Calibration Script v1.0');
  
  const betsFile = findBetsFile();
  if (!betsFile) {
    console.error('[CALIBRATE] No bets file found! Searched paths:');
    BETS_SEARCH_PATHS.forEach(p => console.error(`  - ${p}`));
    console.error('\nUse --bets-file <path> to specify manually.');
    process.exit(1);
  }

  const bets = loadBets(betsFile);
  console.log(`[CALIBRATE] Loaded ${bets.length} settled bets from ${betsFile}`);

  if (bets.length < 10) {
    console.warn('[CALIBRATE] ⚠️ Warning: Less than 10 settled bets. Calibration may be unreliable.');
  }

  const calibration = calibrate(bets);
  generateReport(calibration, bets.length);

  // Write output
  const output = {
    calibration,
    sampleSize: bets.length,
    sourceFile: betsFile,
    generatedAt: new Date().toISOString(),
    version: '1.0',
    note: 'Multipliers adjust raw scanner confidence to align with actual win probability',
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n[CALIBRATE] ✅ Calibration written to: ${OUTPUT_FILE}`);
}

main();
