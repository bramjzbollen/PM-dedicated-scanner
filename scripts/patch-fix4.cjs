const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'lib', 'use-trading-engine.ts');
let lines = fs.readFileSync(file, 'utf-8').split('\n');

// Find the exact broken line: "      }" followed by empty line then "      // Clean expired"
let targetIdx = -1;
for (let i = 580; i < 600; i++) {
  if (lines[i] && lines[i].trimEnd() === '      }' && 
      lines[i+2] && lines[i+2].includes('Clean expired')) {
    targetIdx = i;
    break;
  }
}

if (targetIdx === -1) { console.log('NOT FOUND, dumping lines 585-595:'); for(let i=585;i<595;i++) console.log(i+': ['+lines[i]+']'); process.exit(1); }

console.log('Found at line ' + (targetIdx + 1));

const fix = [
  '            setStats(s => ({ ...s, totalTrades: s.totalTrades + 1 }));',
  '          } else if (cfg.queueEnabled && currentQueue.length < maxQueue) {',
  '            pendingSymbols.add(symbol);',
  '            const livePrice = pricesRef.current[symbol] || sig.price;',
  '            const qi = {',
  '              id: genId(),',
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
  '      }',
];

const before = lines.slice(0, targetIdx);
const after = lines.slice(targetIdx + 2); // remove the broken "}" and empty line
const result = [...before, ...fix, ...after].join('\n');
fs.writeFileSync(file, result);
console.log('Fixed!');
