'use client';

import { useEffect, useState } from 'react';
import { ActiveTrades } from './active-trades';
import type { Trade } from '@/lib/types';
import { getMockTrades } from '@/lib/mock-data';

export function RealTimeTrades() {
  const [trades, setTrades] = useState<Trade[]>(getMockTrades());

  useEffect(() => {
    const interval = setInterval(() => {
      setTrades(prev => prev.map(trade => {
        if (trade.status === 'CLOSED') return trade;
        
        const priceChange = (Math.random() - 0.5) * 0.001;
        const newCurrentPrice = trade.currentPrice * (1 + priceChange);
        const priceDiff = (newCurrentPrice - trade.entryPrice) * trade.quantity * trade.leverage;
        const profitLoss = trade.type === 'LONG' ? priceDiff : -priceDiff;
        const profitLossPercent = ((newCurrentPrice - trade.entryPrice) / trade.entryPrice) * 100 * trade.leverage;

        return {
          ...trade,
          currentPrice: newCurrentPrice,
          profitLoss,
          profitLossPercent: trade.type === 'LONG' ? profitLossPercent : -profitLossPercent,
        };
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return <ActiveTrades trades={trades} />;
}
