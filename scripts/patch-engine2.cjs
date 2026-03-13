const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'lib', 'use-trading-engine.ts');
let lines = fs.readFileSync(file, 'utf-8').split('\n');

// Find the pendingSymbols line and the closing of the forEach
const startIdx = lines.findIndex(l => l.includes('const pendingSymbols'));
if (startIdx === -1) { console.log('NOT FOUND: pendingSymbols'); process.exit(1); }

// Find the end: "        });" that closes validSignals.forEach
let endIdx = -1;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].trim() === '});' && lines[i].startsWith('        ')) {
    endIdx = i;
    break;
  }
}
if (endIdx === -1) { console.log('NOT FOUND: end of forEach'); process.exit(1); }

console.log('Replacing lines ' + (startIdx+1) + ' to ' + (endIdx+1));

const patch = [
  '        const pendingSymbols = new Set<string>();',
  '        validSignals.forEach(sig => {',
  '          const symbol = symbolKey(sig);',
  "          if (symbol === '\\u2014' || sig.price <= 0) return;",
  '          if (pendingSymbols.has(symbol)) return;',
  '          const openCount2 = posRef.current.length + pendingSymbols.size;',
  '',
  '          if (openCount2 < cfg.maxPositions) {',
  '            const livePrice = pricesRef.current[symbol] || sig.price;',
  "            const newPos = createPosition(symbol, sig.signal as 'LONG' | 'SHORT', livePrice, cfg, isSwing);",
  '            pendingSymbols.add(symbol);',
  '            setPositions(prev => {',
  '              if (prev.some(p => p.symbol === symbol) || prev.length >= cfg.maxPositions) return prev;',
  '              return [...prev, newPos];',
  '            });',
  '            setStats(s => ({ ...s, totalTrades: s.totalTrades + 1 }));',
  '          } else if (cfg.queueEnabled && currentQueue.length < maxQueue) {',
  '            pendingSymbols.add(symbol);',
  '            const livePrice = pricesRef.current[symbol] || sig.price;',
  '            const qi = {',
  "              id: genId(),",
  '              symbol,',
  "              direction: sig.signal as 'LONG' | 'SHORT',",
  '              confidence: sig.confidence,',
  '              reason: sig.reason,',
  '              price: livePrice,',
  '              queuedAt: new Date().toISOString(),',
  '            };',
  '            setQueue(prev => {',
  '              if (prev.length >= maxQueue) return prev;',
  '              return [...prev, qi];',
  '            });',
  '          }',
  '        });',
];

const before = lines.slice(0, startIdx);
const after = lines.slice(endIdx + 1);
const result = [...before, ...patch, ...after].join('\n');
fs.writeFileSync(file, result);
console.log('Fixed! Lines ' + (startIdx+1) + '-' + (endIdx+1) + ' replaced with clean version');
