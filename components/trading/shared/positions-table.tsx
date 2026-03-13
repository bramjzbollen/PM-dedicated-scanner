'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

type SortField = 'pnl' | 'duration' | 'symbol';

interface PositionsTableProps {
  color: 'cyan' | 'amber';
  currentCount: number;
  maxPositions: number;
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
  onToggleSort: (field: SortField) => void;
  children: ReactNode;
}

export function PositionsTable({
  color,
  currentCount,
  maxPositions,
  sortBy,
  sortDir,
  onToggleSort,
  children,
}: PositionsTableProps) {
  const colorClass = color === 'cyan' ? 'text-cyan-400' : 'text-amber-400';
  const activeSortClass = color === 'cyan' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400';

  return (
    <Card className="hover:-translate-y-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faLayerGroup} className={cn('h-4 w-4', colorClass)} />
            Open Positions
            <Badge variant="secondary" className="ml-2 text-xs">
              {currentCount}/{maxPositions}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            {(['pnl', 'duration', 'symbol'] as const).map(field => (
              <button
                key={field}
                onClick={() => onToggleSort(field)}
                className={cn(
                  'px-2 py-1 rounded text-[10px] font-medium transition-all',
                  sortBy === field ? activeSortClass : 'text-white/30 hover:text-white/50',
                )}
              >
                {field.charAt(0).toUpperCase() + field.slice(1)}
                {sortBy === field && (
                  <FontAwesomeIcon
                    icon={sortDir === 'desc' ? faChevronDown : faChevronUp}
                    className="h-2 w-2 ml-1"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}
