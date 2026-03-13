/**
 * Manual trigger for Apple Reminders -> planning.json sync.
 *
 * Usage:
 *   npm run sync:apple-reminders
 *
 * Requires a running local dashboard server (npm run dev/start).
 */

const baseUrl = process.env.MISSION_CONTROL_BASE_URL || 'http://localhost:3000';

async function run() {
  const res = await fetch(`${baseUrl}/api/planning-sync/apple-reminders`, { method: 'POST' });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run().catch((err) => {
  console.error('Apple reminders sync failed:', err?.message || err);
  process.exit(1);
});
