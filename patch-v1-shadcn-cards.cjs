#!/usr/bin/env node
/**
 * Install PMEventCard component and patch pm-bot-panel.tsx
 * Uses line-number based replacement to avoid unicode matching issues.
 */

const fs = require('node:fs');
const path = require('node:path');

const V1 = 'C:\\Users\\bramb\\.openclaw\\workspace\\tmp\\pm-export-stage';
const PANEL = path.join(V1, 'components', 'trading', 'pm-bot-panel.tsx');
const CARD_SRC = path.join(V1, 'components', 'trading', 'pm-event-card.tsx');

// ═══════════════════════════════════════════
// STEP 1: Verify pm-event-card.tsx exists
// ═══════════════════════════════════════════
console.log('\n🔧 STEP 1: Check pm-event-card.tsx');
if (!fs.existsSync(CARD_SRC)) {
  console.error('  ❌ pm-event-card.tsx not found! Copy it first.');
  process.exit(1);
}
console.log('  ✅ pm-event-card.tsx found');

// ═══════════════════════════════════════════
// STEP 2: Backup panel
// ═══════════════════════════════════════════
console.log('\n🔧 STEP 2: Backup');
const bak = PANEL + '.pre-shadcn-' + Date.now();
fs.copyFileSync(PANEL, bak);
console.log('  ✅ Backup created');

// ═══════════════════════════════════════════
// STEP 3: Patch pm-bot-panel.tsx
// ═══════════════════════════════════════════
console.log('\n🔧 STEP 3: Patch panel');

let lines = fs.readFileSync(PANEL, 'utf-8').split('\n');

// 3a: Add import for PMEventCard (after last import)
const lastImportIdx = lines.reduce((acc, line, i) => line.startsWith('import ') ? i : acc, 0);
if (!lines.some(l => l.includes('PMEventCard'))) {
  lines.splice(lastImportIdx + 1, 0, "import { PMEventCard } from './pm-event-card';");
  console.log('  ✅ Added PMEventCard import at line ' + (lastImportIdx + 2));
} else {
  console.log('  ⏭️  PMEventCard import already exists');
}

// Re-read to get updated line numbers
let src = lines.join('\n');
lines = src.split('\n');

// 3b: Find the event cards section by looking for the markers
// Start: line containing "Event mapping + signal status" or our "Markets" replacement
// The grid starts after: <div className="grid grid-cols-
// End: the closing </div> of the grid after all event cards

let gridStartLine = -1;
let gridEndLine = -1;
let braceDepth = 0;

// Find the grid div that contains the event cards
for (let i = 0; i < lines.length; i++) {
  // Look for the grid that contains event.map
  if (lines[i].includes('grid grid-cols-') && i + 1 < lines.length && lines[i + 1].includes('runtime.events')) {
    gridStartLine = i;
    break;
  }
}

if (gridStartLine === -1) {
  console.error('  ❌ Could not find event cards grid');
  process.exit(1);
}

console.log('  Found event cards grid at line ' + (gridStartLine + 1));

// Now find the matching closing </div> for the grid
// Count JSX depth from gridStartLine
let depth = 0;
for (let i = gridStartLine; i < lines.length; i++) {
  const line = lines[i];
  // Count opening tags/braces
  const opens = (line.match(/<div/g) || []).length + (line.match(/\{/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length + (line.match(/\}/g) || []).length;
  depth += opens - closes;
  
  if (depth <= 0 && i > gridStartLine) {
    gridEndLine = i;
    break;
  }
}

if (gridEndLine === -1) {
  // Fallback: find by looking for the closing pattern
  for (let i = gridStartLine + 5; i < lines.length; i++) {
    if (lines[i].trim() === '</div>' || lines[i].includes('</CardContent>')) {
      // Check if the previous non-empty lines close the map
      const prevLines = lines.slice(Math.max(gridStartLine, i - 5), i).join('');
      if (prevLines.includes('})}')) {
        gridEndLine = i - 1;
        // Find the actual </div> that closes the grid
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          if (lines[j].includes('</div>')) {
            gridEndLine = j;
            break;
          }
        }
        break;
      }
    }
  }
}

if (gridEndLine === -1) {
  console.error('  ❌ Could not find end of event cards grid');
  process.exit(1);
}

console.log('  Event cards span lines ' + (gridStartLine + 1) + ' to ' + (gridEndLine + 1));
console.log('  Replacing ' + (gridEndLine - gridStartLine + 1) + ' lines');

// 3c: Build replacement
const replacement = `          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(runtime.events || []).map((e) => {
              const cfg = config.events.find((x) => x.marketKey === e.marketKey);
              const v4 = v4ByKey.get(e.marketKey);
              const timeframe = formatTimeframe(cfg?.timeframeMinutes ?? 60);
              return (
                <PMEventCard
                  key={e.marketKey}
                  event={e}
                  v4={v4}
                  enabled={cfg?.enabled ?? false}
                  stale={isRuntimeStale}
                  timeframe={timeframe}
                  sparkline={<EventSparkline points={decisionSeriesByMarket[e.marketKey]} />}
                  onToggle={() => setConfig({
                    ...config,
                    events: config.events.map((x) => x.marketKey === e.marketKey ? { ...x, enabled: !x.enabled } : x),
                  })}
                  onRemove={() => setConfig({
                    ...config,
                    events: config.events.filter((x) => x.marketKey !== e.marketKey),
                  })}
                />
              );
            })}
          </div>`;

// Replace the lines
const before = lines.slice(0, gridStartLine);
const after = lines.slice(gridEndLine + 1);
const newLines = [...before, ...replacement.split('\n'), ...after];

fs.writeFileSync(PANEL, newLines.join('\n'), 'utf-8');
console.log('  ✅ Replaced event cards with PMEventCard component');

// ═══════════════════════════════════════════
// VERIFY
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
const final = fs.readFileSync(PANEL, 'utf-8');
const checks = [
  ['PMEventCard import', final.includes("import { PMEventCard }")],
  ['PMEventCard usage', final.includes('<PMEventCard')],
  ['v4ByKey reference', final.includes('v4ByKey.get')],
  ['No old YES/UP', !final.includes('YES / UP')],
  ['Grid cols 4', final.includes('xl:grid-cols-4')],
];

let ok = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}

if (ok) {
  console.log('\n🎨 Polymarket-style cards installed!');
  console.log('   Herstart de server: Ctrl+C → npm run dev');
} else {
  console.log('\n⚠️  Some checks failed — review manually');
  console.log('   Restore: copy ' + path.basename(bak));
}
