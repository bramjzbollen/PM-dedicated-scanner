const base = process.env.PM_SMOKE_BASE_URL || 'http://localhost:3000';

async function json(path) {
  const res = await fetch(`${base}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const state = await json('/api/pm-bot/state');
  console.log(`[pm-live-smoke] mode=${state.mode} executionStatus=${state.executionStatus} stale=${state.stale} reason=${state.statusReason}`);

  if (state.mode !== 'live' || state.executionStatus !== 'LIVE' || state.stale) {
    throw new Error('Live guards not satisfied. No live order should be attempted.');
  }

  // state endpoint already runs a cycle; call once more to force next decision attempt.
  await json('/api/pm-bot/state');

  const bets = await json('/api/pm-bot/bets?status=open');
  const last = Array.isArray(bets) ? bets[0] : null;
  console.log('[pm-live-smoke] latest open bet:', last ? {
    id: last.id,
    marketKey: last.marketKey,
    side: last.side,
    execution: last.execution || 'paper',
    liveOrderId: last.liveOrderId || null,
    fallbackReason: last.fallbackReason || null,
    openedAt: last.openedAt,
  } : null);
}

main().catch((err) => {
  console.error('[pm-live-smoke] failed:', err?.message || err);
  process.exit(1);
});
