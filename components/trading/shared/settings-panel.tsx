'use client';

import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faGear, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  mode: 'scalping' | 'swing';
  show: boolean;
  activeCount: number;
  onToggle: () => void;
  onReset: () => void;
  children: ReactNode;
}

export function SettingsPanel({ mode, show, activeCount, onToggle, onReset, children }: SettingsPanelProps) {
  const isScalp = mode === 'scalping';
  const timeframe = isScalp ? '1m Timeframe' : '15m Timeframe';
  const activeBtn = isScalp
    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
    : 'bg-amber-500/15 text-amber-400 border border-amber-500/20';

  return (
    <Card className={cn('hover:-translate-y-0', isScalp ? 'border-cyan-500/[0.1]' : 'border-amber-500/[0.1]')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className={cn('p-1.5 rounded-xl', isScalp ? 'bg-cyan-500/[0.1]' : 'bg-amber-500/[0.1]')}>
              <FontAwesomeIcon icon={faGear} className={cn('h-3.5 w-3.5', isScalp ? 'text-cyan-400' : 'text-amber-400')} />
            </div>
            <span>Scanner Settings</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] border',
                isScalp ? 'text-cyan-400/60 border-cyan-500/20' : 'text-amber-400/60 border-amber-500/20',
              )}
            >
              {timeframe}
            </Badge>
            <span className="text-[10px] text-white/25">{activeCount}/4 indicators</span>
          </CardTitle>
          <button
            onClick={onToggle}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              show ? activeBtn : 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.06]',
            )}
          >
            <FontAwesomeIcon icon={show ? faChevronUp : faChevronDown} className="h-3 w-3" />
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </CardHeader>

      {show && (
        <CardContent className="pt-0 space-y-5">
          {children}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
            <button
              onClick={onReset}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all text-xs"
            >
              <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />
              Reset to defaults
            </button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
