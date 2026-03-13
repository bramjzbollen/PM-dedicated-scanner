export type NormalizedSignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface NormalizedSignal {
  pair: string;
  symbol: string;
  signal: NormalizedSignalDirection;
  direction: NormalizedSignalDirection;
  price: number;
  confidence: number;
  reason: string;
  indicators: Record<string, unknown> & { price?: number };
  raw: unknown;
}

function asDirection(value: unknown): NormalizedSignalDirection {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'LONG' || normalized === 'BUY') return 'LONG';
  if (normalized === 'SHORT' || normalized === 'SELL') return 'SHORT';
  return 'NEUTRAL';
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeSignal(input: any): NormalizedSignal {
  const symbol = String(input?.symbol ?? input?.pair ?? '').trim();
  const pair = String(input?.pair ?? input?.symbol ?? '').trim();
  const direction = asDirection(input?.direction ?? input?.signal);
  const indicators = (input?.indicators && typeof input.indicators === 'object') ? input.indicators : {};
  const indicatorPrice = asNumber((indicators as any)?.price, 0);
  const directPrice = asNumber(input?.price, indicatorPrice);

  return {
    pair: pair || symbol,
    symbol: symbol || pair,
    signal: direction,
    direction,
    price: directPrice,
    confidence: asNumber(input?.confidence, 0),
    reason: String(input?.reason ?? ''),
    indicators: {
      ...(indicators as Record<string, unknown>),
      price: directPrice,
    },
    raw: input,
  };
}

export function normalizeSignals(signals: unknown): NormalizedSignal[] {
  if (!Array.isArray(signals)) return [];

  return signals
    .map(normalizeSignal)
    .filter((sig) => Boolean(sig.pair || sig.symbol));
}

export function safePairLabel(signalLike: { pair?: string; symbol?: string }): string {
  return signalLike.pair ?? signalLike.symbol ?? '—';
}

export function symbolKey(signalLike: { pair?: string; symbol?: string }): string {
  return signalLike.symbol ?? signalLike.pair ?? '—';
}

export function compactPairLabel(signalLike: { pair?: string; symbol?: string }): string {
  const pair = safePairLabel(signalLike);
  return pair === '—' ? pair : pair.replace('/USDT', '');
}
