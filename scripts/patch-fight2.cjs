const fs = require('fs');
const path = require('path');
const f = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'components', 'trading', 'scalping-auto-trader.tsx');
let c = fs.readFileSync(f, 'utf-8');
const old = "!activeSymbols.has(key)\n        );";
const rep = "!activeSymbols.has(key) &&\n          (sig.price > 0 || sig.indicators?.price > 0)\n        );";
if (c.includes(old)) {
  c = c.replace(old, rep);
  fs.writeFileSync(f, c);
  console.log('Fixed');
} else {
  console.log('Not found, trying alt...');
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('!activeSymbols.has(key)') && lines[i+1] && lines[i+1].trim() === ');') {
      lines[i] = lines[i] + ' &&';
      lines.splice(i+1, 0, '          (sig.price > 0 || sig.indicators?.price > 0)');
      fs.writeFileSync(f, lines.join('\n'));
      console.log('Fixed via line insert at ' + (i+1));
      break;
    }
  }
}
