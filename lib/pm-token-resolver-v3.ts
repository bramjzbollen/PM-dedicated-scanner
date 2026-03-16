/**
 * TIMESTAMP-BASED Polymarket resolver - constructs slugs directly instead of API scanning.
 * Updown markets don't appear in /events?active=true but ARE accessible via /events/slug/{slug}
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
const CACHE_TTL_MS = 45_000; // 45s cache

/**
 * Calculate current and next 5m/15m/1h timestamp slots.
 */
function getTimeSlots(minutes: number): number[] {
  const now = Math.floor(Date.now() / 1000);
  const interval = minutes * 60;
  const current = Math.floor(now / interval) * interval;
  return [
    current,
    current + interval,
    current - interval, // also try previous in case of small clock drift
  ];
}

/**
 * Construct slug from symbol + timeframe + timestamp.
 */
function buildSlug(symbol: string, minutes: number, timestamp: number): string {
  const sym = symbol.toLowerCase();
  const tf = minutes === 5 ? '5m' : minutes === 15 ? '15m' : '1h';
  return `${sym}-updown-${tf}-${timestamp}`;
}

/**
 * Fetch event via direct slug lookup.
 */
async function fetchEventBySlug(slug: string): Promise<PMEvent | null> {
  try {
    const url = `https://gamma-api.polymarket.com/events/slug/${slug}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const event = await res.json();
    return event as PMEvent;
  } catch {
    return null;
  }
}

/**
 * Parse tokens from market.
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
 * Resolve market by constructing slug from timestamp.
 */
export async function resolveMarketTokens(marketKey: string): Promise<ResolvedToken | null> {
  const cached = cache.get(marketKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Parse market key
  const upper = marketKey.toUpperCase();
  let symbol = 'btc';
  if (upper.includes('ETH')) symbol = 'eth';
  else if (upper.includes('SOL')) symbol = 'sol';
  else if (upper.includes('XRP')) symbol = 'xrp';
  else if (upper.includes('DOGE')) symbol = 'doge';

  let timeframe = 5;
  if (upper.includes('15M')) timeframe = 15;
  else if (upper.includes('1H') || upper.includes('60M')) timeframe = 60;

  // Generate possible timestamps
  const slots = getTimeSlots(timeframe);

  // Try each slot
  for (const ts of slots) {
    const slug = buildSlug(symbol, timeframe, ts);
    const event = await fetchEventBySlug(slug);

    if (!event || !event.active || event.closed) continue;
    if (!event.markets || event.markets.length === 0) continue;

    const market = event.markets[0];
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
