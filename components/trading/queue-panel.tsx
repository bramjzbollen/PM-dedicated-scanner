'use client';

import { QueueItem, QUEUE_EXPIRY_MS, formatDuration } from '@/lib/trading-engine';
import { cn } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faClock, faArrowTrendUp, faArrowTrendDown } from '@fortawesome/free-solid-svg-icons';

interface QueuePanelProps {
  queue: QueueItem[];
  color: 'cyan' | 'violet';
}

export function QueuePanel({ queue, color }: QueuePanelProps) {
  if (queue.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-white/20 text-sm">
        <FontAwesomeIcon icon={faList} className="h-4 w-4 mr-2" />
        Queue is empty
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {queue.map((item, idx) => {
        const age = Date.now() - new Date(item.queuedAt).getTime();
        const remaining = QUEUE_EXPIRY_MS - age;
        const isExpiring = remaining < 60000;
        const isLong = item.direction === 'LONG';

        return (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg',
              'bg-white/[0.02] border border-white/[0.04]',
              isExpiring && 'border-amber-500/20 bg-amber-500/[0.03]',
            )}
          >
            {/* FIFO position */}
            <span className="text-[10px] text-white/20 font-mono w-5">#{idx + 1}</span>

            {/* Direction */}
            <span className={cn(
              'text-xs font-bold px-1.5 py-0.5 rounded',
              isLong ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10',
            )}>
              <FontAwesomeIcon icon={isLong ? faArrowTrendUp : faArrowTrendDown} className="h-2.5 w-2.5 mr-1" />
              {item.direction}
            </span>

            {/* Symbol */}
            <span className="text-sm font-medium text-white/80">{item.symbol}</span>

            {/* Confidence */}
            <span className={cn(
              'text-[10px] font-mono px-1.5 py-0.5 rounded',
              item.confidence >= 80 ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10',
            )}>
              {item.confidence}%
            </span>

            {/* Timer */}
            <div className="ml-auto flex items-center gap-1.5">
              <FontAwesomeIcon icon={faClock} className={cn('h-2.5 w-2.5', isExpiring ? 'text-amber-400' : 'text-white/30')} />
              <span className={cn('text-[10px] font-mono', isExpiring ? 'text-amber-400' : 'text-white/30')}>
                {remaining > 0 ? formatDuration(remaining) : 'expiring...'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
