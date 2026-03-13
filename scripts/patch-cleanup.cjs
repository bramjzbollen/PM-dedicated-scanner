const fs = require('fs');
const path = require('path');
const file = path.join(process.env.USERPROFILE, '.openclaw', 'workspace-boeboesh', 'mission-control-dashboard', 'lib', 'use-trading-engine.ts');
let lines = fs.readFileSync(file, 'utf-8').split('\n');

// Line 606 is "        });" - end of our clean forEach
// Line 607-643 is junk that needs to go
// Line 644 is "      }" - closing of if(cfg.autoEntry)

// Find first "        });" after pendingSymbols (our clean end)
const pendingIdx = lines.findIndex(l => l.includes('const pendingSymbols'));
let cleanEnd = -1;
let braceCount = 0;
for (let i = pendingIdx; i < lines.length; i++) {
  if (lines[i].trim() === '});' && lines[i].startsWith('        ')) {
    cleanEnd = i;
    break;
  }
}

if (cleanEnd === -1) { console.log('Could not find clean end'); process.exit(1); }

// Find the "      }" that closes if(cfg.autoEntry) - should be after the junk
let autoEntryClose = -1;
for (let i = cleanEnd + 1; i < lines.length; i++) {
  if (lines[i].trim() === '}' && lines[i].startsWith('      }')) {
    autoEntryClose = i;
    break;
  }
}

if (autoEntryClose === -1) { console.log('Could not find autoEntry close'); process.exit(1); }

console.log('Clean forEach ends at line ' + (cleanEnd + 1));
console.log('Junk from line ' + (cleanEnd + 2) + ' to ' + (autoEntryClose));
console.log('autoEntry close at line ' + (autoEntryClose + 1));

// Remove everything between cleanEnd and autoEntryClose (exclusive)
const before = lines.slice(0, cleanEnd + 1);
const after = lines.slice(autoEntryClose);
const result = [...before, ...after].join('\n');
fs.writeFileSync(file, result);
console.log('Removed ' + (autoEntryClose - cleanEnd - 1) + ' junk lines');
