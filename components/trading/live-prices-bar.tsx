'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  lastUpdate: Date;
}

const COINGECKO_IDS: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
};

function formatCompactPrice(price: number): string {
  if (price >= 10000) return `$${(price / 1000).toFixed(1)}K`;
  if (price >= 1000) return `$${(price / 1000).toFixed(2)}K`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.001) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

// Fallback mock prices
const FALLBACK_PRICES: CryptoPrice[] = [
  { symbol: 'BTC', price: 67580, change24h: 2.45, lastUpdate: new Date() },
  { symbol: 'ETH', price: 3515, change24h: -0.85, lastUpdate: new Date() },
  { symbol: 'SOL', price: 148.5, change24h: 5.6, lastUpdate: new Date() },
  { symbol: 'BNB', price: 582.3, change24h: 1.2, lastUpdate: new Date() },
  { symbol: 'XRP', price: 0.62, change24h: 3.1, lastUpdate: new Date() },
  { symbol: 'ADA', price: 0.65, change24h: -1.2, lastUpdate: new Date() },
];

export function LivePricesBar() {
  const [prices, setPrices] = useState<CryptoPrice[]>(FALLBACK_PRICES);
  const [isLive, setIsLive] = useState(false);

  const fetchPrices = useCallback(async () => {
    try {
      const ids = Object.values(COINGECKO_IDS).join(',');
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { next: { revalidate: 30 } }
      );
      if (!res.ok) throw new Error('CoinGecko error');
      const data = await res.json();

      const newPrices: CryptoPrice[] = Object.entries(COINGECKO_IDS).map(([symbol, id]) => {
        const coin = data[id];
        return {
          symbol,
          price: coin?.usd || 0,
          change24h: coin?.usd_24h_change || 0,
          lastUpdate: new Date(),
        };
      }).filter(p => p.price > 0);

      if (newPrices.length > 0) {
        setPrices(newPrices);
        setIsLive(true);
      }
    } catch {
      // Keep existing prices (fallback or last fetched)
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30 * 1000); // 30s refresh
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return (
    <div className="overflow-x-auto custom-scrollbar pb-1">
      <div className="flex gap-3 min-w-min">
        {prices.map((price) => (
          <div
            key={price.symbol}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12] min-w-[120px]"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold text-white/90">
                {price.symbol}
              </span>
              {!isLive && (
                <span className="text-[8px] text-white/20">~</span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-white/90 font-mono">
                {formatCompactPrice(price.price)}
              </span>
              <span className={cn(
                "text-[11px] font-semibold font-mono",
                price.change24h >= 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
