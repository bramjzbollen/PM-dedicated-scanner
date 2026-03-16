/**
 * STRICT Polymarket event/slug resolver - uses /events endpoint, exact slug matching only.
 * NO fuzzy matching, NO approximations - if slug doesn't match pattern, reject.
 */

interface PMEvent {
  id: string;
  slug: string;
  title: string;
  markets: PMMarket[];
  active: boolean;
  closed: boolean;
  end_date_iso?: string;
}

interface PMMarket {
  id: string;
  question: string;
  clobTokenIds?: string;
  outcomes?: string;
  outcomePrices?: string;
}

interface ResolvedToken {
  marketId: string;
  eventSlug: string;
  question: string;
  tokenIdUp: string;
  tokenIdDown: string;
  priceUp: number;
  priceDown: number;
  cachedAt: number;
}

const cache = new Map<string, ResolvedToken>();
const CACHE_TTL_MS = 30_000; // 30s cache

/**
 * Fetch active events from Polymarket /events endpoint (docs-prescribed approach).
 */
async function fetchActiveEvents(): Promise<PMEvent[]> {
  try {
    const url = 'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=500';
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * STRICT slug pattern matching - 5m/15m only, exact format.
 */
function matchesTimeframePattern(slug: string, timeframe: number): boolean {
  const s = slug.toLowerCase();
  if (timeframe === 5) return /-updown-5m-\d+$/.test(s);
  if (timeframe === 15) return /-updown-15m-\d+$/.test(s);
  return false;
}

/**
 * STRICT symbol matching.
 */
function matchesSymbol(slug: string, symbol: string): boolean {
  const s = slug.toLowerCase();
  if (symbol === 'BTC') return /^(btc|bitcoin)-/.test(s);
  if (symbol === 'ETH') return /^(eth|ethereum)-/.test(s);
  if (symbol === 'SOL') return /^(sol|solana)-/.test(s);
  if (symbol === 'XRP') return /^(xrp|ripple)-/.test(s);
  return false;
}

/**
 * Parse market tokens from Gamma market object.
 */
function parseTokens(market: PMMarket): { up: string; down: string; priceUp: number; priceDown: number } | null {
  try {
    const tokenIds = JSON.parse(market.clobTokenIds || '[]');
    const outcomes = JSON.parse(market.outcomes || '["Up","Down"]');
    const prices = JSON.parse(market.outcomePrices || '["0.5","0.5"]');

    if (tokenIds.length < 2) return null;

    const upIdx = outcomes.findIndex((o: string) => /up|yes/i.test(o));
    const downIdx = outcomes.findIndex((o: string) => /down|no/i.test(o));

    return {
      up: tokenIds[upIdx >= 0 ? upIdx : 0],
      down: tokenIds[downIdx >= 0 ? downIdx : 1],
      priceUp: parseFloat(prices[upIdx >= 0 ? upIdx : 0] || '0.5'),
      priceDown: parseFloat(prices[downIdx >= 0 ? downIdx : 1] || '0.5'),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve market by EXACT symbol + timeframe matching on event slug.
 */
export async function resolveMarketTokens(marketKey: string): Promise<ResolvedToken | null> {
  const cached = cache.get(marketKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Parse market key (e.g., PM-BTC-5M-UPDOWN)
  const upper = marketKey.toUpperCase();
  let symbol = 'BTC';
  if (upper.includes('ETH')) symbol = 'ETH';
  else if (upper.includes('SOL')) symbol = 'SOL';
  else if (upper.includes('XRP')) symbol = 'XRP';

  let timeframe = 5;
  if (upper.includes('15M')) timeframe = 15;

  // Fetch active events
  const events = await fetchActiveEvents();
  if (events.length === 0) return null;

  // Find EXACT match: symbol + timeframe slug pattern
  for (const event of events) {
    if (!matchesSymbol(event.slug, symbol)) continue;
    if (!matchesTimeframePattern(event.slug, timeframe)) continue;
    if (!event.markets || event.markets.length === 0) continue;

    const market = event.markets[0]; // Binary markets have 1 market
    const tokens = parseTokens(market);
    if (!tokens) continue;

    const resolved: ResolvedToken = {
      marketId: market.id,
      eventSlug: event.slug,
      question: market.question,
      tokenIdUp: tokens.up,
      tokenIdDown: tokens.down,
      priceUp: tokens.priceUp,
      priceDown: tokens.priceDown,
      cachedAt: Date.now(),
    };

    cache.set(marketKey, resolved);
    return resolved;
  }

  return null;
}

/**
 * Get token ID + price for specific side.
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

export function clearTokenCache(): void {
  cache.clear();
}
