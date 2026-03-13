const fs = require('fs');
const f = process.env.USERPROFILE + '\\.openclaw\\workspace-boeboesh\\mission-control-dashboard\\components\\trading\\scalping-auto-trader.tsx';
let lines = fs.readFileSync(f, 'utf-8').split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('!activeSymbols.has(key)') && lines[i].includes('&&')) {
    lines[i] = '          !activeSymbols.has(key) &&';
    console.log('Fixed line ' + (i+1));
    break;
  }
}
fs.writeFileSync(f, lines.join('\n'));
console.log('Done');
