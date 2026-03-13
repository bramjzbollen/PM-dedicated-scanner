const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'apple-reminders-cache.json');
const INTERVAL = 5 * 60 * 1000;
const TIMEOUT = 10000; // 10s timeout to prevent hanging connections

let syncInProgress = false;

function sync() {
  if (syncInProgress) return; // Prevent overlapping syncs
  syncInProgress = true;

  const req = http.get('http://100.80.206.83:8765/reminders', { timeout: TIMEOUT }, (res) => {
    const chunks = [];
    let totalSize = 0;
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB cap

    res.on('data', c => {
      totalSize += c.length;
      if (totalSize > MAX_SIZE) {
        req.destroy();
        console.error(`[${time()}] Response too large, aborting`);
        syncInProgress = false;
        return;
      }
      chunks.push(c);
    });

    res.on('end', () => {
      try {
        const data = Buffer.concat(chunks).toString();
        fs.writeFileSync(OUTPUT, data);
        const parsed = JSON.parse(data);
        console.log(`[${time()}] Synced: ${parsed.count || 0} reminders`);
      } catch (e) {
        console.error(`[${time()}] Parse error: ${e.message}`);
      }
      syncInProgress = false;
    });
  });

  req.on('error', e => {
    console.error(`[${time()}] Failed: ${e.message}`);
    syncInProgress = false;
  });

  req.on('timeout', () => {
    req.destroy();
    console.error(`[${time()}] Timeout after ${TIMEOUT}ms`);
    syncInProgress = false;
  });
}

function time() { return new Date().toLocaleTimeString(); }

sync();
setInterval(sync, INTERVAL);
console.log('Apple Reminders sync running (every 5 min)');
