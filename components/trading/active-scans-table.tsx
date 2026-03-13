'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ScannerSignal, ScannerFilters, IndicatorToggles } from '@/lib/scanner-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faFilter,
  faArrowUp,
  faArrowDown,
  faCircle,
  faSatelliteDish,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'sonner';

interface ActiveScansTableProps {
  signals: ScannerSignal[];
  onCloseTrade?: (signal: ScannerSignal) => void;
  disabledIndicators?: IndicatorToggles;
}

export function ActiveScansTable({ signals, onCloseTrade }: ActiveScansTableProps) {
  const [filters, setFilters] = useState<ScannerFilters>({
    search: '',
    signalType: 'ALL',
    minConfidence: 0,
    sortBy: 'confidence',
    sortDir: 'desc',
  });

  const filteredSignals = useMemo(() => {
    let result = [...signals];

    // Search
    if (filters.search) {
      const q = filters.search.toUpperCase();
      result = result.filter(s => s.symbol.includes(q));
    }

    // Signal type
    if (filters.signalType !== 'ALL') {
      result = result.filter(s => s.type === filters.signalType);
    }

    // Min confidence
    if (filters.minConfidence > 0) {
      result = result.filter(s => s.confidence >= filters.minConfidence);
    }

    // Sort
    result.sort((a, b) => {
      const dir = filters.sortDir === 'desc' ? -1 : 1;
      switch (filters.sortBy) {
        case 'confidence': return (a.confidence - b.confidence) * dir;
        case 'volumeRatio': return (a.volumeRatio - b.volumeRatio) * dir;
        case 'symbol': return a.symbol.localeCompare(b.symbol) * dir;
        case 'price': return (a.price - b.price) * dir;
        default: return 0;
      }
    });

    return result;
  }, [signals, filters]);

  const toggleSort = (col: ScannerFilters['sortBy']) => {
    setFilters(prev => ({
      ...prev,
      sortBy: col,
      sortDir: prev.sortBy === col && prev.sortDir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleCloseTrade = (signal: ScannerSignal) => {
    // Mock P&L calculation
    const pnlPercent = (Math.random() - 0.4) * 2; // Slight positive bias
    const pnlDisplay = pnlPercent >= 0 ? `+${pnlPercent.toFixed(2)}%` : `${pnlPercent.toFixed(2)}%`;

    onCloseTrade?.(signal);

    toast.success(
      `Trade closed: ${signal.symbol}`,
      {
        description: `P&L: ${pnlDisplay}`,
        style: {
          background: 'rgba(15, 15, 25, 0.95)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(12px)',
        },
        descriptionClassName: pnlPercent >= 0 ? '!text-emerald-400' : '!text-red-400',
      }
    );
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
              <FontAwesomeIcon icon={faSatelliteDish} className="h-4 w-4 text-cyan-400" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <CardTitle className="text-lg">Active Scans</CardTitle>
            <Badge className="bg-cyan-500/[0.12] text-cyan-400 border-cyan-500/[0.15] text-[10px]">
              LIVE
            </Badge>
          </div>
          <span className="text-xs text-white/40">{filteredSignals.length} pairs</span>
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
                <th
                  className="text-right py-2 px-2 text-white/40 font-medium cursor-pointer hover:text-white/60 transition-colors"
                  onClick={() => toggleSort('price')}
                >
                  <span className="flex items-center justify-end gap-1">Price <SortIcon col="price" /></span>
                </th>
                <th className="text-center py-2 px-2 text-white/40 font-medium">Signal</th>
                <th className="text-right py-2 px-2 text-white/40 font-medium">Stoch RSI</th>
                <th
                  className="text-right py-2 px-2 text-white/40 font-medium cursor-pointer hover:text-white/60 transition-colors"
                  onClick={() => toggleSort('volumeRatio')}
                >
                  <span className="flex items-center justify-end gap-1">Vol Ratio <SortIcon col="volumeRatio" /></span>
                </th>
                <th
                  className="text-right py-2 px-2 text-white/40 font-medium cursor-pointer hover:text-white/60 transition-colors"
                  onClick={() => toggleSort('confidence')}
                >
                  <span className="flex items-center justify-end gap-1">Confidence <SortIcon col="confidence" /></span>
                </th>
                {onCloseTrade && (
                  <th className="text-right py-2 px-2 text-white/40 font-medium w-[50px]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredSignals.map((signal) => (
                <tr
                  key={signal.id}
                  className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors duration-150"
                >
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white/90">
                        {signal.symbol.replace('USDT', '')}
                      </span>
                      <span className="text-white/25 text-[10px]">USDT</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-white/80">
                    ${formatPrice(signal.price)}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <SignalBadge type={signal.type} />
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <div className="flex flex-col items-end">
                      <span className={`font-mono ${
                        signal.stochRSI_K < 20 ? 'text-emerald-400' :
                        signal.stochRSI_K > 80 ? 'text-red-400' :
                        'text-white/60'
                      }`}>
                        {signal.stochRSI_K.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-white/30">D: {signal.stochRSI_D.toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <span className={`font-mono ${
                      signal.volumeRatio >= 1.5 ? 'text-amber-400' : 'text-white/50'
                    }`}>
                      {signal.volumeRatio.toFixed(2)}×
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <ConfidenceBar value={signal.confidence} />
                  </td>
                  {onCloseTrade && (
                    <td className="py-2.5 px-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseTrade(signal);
                        }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-red-400 hover:bg-red-500/[0.12] hover:border-red-500/[0.2] transition-all duration-200"
                        title={`Close trade ${signal.symbol}`}
                      >
                        <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalBadge({ type }: { type: 'LONG' | 'SHORT' | 'NEUTRAL' }) {
  const styles = {
    LONG: 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]',
    SHORT: 'bg-red-500/[0.12] text-red-400 border-red-500/[0.15]',
    NEUTRAL: 'bg-white/[0.06] text-white/40 border-white/[0.08]',
  };
  const icons = {
    LONG: faArrowUp,
    SHORT: faArrowDown,
    NEUTRAL: faCircle,
  };

  return (
    <Badge className={`${styles[type]} text-[10px] gap-1`}>
      <FontAwesomeIcon icon={icons[type]} className="h-2 w-2" />
      {type}
    </Badge>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const getColor = (v: number) => {
    if (v >= 75) return 'from-emerald-400 to-cyan-400';
    if (v >= 50) return 'from-amber-400 to-yellow-400';
    if (v >= 25) return 'from-orange-400 to-amber-400';
    return 'from-red-400 to-orange-400';
  };

  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${getColor(value)} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`font-mono text-[11px] min-w-[28px] text-right ${
        value >= 75 ? 'text-emerald-400' :
        value >= 50 ? 'text-amber-400' :
        'text-white/40'
      }`}>
        {value}%
      </span>
    </div>
  );
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.001) return price.toFixed(4);
  return price.toFixed(8);
}
