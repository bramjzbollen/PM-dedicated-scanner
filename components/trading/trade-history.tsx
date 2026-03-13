'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ClosedTrade } from '@/lib/scanner-types';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClockRotateLeft,
  faArrowUp,
  faArrowDown,
  faTrophy,
  faChartLine,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons';

interface TradeHistoryProps {
  trades: ClosedTrade[];
}

export function TradeHistory({ trades }: TradeHistoryProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnlDollar, 0);
  const wins = trades.filter(t => t.pnlPercent > 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  const getReasonLabel = (reason: ClosedTrade['closeReason']) => {
    switch (reason) {
      // Engine-produced reasons (primary)
      case 'tp': return 'TP';
      case 'sl': return 'SL';
      case 'trailing': return 'TRAIL';
      case 'timeout': return 'TIME';
      case 'manual': return 'MAN';
      // Swing partial reasons
      case 'tp1': return 'TP1';
      case 'tp2': return 'TP2';
      // Legacy aliases
      case 'stop_loss': return 'SL';
      case 'max_hold': return 'TIME';
      case 'take_profit': return 'TP';
      default: return reason ?? '?';
    }
  };

  const getReasonStyle = (reason: ClosedTrade['closeReason']) => {
    switch (reason) {
      case 'tp':
      case 'tp1':
      case 'tp2':
      case 'take_profit':
        return 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]';
      case 'sl':
      case 'stop_loss':
        return 'bg-red-500/[0.12] text-red-400 border-red-500/[0.15]';
      case 'trailing':
        return 'bg-amber-500/[0.12] text-amber-400 border-amber-500/[0.15]';
      case 'timeout':
      case 'max_hold':
        return 'bg-orange-500/[0.12] text-orange-400 border-orange-500/[0.15]';
      case 'manual':
        return 'bg-white/[0.06] text-white/50 border-white/[0.08]';
      default:
        return 'bg-white/[0.04] text-white/40 border-white/[0.06]';
    }
  };

  const getDuration = (opened: Date, closed: Date) => {
    const seconds = Math.floor((closed.getTime() - opened.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faClockRotateLeft} className="h-4 w-4 text-blue-400" />
            <CardTitle className="text-lg">Trade History</CardTitle>
            <Badge className="bg-blue-500/[0.12] text-blue-400 border-blue-500/[0.15] text-[10px]">
              {trades.length} trades
            </Badge>
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-all duration-200"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <FontAwesomeIcon
              icon={isCollapsed ? faChevronDown : faChevronUp}
              className="h-3 w-3"
            />
          </button>
        </div>

        {/* Summary stats */}
        <div className={`flex gap-4 mt-3 ${isCollapsed ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <FontAwesomeIcon icon={faChartLine} className="h-3 w-3 text-white/40" />
            <span className="text-[11px] text-white/50">Total P&L:</span>
            <span className={`text-[11px] font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <FontAwesomeIcon icon={faTrophy} className="h-3 w-3 text-white/40" />
            <span className="text-[11px] text-white/50">Win Rate:</span>
            <span className={`text-[11px] font-bold font-mono ${winRate >= 55 ? 'text-emerald-400' : winRate >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
              {winRate.toFixed(1)}%
            </span>
            <span className="text-[10px] text-white/30">({wins}/{trades.length})</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className={`pt-0 ${isCollapsed ? 'hidden' : ''}`}>
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
              <FontAwesomeIcon icon={faClockRotateLeft} className="h-5 w-5 text-white/20" />
            </div>
            <p className="text-sm text-white/40">No closed trades yet</p>
            <p className="text-[11px] text-white/25 mt-1">Trades will appear here when closed</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[400px] custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background/95 backdrop-blur-md z-10">
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2 px-2 text-white/40 font-medium">Symbol</th>
                  <th className="text-center py-2 px-2 text-white/40 font-medium">Dir</th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium">Entry</th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium">Exit</th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium">P&L %</th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium">P&L $</th>
                  <th className="text-right py-2 px-2 text-white/40 font-medium">Duration</th>
                  <th className="text-center py-2 px-2 text-white/40 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const isProfit = trade.pnlPercent > 0;

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
                            {trade.leverage}x
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
                          {trade.direction}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-white/60 text-[11px]">
                        ${formatPrice(trade.entryPrice)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-white/80 text-[11px]">
                        ${formatPrice(trade.exitPrice)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isProfit ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={`font-mono text-[11px] ${isProfit ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                          {isProfit ? '+' : ''}${trade.pnlDollar.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-[11px] text-white/50 font-mono">
                        {getDuration(trade.openedAt, trade.closedAt)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Badge className={`text-[9px] ${getReasonStyle(trade.closeReason)}`}>
                          {getReasonLabel(trade.closeReason)}
                        </Badge>
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
