const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'apple-reminders-cache.json');

http.get('http://100.80.206.83:8765/reminders', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    fs.writeFileSync(OUTPUT, data);
    console.log('Synced:', JSON.parse(data).count, 'reminders');
  });
}).on('error', e => {
  console.error('Failed:', e.message);
  process.exit(1);
});
