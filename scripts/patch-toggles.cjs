const fs = require('fs');
const path = require('path');
const base = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard');
const scannerFile = path.join(base, 'scripts', 'update-scanner-data.js');
let scanner = fs.readFileSync(scannerFile, 'utf-8');
if (scanner.includes('if (longWindow && validATR) {')) {
  scanner = scanner.replace('if (longWindow && validATR) {', 'if (longWindow) {');
  scanner = scanner.replace('if (shortWindow && validATR) {', 'if (shortWindow) {');
  scanner = scanner.replace("signal = 'LONG';\n        confidence = 70;", "signal = 'LONG';\n        confidence = 60;\n        if (validATR) confidence += 10;");
  scanner = scanner.replace("signal = 'SHORT';\n        confidence = 70;", "signal = 'SHORT';\n        confidence = 60;\n        if (validATR) confidence += 10;");
  fs.writeFileSync(scannerFile, scanner);
  console.log('Scanner: ATR now optional');
} else { console.log('Scanner: already done or changed'); }
