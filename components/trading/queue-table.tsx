'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { QueuedSignal } from '@/lib/scanner-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLayerGroup,
  faArrowUp,
  faArrowDown,
  faClock,
} from '@fortawesome/free-solid-svg-icons';

interface QueueTableProps {
  queue: QueuedSignal[];
}

export function QueueTable({ queue }: QueueTableProps) {
  const sortedQueue = [...queue].sort((a, b) => b.priority - a.priority);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-violet-400" />
            <CardTitle className="text-lg">Signal Queue</CardTitle>
            {queue.length > 0 && (
              <Badge className="bg-violet-500/[0.12] text-violet-400 border-violet-500/[0.15] text-[10px]">
                {queue.length}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-[11px] text-white/35 mt-1">
          Pending signals when max 50 trades reached
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        {sortedQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
              <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5 text-white/20" />
            </div>
            <p className="text-sm text-white/40">Queue is empty</p>
            <p className="text-[11px] text-white/25 mt-1">
              Signals queue here when 50 trades are active
            </p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto max-h-[640px] custom-scrollbar pr-1">
            {sortedQueue.map((signal, idx) => (
              <div
                key={signal.id}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all duration-200 hover:bg-white/[0.05] hover:border-white/[0.1]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/20 w-4">#{idx + 1}</span>
                    <span className="font-semibold text-sm text-white/90">
                      {signal.symbol.replace('USDT', '')}
                    </span>
                    <Badge className={`text-[10px] gap-1 ${
                      signal.type === 'LONG'
                        ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]'
                        : 'bg-red-500/[0.12] text-red-400 border-red-500/[0.15]'
                    }`}>
                      <FontAwesomeIcon
                        icon={signal.type === 'LONG' ? faArrowUp : faArrowDown}
                        className="h-2 w-2"
                      />
                      {signal.type}
                    </Badge>
                  </div>
                  <span className={`text-xs font-bold ${
                    signal.confidence >= 75 ? 'text-emerald-400' :
                    signal.confidence >= 50 ? 'text-amber-400' :
                    'text-white/50'
                  }`}>
                    {signal.confidence}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-3">
                    <span className="text-white/40">
                      Entry: <span className="text-white/60 font-mono">${formatPrice(signal.entryPrice)}</span>
                    </span>
                    <span className="text-white/40">
                      Vol: <span className={`font-mono ${signal.volumeRatio >= 1.5 ? 'text-amber-400' : 'text-white/50'}`}>
                        {signal.volumeRatio.toFixed(2)}×
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-white/30">
                    <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" />
                    <span>{getTimeAgo(signal.queuedAt)}</span>
                  </div>
                </div>

                {/* Priority bar */}
                <div className="mt-2 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-400 transition-all duration-500"
                    style={{ width: `${signal.priority}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.001) return price.toFixed(4);
  return price.toFixed(8);
}
