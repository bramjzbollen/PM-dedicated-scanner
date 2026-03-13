'use client';

import { Position, formatDuration, getPositionStatus, calcPnl, calcPartialPnl } from '@/lib/trading-engine';
import { cn } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faArrowTrendUp, faArrowTrendDown, faClock } from '@fortawesome/free-solid-svg-icons';

interface PositionCardProps {
  position: Position;
  onClose: (id: string) => void;
  color: 'cyan' | 'violet';
}

export function PositionCard({ position: pos, onClose, color }: PositionCardProps) {
  const isLong = pos.direction === 'LONG';
  const { pnl, pnlPercent } = calcPnl(pos, pos.currentPrice);
  const totalPnl = pnl + calcPartialPnl(pos);
  const duration = Date.now() - new Date(pos.openedAt).getTime();
  const status = getPositionStatus(pos, pos.currentPrice);
  const pnlColor = totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-white/60';
  const dirColor = isLong ? 'text-emerald-400' : 'text-red-400';
  const dirBg = isLong ? 'bg-emerald-500/10' : 'bg-red-500/10';

  const statusColors: Record<string, string> = {
    'Active': 'text-white/50 bg-white/5',
    'Trailing': 'text-amber-400 bg-amber-500/10',
    'Near TP': 'text-emerald-400 bg-emerald-500/10',
    'Near SL': 'text-red-400 bg-red-500/10',
  };

  return (
    <div className={cn(
      'group relative flex items-center gap-3 px-3 py-2 rounded-xl',
      'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]',
      'transition-all duration-200',
    )}>
      {/* Direction badge */}
      <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold', dirBg, dirColor)}>
        <FontAwesomeIcon icon={isLong ? faArrowTrendUp : faArrowTrendDown} className="h-3 w-3" />
        {pos.direction}
      </div>

      {/* Symbol */}
      <div className="min-w-[90px]">
        <div className="text-sm font-semibold text-white/90">{pos.symbol}</div>
        <div className="text-[10px] text-white/30 flex items-center gap-1">
          <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" />
          {formatDuration(duration)}
        </div>
      </div>

      {/* Entry / Current price */}
      <div className="hidden sm:block min-w-[100px]">
        <div className="text-[10px] text-white/30">Entry</div>
        <div className="text-xs font-mono text-white/70">${pos.entryPrice.toFixed(pos.entryPrice < 1 ? 6 : 2)}</div>
      </div>
      <div className="hidden sm:block min-w-[100px]">
        <div className="text-[10px] text-white/30">Current</div>
        <div className="text-xs font-mono text-white/70">${pos.currentPrice.toFixed(pos.currentPrice < 1 ? 6 : 2)}</div>
      </div>

      {/* P&L */}
      <div className="min-w-[80px]">
        <div className={cn('text-sm font-bold font-mono', pnlColor)}>
          {totalPnl > 0 ? '+' : ''}{totalPnl.toFixed(2)}$
        </div>
        <div className={cn('text-[10px] font-mono', pnlColor)}>
          {pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
        </div>
      </div>

      {/* SL/TP */}
      <div className="hidden md:block min-w-[80px]">
        <div className="text-[10px] text-red-400/70">SL: ${pos.stopLoss.toFixed(pos.stopLoss < 1 ? 6 : 2)}</div>
        <div className="text-[10px] text-emerald-400/70">TP: ${pos.takeProfit.toFixed(pos.takeProfit < 1 ? 6 : 2)}</div>
        {pos.trailingStop && (
          <div className="text-[10px] text-amber-400/70">TS: ${pos.trailingStop.toFixed(pos.trailingStop < 1 ? 6 : 2)}</div>
        )}
      </div>

      {/* Status */}
      <div className={cn('px-2 py-0.5 rounded text-[10px] font-medium', statusColors[status] || 'text-white/50 bg-white/5')}>
        {status}
      </div>

      {/* Partial closes indicator */}
      {pos.partialCloses.length > 0 && (
        <div className="text-[10px] text-violet-400/70">
          {pos.partialCloses.length}x partial
        </div>
      )}

      {/* Close button */}
      <button
        onClick={() => onClose(pos.id)}
        className={cn(
          'ml-auto p-1.5 rounded-lg opacity-40 group-hover:opacity-100',
          'hover:bg-red-500/20 hover:text-red-400',
          'transition-all duration-200',
        )}
        title="Close position"
      >
        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
