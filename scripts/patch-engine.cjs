const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'lib', 'use-trading-engine.ts');
let lines = fs.readFileSync(file, 'utf-8').split('\n');

const idx = lines.findIndex(l => l.includes('validSignals.forEach(sig =>'));
if (idx === -1) { console.log('NOT FOUND'); process.exit(1); }

if (lines.some(l => l.includes('pendingSymbols'))) {
  console.log('Already patched');
  process.exit(0);
}

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
];

const before = lines.slice(0, idx);
const after = lines.slice(idx + 13);
const result = [...before, ...patch, ...after].join('\n');
fs.writeFileSync(file, result);
console.log('Patched at line ' + (idx + 1));
