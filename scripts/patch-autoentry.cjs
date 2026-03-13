const fs = require('fs');
const file = process.env.USERPROFILE + '\\.openclaw\\workspace-boeboesh\\mission-control-dashboard\\lib\\use-trading-engine.ts';
let lines = fs.readFileSync(file, 'utf-8').split('\n');
let fixes = 0;

for (let i = 0; i < lines.length; i++) {
  // Fix 1: In auto-entry, don't filter on sig.price <= 0, use live price instead
  if (lines[i].includes("if (symbol === '\\u2014' || sig.price <= 0) return;") && i > 570 && i < 590) {
    lines[i] = "          if (symbol === '\\u2014') return;";
    fixes++;
    console.log('Fix 1: Removed sig.price check at line ' + (i+1));
  }
  // Fix 2: Use live price in auto-entry createPosition
  if (lines[i].includes('const livePrice = pricesRef.current[symbol] || sig.price;') && i > 570 && i < 590) {
    lines[i] = "            const livePrice = pricesRef.current[symbol] || sig.price || sig.indicators?.price || 0;";
    // Add price check after
    lines.splice(i+1, 0, "            if (livePrice <= 0) return;");
    fixes++;
    console.log('Fix 2: Added live price fallback at line ' + (i+1));
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Done, ' + fixes + ' fixes applied');
