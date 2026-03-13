const fs = require('fs');
const path = require('path');
const base = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'components', 'trading');
['scalping-auto-trader.tsx', 'swing-auto-trader.tsx'].forEach(fn => {
  const f = path.join(base, fn);
  let c = fs.readFileSync(f, 'utf-8');
  if (c.includes('sig.price > 0')) { console.log(fn + ': already filtered'); return; }
  c = c.replace(
    /!activeSymbols\.has\(key\)\n\s*\);/,
    '!activeSymbols.has(key) &&\n            (sig.price > 0 || sig.indicators?.price > 0)\n        );'
  );
  fs.writeFileSync(f, c);
  console.log(fn + ': price filter added');
});
