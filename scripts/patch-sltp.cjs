const fs = require('fs');
const f = process.env.USERPROFILE + '\\.openclaw\\workspace-boeboesh\\mission-control-dashboard\\lib\\trading-engine.ts';
let c = fs.readFileSync(f, 'utf-8');

// Replace SL/TP calc in createPosition with dynamic version
const oldSL = "const slMultiplier = direction === 'LONG' ? (1 - config.stopLossPercent / 100) : (1 + config.stopLossPercent / 100);";
const oldTP = "const tpMultiplier = direction === 'LONG' ? (1 + config.takeProfitPercent / 100) : (1 - config.takeProfitPercent / 100);";

const newSL = `const effectiveExposure = config.positionSize * config.leverage;
  // Scalping targets: SL $4.40 (incl fees), TP $5.40 (incl fees)
  // Swing targets: SL $12, TP1 $19, TP2 $32
  const isHighLev = config.leverage > 1;
  const targetSL = isSwing ? 12 : 4.4;
  const targetTP = isSwing ? 19 : 5.4;
  const dynamicSLPercent = isHighLev ? (targetSL / effectiveExposure) * 100 : config.stopLossPercent;
  const dynamicTPPercent = isHighLev ? (targetTP / effectiveExposure) * 100 : config.takeProfitPercent;
  const slMultiplier = direction === 'LONG' ? (1 - dynamicSLPercent / 100) : (1 + dynamicSLPercent / 100);`;

const newTP = "const tpMultiplier = direction === 'LONG' ? (1 + dynamicTPPercent / 100) : (1 - dynamicTPPercent / 100);";

if (c.includes(oldSL)) {
  c = c.replace(oldSL, newSL);
  c = c.replace(oldTP, newTP);
  // Update TP2 for swing
  if (c.includes("pos.takeProfit2 = price * tp2Multiplier;")) {
    c = c.replace(
      /const tp2Multiplier = direction === 'LONG'\n\s+\? \(1 \+ config\.takeProfit2Percent \/ 100\)\n\s+: \(1 - config\.takeProfit2Percent \/ 100\);/,
      "const dynamicTP2Percent = isHighLev ? (32 / effectiveExposure) * 100 : config.takeProfit2Percent;\n    const tp2Multiplier = direction === 'LONG'\n      ? (1 + dynamicTP2Percent / 100)\n      : (1 - dynamicTP2Percent / 100);"
    );
  }
  fs.writeFileSync(f, c);
  console.log('Dynamic SL/TP added');
} else {
  console.log('Not found - check file');
}
