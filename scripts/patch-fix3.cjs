const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'lib', 'use-trading-engine.ts');
let lines = fs.readFileSync(file, 'utf-8').split('\n');

// Find line 588 "      }" and replace from there to "      // Clean expired"
const forEachEndSearch = lines.findIndex((l, i) => i > 570 && l.trim() === '}' && lines[i+1] && lines[i+1].trim() === '' && lines[i+2] && lines[i+2].includes('Clean expired'));

if (forEachEndSearch === -1) { console.log('NOT FOUND'); process.exit(1); }

console.log('Found bad block at line ' + (forEachEndSearch + 1));

// We need to replace line 588 with the proper closing
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
  '',
];

const before = lines.slice(0, forEachEndSearch);
const after = lines.slice(forEachEndSearch + 2); // skip the bad "}" and empty line
const result = [...before, ...fix, ...after].join('\n');
fs.writeFileSync(file, result);
console.log('Fixed!');
