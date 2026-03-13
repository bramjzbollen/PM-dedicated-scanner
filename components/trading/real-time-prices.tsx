'use client';

import { useEffect, useState } from 'react';
import { PriceList } from './price-list';
import type { CryptoPrice } from '@/lib/types';
import { getMockPrices } from '@/lib/mock-data';

export function RealTimePrices() {
  const [prices, setPrices] = useState<CryptoPrice[]>(getMockPrices());

  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => prev.map(price => ({
        ...price,
        price: price.price * (1 + (Math.random() - 0.5) * 0.002),
        change24h: price.change24h + (Math.random() - 0.5) * 0.1,
        lastUpdate: new Date(),
      })));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return <PriceList prices={prices} />;
}
