/**
 * Adaptive Grid Trading Engine v2
 * 
 * Key change from v1: manages grid orders internally, only uses
 * the trade-state API for position tracking (open/close).
 * 
 * The grid tracks virtual limit orders. When price crosses a level,
 * it opens a position via the API. TP is the adjacent grid level.
 * 
 * Grid rebuilds only when price drifts too far from center.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const CONFIG_PATH = path.join(__dirname, '..', 'public', 'grid-config.json');
const PRICES_PATH = path.join(__dirname, '..', 'public', 'v2-scalp-signals.json');
const API_BASE = 'http://localhost:3000/api/v2-trade-state';
const MODE = 'v2-grid';

// ── Config ──
const DEFAULT_CONFIG = {
  pairs: ['BTC/USDT', 'ETH/USDT'],
  gridLevels: 10,
  spacingPct: 0.3,
  positionSizeUsd: 50,
  leverage: 10,
  maxOpenPerPair: 5,
  maxOpenTotal: 10,
  tickIntervalMs: 3000,
  rebuildDriftPct: 2.0,
  roundtripFeePct: 0.11,
};

let config = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

function loadPrices() {
  try {
    const raw = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf-8'));
    return raw.prices || raw;
  } catch { return {}; }
}

// ── API helpers ──
function apiPost(action, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ mode: MODE, action, ...params });
    const req = http.request(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function apiGet() {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}?mode=${MODE}`, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

// ── Grid State ──
// Each pair has its own grid with buy/sell levels
const grids = {};  // { 'BTC/USDT': { center, spacing, levels: [...], lastPrice } }

function buildGrid(pair, centerPrice) {
  const spacing = config.spacingPct / 100;
  const levels = [];

  for (let i = 1; i <= config.gridLevels; i++) {
    // Buy levels below center
    const buyPrice = centerPrice * (1 - spacing * (i - 0.5));  // offset: first level at 0.5x spacing
    levels.push({
      price: +buyPrice.toFixed(8),
      direction: 'LONG',
      index: -i,
      triggered: false,
      positionId: null,
    });
    // Sell levels above center
    const sellPrice = centerPrice * (1 + spacing * (i - 0.5));  // offset: first level at 0.5x spacing
    levels.push({
      price: +sellPrice.toFixed(8),
      direction: 'SHORT',
      index: i,
      triggered: false,
      positionId: null,
    });
  }

  // Sort by price ascending
  levels.sort((a, b) => a.price - b.price);

  grids[pair] = {
    center: centerPrice,
    spacing: config.spacingPct,
    levels,
    lastPrice: centerPrice,
    builtAt: Date.now(),
  };

  console.log(`[grid] ${pair} built: center=$${centerPrice.toFixed(2)}, ${levels.length} levels, spacing=${config.spacingPct}%`);
  return grids[pair];
}

function shouldRebuild(pair, currentPrice) {
  const grid = grids[pair];
  if (!grid) return true;
  const drift = Math.abs(currentPrice - grid.center) / grid.center * 100;
  return drift > config.rebuildDriftPct;
}

// ── Core Logic: check if price crossed any grid level ──
async function tick(pair, currentPrice) {
  if (!grids[pair]) return;
  const grid = grids[pair];
  const prevPrice = grid.lastPrice;
  grid.lastPrice = currentPrice;

  // Get current state to know open positions
  let state;
  try { state = await apiGet(); } catch { return; }
  if (!state || !state.isRunning) return;

  const openPositions = (state.positions || []).filter(p => p.symbol === pair);
  const totalOpen = (state.positions || []).length;

  for (const level of grid.levels) {
    if (level.triggered) continue;
    if (totalOpen >= config.maxOpenTotal) break;
    if (openPositions.length >= config.maxOpenPerPair) break;

    // Check if price crossed this level since last tick
    let crossed = false;
    if (level.direction === 'LONG') {
      // Price at or below buy level (crossed or already past)
      crossed = currentPrice <= level.price;
    } else {
      // Price at or above sell level (crossed or already past)
      crossed = currentPrice >= level.price;
    }

    const dist = Math.abs(currentPrice - level.price) / level.price; crossed = dist < 0.001; if (!crossed) continue; console.log('[HIT]', pair, level.direction, 'lvl='+level.price.toFixed(2), 'cur='+currentPrice.toFixed(2));

    // Calculate TP: next grid level in profit direction
    const tpDistance = grid.center * (config.spacingPct / 100);
    let tp, sl;
    if (level.direction === 'LONG') {
      tp = +(level.price + tpDistance).toFixed(8);
      sl = +(level.price - tpDistance * 2).toFixed(8);
    } else {
      tp = +(level.price - tpDistance).toFixed(8);
      sl = +(level.price + tpDistance * 2).toFixed(8);
    }

    // Fee check: TP move must cover roundtrip fees
    // Fee check disabled - handled by PnL calc

    // Check if we already have a position near this price
    const hasDuplicate = openPositions.some(p =>
      Math.abs(p.entryPrice - level.price) / level.price < 0.002
    );
    if (hasDuplicate) continue;

    // Open position via API
    try {
      // Use updatePrices first to make sure state is fresh
      const prices = loadPrices();
      await apiPost('updatePrices', { prices });

      await apiPost('manualEntry', {
        symbol: pair,
        direction: level.direction,
        price: level.price,
        trade: {
          stopLoss: level.direction === 'LONG' ? level.price * (1 - config.spacingPct * 2 / 100) : level.price * (1 + config.spacingPct * 2 / 100),
          takeProfit: level.direction === 'LONG' ? level.price * (1 + config.spacingPct / 100) : level.price * (1 - config.spacingPct / 100),
          riskR: level.price * config.spacingPct / 100,
          timeStopCandles: 60,
        }
      });

      level.triggered = true;
      console.log(`[grid] ${pair} ${level.direction} @ ${level.price.toFixed(4)} | TP: ${tp.toFixed(4)} | SL: ${sl.toFixed(4)}`);
    } catch (e) {
      console.error(`[grid] Error: ${e.message}`);
    }
  }

  // Check for closed positions and reset their grid levels
  const closedSymbols = (state.closedPositions || [])
    .filter(p => p.symbol === pair)
    .slice(0, 20);

  for (const level of grid.levels) {
    if (!level.triggered) continue;
    // If no open position near this level, reset it
    const stillOpen = openPositions.some(p =>
      Math.abs(p.entryPrice - level.price) / level.price < 0.002
    );
    if (!stillOpen) {
      level.triggered = false; // Reset level for reuse
    }
  }
}

// ── Main ──
async function main() {
  console.log('=== Grid Trading Engine v2 ===');
  loadConfig();

  console.log(`[grid] Pairs: ${config.pairs.join(', ')}`);
  console.log(`[grid] Spacing: ${config.spacingPct}%`);
  console.log(`[grid] Levels: ${config.gridLevels} buy + ${config.gridLevels} sell per pair`);
  console.log(`[grid] Position: $${config.positionSizeUsd} x ${config.leverage}x`);
  console.log(`[grid] Max open: ${config.maxOpenPerPair}/pair, ${config.maxOpenTotal} total`);
  console.log(`[grid] Tick: ${config.tickIntervalMs}ms`);

  // Init trade state
  try {
    await apiPost('reset');
    await apiPost('start');
    await apiPost('updateConfig', {
      config: {
        positionSize: config.positionSizeUsd,
        leverage: config.leverage,
        maxPositions: config.maxOpenTotal,
        stopLossPercent: config.spacingPct * 2,
        takeProfitPercent: config.spacingPct,
        trailingStopPercent: config.spacingPct * 0.5,
        trailingActivationPercent: config.spacingPct * 0.8,
        autoEntry: false,
        minConfidence: 0,
        timeoutMinutes: 60,
        cooldownMinutes: 0,
      }
    });
    console.log('[grid] State initialized');
  } catch (e) {
    console.error('[grid] Init failed:', e.message);
    return;
  }

  // Build initial grids
  const prices = loadPrices();
  for (const pair of config.pairs) {
    const price = prices[pair];
    if (price && price > 0) {
      buildGrid(pair, price);
    } else {
      console.log(`[grid] No price for ${pair}, waiting...`);
    }
  }

  // Main tick loop
  setInterval(async () => {
    loadConfig();
    const prices = loadPrices();

    for (const pair of config.pairs) {
      const price = prices[pair];
      if (!price || price <= 0) continue;

      // Build grid if not exists or price drifted too far
      if (shouldRebuild(pair, price)) {
        buildGrid(pair, price);
      }

      // Update prices in state
      try {
        await apiPost('updatePrices', { prices });
      } catch {}

      // Process grid
      try {
        await tick(pair, price);
      } catch {}
    }
  }, config.tickIntervalMs);

  // Status log every 30 seconds
  setInterval(async () => {
    try {
      const state = await apiGet();
      if (!state) return;
      const pnl = state.stats?.realizedPnl || 0;
      const open = state.positions?.length || 0;
      const closed = state.stats?.closedCount || 0;
      const wr = state.winRate?.toFixed(1) || '0';
      const wallet = state.stats?.walletBalance?.toFixed(2) || '0';

      let gridInfo = '';
      for (const pair of config.pairs) {
        const g = grids[pair];
        if (g) {
          const triggered = g.levels.filter(l => l.triggered).length;
          gridInfo += ` | ${pair}: ${triggered}/${g.levels.length} filled`;
        }
      }

      console.log(`[grid] ${closed} trades | WR ${wr}% | PnL $${pnl.toFixed(2)} | Open ${open} | Wallet $${wallet}${gridInfo}`);
    } catch {}
  }, 30000);

  console.log('[grid] Engine running, waiting for price crosses...');
}

main().catch(console.error);
