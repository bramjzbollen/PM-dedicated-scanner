/**
 * pm-wallet-balance.ts
 *
 * Fetches real Polymarket wallet balance via Polymarket Data API.
 * Read-only — no wallet mutations.
 */

// ─── Cache ───────────────────────────────────────────────────────────────────

interface BalanceCacheEntry {
  balanceUsd: number;
  fetchedAt: number;
  address: string;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
let balanceCache: BalanceCacheEntry | null = null;

// ─── Internal helpers ────────────────────────────────────────────────────────

function getFunderAddress(): string | null {
  const addr =
    process.env.PM_FUNDER_ADDRESS ||
    process.env.POLY_FUNDER_ADDRESS ||
    process.env.CLOB_FUNDER_ADDRESS ||
    process.env.POLYMARKET_WALLET_ADDRESS ||
    null;
  if (!addr) return null;
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim()) ? addr.trim() : null;
}

async function fetchPolymarketBalance(address: string): Promise<number | null> {
  // Check for manual override first (always takes precedence when set)
  const manualOverride = Number(process.env.PM_MANUAL_BALANCE_USD || 0);
  if (manualOverride > 0) {
    console.log(`[PM Balance] Using manual override: $${manualOverride} (API might return stale/partial data)`);
    return manualOverride;
  }

  try {
    // Polymarket Data API (public, no auth needed)
    const url = `https://data-api.polymarket.com/value?user=${address}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`[PM Balance] Polymarket API returned ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    
    // API returns array: [{ user, value }] or { value }
    const rawValue = Array.isArray(data) ? data[0]?.value : data?.value;
    const value = Number(rawValue || 0);
    
    if (!Number.isFinite(value) || value < 0) {
      console.warn(`[PM Balance] Invalid value from API:`, data);
      return null;
    }

    return value;
  } catch (err: any) {
    console.warn(`[PM Balance] Fetch error:`, err.message);
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface WalletBalanceResult {
  ok: boolean;
  balanceUsd: number;
  address: string;
  cached: boolean;
  fetchedAt: string; // ISO
  error?: string;
}

/**
 * Get the live Polymarket portfolio value for the configured wallet.
 * Cached for 30s. Read-only — no wallet mutations.
 */
export async function getPMWalletBalance(): Promise<WalletBalanceResult> {
  const address = getFunderAddress();
  if (!address) {
    return {
      ok: false,
      balanceUsd: 0,
      address: '',
      cached: false,
      fetchedAt: new Date().toISOString(),
      error: 'PM_FUNDER_ADDRESS not configured',
    };
  }

  // Return cached if fresh
  const now = Date.now();
  if (
    balanceCache &&
    balanceCache.address === address &&
    now - balanceCache.fetchedAt < CACHE_TTL_MS
  ) {
    return {
      ok: true,
      balanceUsd: balanceCache.balanceUsd,
      address,
      cached: true,
      fetchedAt: new Date(balanceCache.fetchedAt).toISOString(),
    };
  }

  // Fetch from Polymarket API
  const balance = await fetchPolymarketBalance(address);
  
  if (balance !== null) {
    balanceCache = {
      balanceUsd: Number(balance.toFixed(2)),
      fetchedAt: now,
      address,
    };
    return {
      ok: true,
      balanceUsd: balanceCache.balanceUsd,
      address,
      cached: false,
      fetchedAt: new Date(now).toISOString(),
    };
  }

  // API failed — return stale cache if available
  if (balanceCache && balanceCache.address === address) {
    return {
      ok: true,
      balanceUsd: balanceCache.balanceUsd,
      address,
      cached: true,
      fetchedAt: new Date(balanceCache.fetchedAt).toISOString(),
      error: 'Polymarket API fetch failed; returning stale cache',
    };
  }

  return {
    ok: false,
    balanceUsd: 0,
    address,
    cached: false,
    fetchedAt: new Date().toISOString(),
    error: 'Polymarket API failed and no cache available',
  };
}

/**
 * Check if a proposed order size is within the available balance.
 * Returns { allowed, reason }.
 */
export async function checkBalanceForOrder(orderSizeUsd: number): Promise<{
  allowed: boolean;
  reason: string;
  balanceUsd: number;
}> {
  const result = await getPMWalletBalance();

  if (!result.ok) {
    return {
      allowed: false,
      reason: `Balance check failed: ${result.error || 'unknown'}`,
      balanceUsd: 0,
    };
  }

  if (result.balanceUsd < orderSizeUsd) {
    return {
      allowed: false,
      reason: `Insufficient balance: $${result.balanceUsd.toFixed(2)} < order $${orderSizeUsd.toFixed(2)}`,
      balanceUsd: result.balanceUsd,
    };
  }

  return {
    allowed: true,
    reason: `Balance OK: $${result.balanceUsd.toFixed(2)} >= order $${orderSizeUsd.toFixed(2)}`,
    balanceUsd: result.balanceUsd,
  };
}
