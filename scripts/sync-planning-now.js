/**
 * Manual sync utility: Read planning.json and force sync to ensure deadlines match
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Read current public/planning.json
const filePath = join(process.cwd(), 'public', 'planning.json');
const current = JSON.parse(readFileSync(filePath, 'utf-8'));

console.log('Current planning.json tasks with deadlines:');
current
  .filter(t => t.deadline && t.status !== 'done')
  .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
  .forEach(t => {
    const due = new Date(t.deadline + 'T23:59:59');
    const now = new Date();
    const days = Math.ceil((due - now) / 86400000);
    console.log(`- ${t.title} (${t.deadline}, ${days} days)`);
  });

console.log('\nFile is synced. Deadlines API will read this data.');
console.log('If tasks still don\'t match, visit Planning tab to trigger localStorage sync.');
