'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PaperTrade, ScannerFilters } from '@/lib/scanner-types';
import { calculatePnl, getHoldTime, ROVER_STRATEGY } from '@/lib/scanner-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faArrowUp,
  faArrowDown,
  faBolt,
  faXmark,
  faClock,
  faShieldHalved,
  faBullseye,
} from '@fortawesome/free-solid-svg-icons';

interface ActivePaperTradesProps {
  trades: PaperTrade[];
  onCloseTrade: (tradeId: string) => void;
}

export function ActivePaperTrades({ trades, onCloseTrade }: ActivePaperTradesProps) {
  const [filters, setFilters] = useState<ScannerFilters>({
    search: '',
    signalType: 'ALL',
    minConfidence: 0,
    sortBy: 'pnl',
    sortDir: 'desc',
  });

  const filteredTrades = useMemo(() => {
    let result = [...trades];

    if (filters.search) {
      const q = filters.search.toUpperCase();
      result = result.filter(t => t.symbol.includes(q));
    }

    if (filters.signalType !== 'ALL') {
      result = result.filter(t => t.direction === filters.signalType);
    }

    result.sort((a, b) => {
      const dir = filters.sortDir === 'desc' ? -1 : 1;
      switch (filters.sortBy) {
        case 'pnl': {
          const pnlA = calculatePnl(a).pnlPercent;
          const pnlB = calculatePnl(b).pnlPercent;
          return (pnlA - pnlB) * dir;
        }
        case 'symbol': return a.symbol.localeCompare(b.symbol) * dir;
        case 'price': return (a.currentPrice - b.currentPrice) * dir;
        case 'confidence': return (a.confidence - b.confidence) * dir;
        default: return 0;
      }
    });

    return result;
  }, [trades, filters]);

  const toggleSort = (col: ScannerFilters['sortBy']) => {
    setFilters(prev => ({
      ...prev,
      sortBy: col,
      sortDir: prev.sortBy === col && prev.sortDir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const SortIcon = ({ col }: { col: ScannerFilters['sortBy'] }) => {
    if (filters.sortBy !== col) return null;
    return (
      <FontAwesomeIcon
        icon={filters.sortDir === 'desc' ? faArrowDown : faArrowUp}
        className="h-2.5 w-2.5 text-cyan-400"
      />
    );
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <FontAwesomeIcon icon={faBolt} className="h-4 w-4 text-amber-400" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <CardTitle className="text-lg">Active Paper Trades</CardTitle>
            <Badge className="bg-amber-500/[0.12] text-amber-400 border-amber-500/[0.15] text-[10px]">
              {trades.length}/{ROVER_STRATEGY.maxConcurrent}
            </Badge>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="relative flex-1 min-w-[140px]">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/30"
            />
            <input
              type="text"
              placeholder="Search pair..."
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30 transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {(['ALL', 'LONG', 'SHORT'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilters(prev => ({ ...prev, signalType: type }))}
                className={`h-8 px-3 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                  filters.signalType === type
                    ? type === 'LONG'
                      ? 'bg-emerald-500/[0.15] text-emerald-400 border border-emerald-500/[0.2]'
                      : type === 'SHORT'
                      ? 'bg-red-500/[0.15] text-red-400 border border-red-500/[0.2]'
                      : 'bg-white/[0.08] text-white/80 border border-white/[0.12]'
                    : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {filteredTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
              <FontAwesomeIcon icon={faBolt} className="h-5 w-5 text-white/20" />
            </div>
            <p className="text-sm text-white/40">No active paper trades</p>
            <p className="text-[11px] text-white/25 mt-1">Scanner will open trades when signals are detected</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[520px] custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background/95 backdrop-blur-md z-10">
                <tr className="border-b border-white/[0.06]">
                  <th
                    className="text-left py-2 px-2 text-white/40 font-medium cursor-pointer hover:text-white/60 transition-colors"
                    onClick={() => toggleSort('symbol')}
                  >
                    <span className="flex items-center gap-1">Pair <SortIcon col="symbol" /></span>
                  </th>
                  <th className="text-center py-2 px-2 text-white/40 font-medium">Dir</th>
                  <th
                    className="text-right py-2 px-2 text-white/40 font-medium cursor-pointer hover:text-white/60 transition-colors"
                    onClick={() => toggleSort('price')}
                  >
                    <span className="flex items-center justify-end gap-1">Entry <SortIcon col="price" /></span>
                  </th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium">Current</th>
                  <th
                    className="text-right py-2 px-2 text-white/40 font-medium cursor-pointer hover:text-white/60 transition-colors"
                    onClick={() => toggleSort('pnl')}
                  >
                    <span className="flex items-center justify-end gap-1">P&L <SortIcon col="pnl" /></span>
                  </th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium">
                    <span className="flex items-center justify-end gap-1">
                      <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" /> Hold
                    </span>
                  </th>
                  <th className="text-center py-2 px-2 text-white/40 font-medium">
                    <span className="flex items-center justify-center gap-1">
                      <FontAwesomeIcon icon={faShieldHalved} className="h-2.5 w-2.5" /> SL/TP
                    </span>
                  </th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium w-[50px]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => {
                  const { pnlPercent, pnlDollar } = calculatePnl(trade);
                  const isProfit = pnlPercent >= 0;
                  const holdTime = getHoldTime(trade.openedAt);

                  return (
                    <tr
                      key={trade.id}
                      className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors duration-150"
                    >
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white/90">
                            {trade.symbol.replace('USDT', '')}
                          </span>
                          <span className="text-white/25 text-[10px]">USDT</span>
                          <Badge className="bg-amber-500/[0.1] text-amber-400/80 border-amber-500/[0.12] text-[9px] px-1.5 py-0">
                            {ROVER_STRATEGY.leverage}x
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Badge className={`text-[10px] gap-1 ${
                          trade.direction === 'LONG'
                            ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]'
                            : 'bg-red-500/[0.12] text-red-400 border-red-500/[0.15]'
                        }`}>
                          <FontAwesomeIcon
                            icon={trade.direction === 'LONG' ? faArrowUp : faArrowDown}
                            className="h-2 w-2"
                          />
                          {trade.direction === 'LONG' ? '🟢' : '🔴'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-white/60 text-[11px]">
                        ${formatPrice(trade.entryPrice)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-white/80">
                        ${formatPrice(trade.currentPrice)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%
                          </span>
                          <span className={`text-[10px] font-mono ${isProfit ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                            {isProfit ? '+' : ''}${pnlDollar.toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-[11px] text-white/50 font-mono">
                        {holdTime}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-red-400/70">SL {trade.stopLossPercent}%</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className={trade.tp1Hit ? 'text-emerald-400' : 'text-white/30'}>
                              {trade.tp1Hit ? '✓' : ''} TP1
                            </span>
                            <span className={trade.tp2Hit ? 'text-emerald-400' : 'text-white/30'}>
                              {trade.tp2Hit ? '✓' : ''} TP2
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseTrade(trade.id);
                          }}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-red-400 hover:bg-red-500/[0.12] hover:border-red-500/[0.2] transition-all duration-200"
                          title={`Close trade ${trade.symbol}`}
                        >
                          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.001) return price.toFixed(4);
  return price.toFixed(8);
}
