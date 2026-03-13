'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowTrendDown, faArrowTrendUp, faClock, faList, faPlus } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { formatDuration, QUEUE_EXPIRY_MS } from '@/lib/trading-engine';

interface QueueItem {
  id: string;
  direction: 'LONG' | 'SHORT';
  symbol: string;
  confidence: number;
  price: number;
  queuedAt: string;
}

interface SignalQueueProps {
  mode: 'scalping' | 'swing';
  queue: QueueItem[];
  positionsCount: number;
  maxPositions: number;
  maxLabel?: string;
  onManualEntry: (id: string) => void;
}

export function SignalQueue({ mode, queue, positionsCount, maxPositions, maxLabel, onManualEntry }: SignalQueueProps) {
  const isScalp = mode === 'scalping';

  return (
    <Card className="hover:-translate-y-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FontAwesomeIcon icon={faList} className={cn('h-4 w-4', isScalp ? 'text-cyan-400' : 'text-amber-400')} />
          Queue
          <Badge variant="secondary" className="ml-2 text-xs">
            {maxLabel ? `${queue.length}/${maxLabel}` : queue.length}
          </Badge>
          <span className="text-[9px] text-white/25 font-normal ml-1" title="Signals that passed filters but couldn't enter because max positions was reached. They auto-fill when a slot opens (FIFO, 5min expiry).">
            ℹ️ waiting for slot
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-white/20 text-sm">
            <FontAwesomeIcon icon={faList} className="h-4 w-4 mr-2" />
            Queue is empty
          </div>
        ) : (
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
                  <span className="text-[10px] text-white/20 font-mono w-5">#{idx + 1}</span>
                  <span className={cn(
                    'text-xs font-bold px-1.5 py-0.5 rounded',
                    isLong ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10',
                  )}>
                    <FontAwesomeIcon icon={isLong ? faArrowTrendUp : faArrowTrendDown} className="h-2.5 w-2.5 mr-1" />
                    {item.direction}
                  </span>
                  <span className="text-sm font-medium text-white/80">{item.symbol}</span>
                  <span className={cn(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded',
                    item.confidence >= 80 ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10',
                  )}>
                    {item.confidence}%
                  </span>
                  <span className="text-[10px] font-mono text-white/30">
                    ${item.price.toFixed(item.price < 1 ? 6 : 2)}
                  </span>

                  <button
                    onClick={() => onManualEntry(item.id)}
                    disabled={positionsCount >= maxPositions}
                    className={cn(
                      'ml-auto px-2 py-1 rounded text-[10px] font-medium transition-all',
                      isScalp
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20',
                      positionsCount >= maxPositions && 'opacity-30 cursor-not-allowed',
                    )}
                    title="Open position manually"
                  >
                    <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5 mr-1" />
                    Enter
                  </button>

                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faClock} className={cn('h-2.5 w-2.5', isExpiring ? 'text-amber-400' : 'text-white/30')} />
                    <span className={cn('text-[10px] font-mono', isExpiring ? 'text-amber-400' : 'text-white/30')}>
                      {remaining > 0 ? formatDuration(remaining) : 'expiring...'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
