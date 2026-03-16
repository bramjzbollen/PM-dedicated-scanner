/**
 * Dynamic token resolver for Polymarket's rotating "Up or Down" markets.
 * Markets are created every 5m with fresh token IDs - we need live lookups.
 */

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  clobTokenIds?: string;
  outcomes?: string;
  outcomePrices?: string;
  endDate?: string;
  end_date_iso?: string;
}

interface ResolvedToken {
  marketId: string;
  slug: string;
  question: string;
  tokenIdUp: string;
  tokenIdDown: string;
  priceUp: number;
  priceDown: number;
  endDate: string;
  cachedAt: number;
}

const cache = new Map<string, ResolvedToken>();
const CACHE_TTL_MS = 45_000; // 45s - markets rotate every 5m, refresh before stale

// Optional manual pinning via env (JSON object), but default is dynamic auto-sync.
// Example: {"PM-BTC-5M-UPDOWN":"btc-updown-5m-1773407700"}
const PINNED_MARKET_SLUGS: Record<string, string> = (() => {
  try {
    const raw = process.env.PM_PINNED_MARKET_SLUGS;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
})();

/**
 * Map internal market key to Gamma API filter.
 * PM-BTC-5M-UPDOWN → search for BTC + 5m timeframe
 */
function marketKeyToFilter(marketKey: string): { symbol: string; timeframeMinutes: number } | null {
  const upper = marketKey.toUpperCase();
  
  // Extract symbol
  let symbol = 'BTC';
  if (upper.includes('ETH')) symbol = 'ETH';
  else if (upper.includes('SOL')) symbol = 'SOL';
  else if (upper.includes('XRP')) symbol = 'XRP';
  else if (upper.includes('BTC')) symbol = 'BTC';
  else return null;

  // Extract timeframe
  let timeframeMinutes = 5;
  if (upper.includes('15M')) timeframeMinutes = 15;
  else if (upper.includes('1H') || upper.includes('60M')) timeframeMinutes = 60;
  else if (upper.includes('4H') || upper.includes('240M')) timeframeMinutes = 240;
  else if (upper.includes('5M')) timeframeMinutes = 5;

  return { symbol, timeframeMinutes };
}

/**
 * Find best matching active market from Gamma API results.
 */
function findBestMatch(markets: GammaMarket[], symbol: string, timeframeMinutes: number): GammaMarket | null {
  const now = Date.now();
  const symbolLower = symbol.toLowerCase();

  // Timeframe sync is enforced by slug pattern (5m/15m/1h) below.
  // Do not hard-cap remaining duration: PM markets can stay open longer than nominal timeframe.
  
  // Pattern: btc-updown-5m-{timestamp} or bitcoin-up-or-down-march-14-5am-et (daily)
  const slugPattern = (() => {
    const symbolSlug = symbol === 'BTC' ? '(btc|bitcoin)' : symbol === 'ETH' ? '(eth|ethereum)' : symbol === 'SOL' ? '(sol|solana)' : '(xrp|ripple)';
    if (timeframeMinutes === 5) {
      return new RegExp(`^${symbolSlug}-updown-5m-\\d+$`, 'i');
    }
    if (timeframeMinutes === 15) {
      return new RegExp(`^${symbolSlug}-updown-15m-\\d+$`, 'i');
    }
    if (timeframeMinutes === 60) {
      return new RegExp(`^${symbolSlug}-updown-(1h|60m)-\\d+$`, 'i');
    }
    return null;
  })();

  const candidates = markets
    .filter(m => {
      const q = (m.question || '').toLowerCase();
      const s = (m.slug || '').toLowerCase();
      
      // Must have "up" or "down" in question
      if (!q.includes('up') && !q.includes('down')) return false;
      
      // Must match symbol
      const symbolVariants = symbol === 'BTC'
        ? ['bitcoin', 'btc']
        : symbol === 'ETH'
          ? ['ethereum', 'eth']
          : symbol === 'XRP'
            ? ['xrp', 'ripple']
            : ['solana', 'sol'];
      if (!symbolVariants.some(v => q.includes(v) || s.includes(v))) return false;
      
      // If we have a slug pattern, enforce exact timeframe slugs
      if (slugPattern && !slugPattern.test(s)) return false;
      
      // Must have valid end date in the future and within timeframe window
      const endDate = m.endDate || m.end_date_iso;
      if (!endDate) return false;
      const endMs = new Date(endDate).getTime();
      if (endMs <= now) return false;
      
      // Must have token IDs
      if (!m.clobTokenIds) return false;
      
      return true;
    })
    .sort((a, b) => {
      // Prefer markets ending soonest (most current)
      const aEnd = new Date(a.endDate || a.end_date_iso || 0).getTime();
      const bEnd = new Date(b.endDate || b.end_date_iso || 0).getTime();
      return aEnd - bEnd;
    });

  return candidates[0] || null;
}

/**
 * Parse Gamma market response into resolved token.
 */
function parseGammaMarket(market: GammaMarket): ResolvedToken | null {
  try {
    const tokenIds = JSON.parse(market.clobTokenIds || '[]');
    const outcomes = JSON.parse(market.outcomes || '["Up","Down"]');
    const prices = JSON.parse(market.outcomePrices || '["0.5","0.5"]');
    
    if (tokenIds.length < 2) return null;
    
    // Outcomes typically: ["Up", "Down"] or ["Yes", "No"]
    const upIndex = outcomes.findIndex((o: string) => /up|yes/i.test(o));
    const downIndex = outcomes.findIndex((o: string) => /down|no/i.test(o));
    
    const tokenIdUp = tokenIds[upIndex >= 0 ? upIndex : 0];
    const tokenIdDown = tokenIds[downIndex >= 0 ? downIndex : 1];
    const priceUp = parseFloat(prices[upIndex >= 0 ? upIndex : 0] || '0.5');
    const priceDown = parseFloat(prices[downIndex >= 0 ? downIndex : 1] || '0.5');
    
    return {
      marketId: market.id,
      slug: market.slug,
      question: market.question,
      tokenIdUp,
      tokenIdDown,
      priceUp,
      priceDown,
      endDate: market.endDate || market.end_date_iso || '',
      cachedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch active markets from Gamma API.
 */
async function fetchGammaMarkets(timeoutMs = 8000): Promise<GammaMarket[]> {
  const urls = [
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500&order=createdAt&ascending=false',
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500',
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) continue;
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        if (arr.length > 0) return arr;
      } catch {
        // try next url / retry
      } finally {
        clearTimeout(timer);
      }
    }
    await new Promise((r) => setTimeout(r, 250 * attempt));
  }

  return [];
}

/**
 * Resolve token IDs for a market key (e.g., "PM-BTC-5M-UPDOWN").
 * Returns null if no active market found or token resolution fails.
 */
export async function resolveMarketTokens(marketKey: string): Promise<ResolvedToken | null> {
  // Check cache
  const cached = cache.get(marketKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Parse market key
  const filter = marketKeyToFilter(marketKey);
  if (!filter) return null;

  // Fetch latest markets
  const markets = await fetchGammaMarkets();
  if (markets.length === 0) return null;

  // First try hard-pinned slug for this market key (if configured)
  const pinnedSlug = PINNED_MARKET_SLUGS[marketKey];
  const pinnedMatch = pinnedSlug
    ? markets.find((m) => String(m.slug || '').toLowerCase() === pinnedSlug.toLowerCase())
    : null;

  // Otherwise find best dynamic match
  const match = pinnedMatch || findBestMatch(markets, filter.symbol, filter.timeframeMinutes);
  if (!match) return null;

  // Parse tokens
  const resolved = parseGammaMarket(match);
  if (!resolved) return null;

  // Cache and return
  cache.set(marketKey, resolved);
  return resolved;
}

/**
 * Get token ID for a specific side (UP or DOWN).
 */
export async function getTokenIdForSide(
  marketKey: string,
  side: 'UP' | 'DOWN'
): Promise<{ tokenId: string; price: number; resolved: ResolvedToken } | null> {
  const resolved = await resolveMarketTokens(marketKey);
  if (!resolved) return null;

  return {
    tokenId: side === 'UP' ? resolved.tokenIdUp : resolved.tokenIdDown,
    price: side === 'UP' ? resolved.priceUp : resolved.priceDown,
    resolved,
  };
}

/**
 * Clear cache (useful for testing or forced refresh).
 */
export function clearTokenCache(): void {
  cache.clear();
}
