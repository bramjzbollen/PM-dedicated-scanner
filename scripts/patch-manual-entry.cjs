const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'lib', 'use-trading-engine.ts');
let lines = fs.readFileSync(file, 'utf-8').split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("const price = pricesRef.current[symbolKey(signal)]")) {
    lines[i] = "    const price = pricesRef.current[symbol] || pricesRef.current[symbolKey(signal)] || signal.price || signal.indicators?.price || 0;";
    console.log('Fixed price lookup at line ' + (i+1));
  }
  if (lines[i].includes("if (!symbol || symbol ===") && lines[i].includes("price <= 0") && i > 335 && i < 350) {
    lines[i] = "    if (!symbol) return;";
    lines.splice(i+1, 0, "    const livePrice = price > 0 ? price : (pricesRef.current[symbol] || 0);");
    lines.splice(i+2, 0, "    if (livePrice <= 0) { console.warn('[manual] No price for', symbol); return; }");
    for (let j = i+3; j < i+10; j++) {
      if (lines[j] && lines[j].includes('createPosition(symbol,')) {
        lines[j] = lines[j].replace('price, cfg', 'livePrice, cfg');
        break;
      }
    }
    console.log('Fixed entry at line ' + (i+1));
    break;
  }
}
fs.writeFileSync(file, lines.join('\n'));
console.log('Done');
