const fs = require('fs');
const f = process.env.USERPROFILE + '\\.openclaw\\workspace-boeboesh\\mission-control-dashboard\\scripts\\update-scanner-data.js';
let c = fs.readFileSync(f, 'utf-8');

// OLD: shortWindow checks k <= stochRsiOverboughtZone (80) AND k >= stochRsiShortMinK (55)
// NEW: k must be LOWER than prevK (confirming downward cross) AND k <= 85 (relaxed from 80)
c = c.replace('stochRsiLongMaxK: 45,', 'stochRsiLongMaxK: 45,');
c = c.replace('stochRsiShortMinK: 55,', 'stochRsiShortMinK: 50,');

// The actual signal logic - relax the SHORT window
// OLD: (prevK > overboughtZone) && (k <= overboughtZone && k >= shortMinK)
// NEW: (prevK > overboughtZone) && (k < prevK) && (k >= shortMinK)
c = c.replace(
  'const shortWindow = (prevK > SCALPING_PARAMS.stochRsiOverboughtZone) && (k <= SCALPING_PARAMS.stochRsiOverboughtZone && k >= SCALPING_PARAMS.stochRsiShortMinK);',
  'const shortWindow = (prevK > SCALPING_PARAMS.stochRsiOverboughtZone) && (k < prevK) && (k >= SCALPING_PARAMS.stochRsiShortMinK);'
);

// Same for LONG - relax: k must be HIGHER than prevK (confirming upward cross)
c = c.replace(
  'const longWindow = (prevK < SCALPING_PARAMS.stochRsiOversoldZone) && (k >= SCALPING_PARAMS.stochRsiOversoldZone && k <= SCALPING_PARAMS.stochRsiLongMaxK);',
  'const longWindow = (prevK < SCALPING_PARAMS.stochRsiOversoldZone) && (k > prevK) && (k <= SCALPING_PARAMS.stochRsiLongMaxK);'
);

fs.writeFileSync(f, c);
console.log('Scanner SHORT/LONG criteria relaxed');
