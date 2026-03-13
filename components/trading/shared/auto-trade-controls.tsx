'use client';

import { Card, CardContent } from '@/components/ui/card';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faRotateRight, faStop, faXmark } from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';
import { cn } from '@/lib/utils';

interface AutoTradeControlsProps {
  mode: 'scalping' | 'swing';
  isRunning: boolean;
  positionCount: number;
  config: { minConfidence: number; autoEntry: boolean; queueEnabled: boolean; maxPositions: number };
  confirmReset: boolean;
  confirmCloseAll: boolean;
  showQueueToggle?: boolean;
  onStart: () => void;
  onStop: () => void;
  onCloseAll: () => void;
  onReset: () => void;
  onConfirmCloseAll: (v: boolean) => void;
  onConfirmReset: (v: boolean) => void;
  onUpdateConfig: (updates: Record<string, unknown>) => void;
}

export function AutoTradeControls({
  mode,
  isRunning,
  positionCount,
  config,
  confirmReset,
  confirmCloseAll,
  onStart,
  onStop,
  onCloseAll,
  onReset,
  onConfirmCloseAll,
  onConfirmReset,
  onUpdateConfig,
  showQueueToggle = true,
}: AutoTradeControlsProps) {
  const isScalp = mode === 'scalping';

  return (
    <Card className="hover:-translate-y-0">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={onStop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25"
              >
                <FontAwesomeIcon icon={faStop} className="h-3 w-3" />
                Stop Engine
              </button>
            ) : (
              <button
                onClick={onStart}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                  isScalp
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/25'
                    : 'bg-amber-500/15 text-amber-400 border-amber-500/20 hover:bg-amber-500/25',
                )}
              >
                <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                Start Engine
              </button>
            )}
            {isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <PulsingDot status="online" />
                Running
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider whitespace-nowrap">
              Min Conf:{' '}
              <span className={cn('font-mono', isScalp ? 'text-cyan-400' : 'text-amber-400')}>
                {config.minConfidence}%
              </span>
            </label>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={config.minConfidence}
              onChange={e => onUpdateConfig({ minConfidence: parseInt(e.target.value) })}
              className={cn('w-24 h-1.5 rounded-lg appearance-none bg-white/10', isScalp ? 'accent-cyan-500' : 'accent-amber-500')}
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoEntry}
              onChange={e => onUpdateConfig({ autoEntry: e.target.checked })}
              className={cn('w-3.5 h-3.5 rounded bg-white/10 border-white/20', isScalp ? 'accent-cyan-500' : 'accent-amber-500')}
            />
            <span className="text-[10px] text-white/50">Auto Entry</span>
          </label>

          {showQueueToggle && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.queueEnabled}
                onChange={e => onUpdateConfig({ queueEnabled: e.target.checked })}
                className={cn('w-3.5 h-3.5 rounded bg-white/10 border-white/20', isScalp ? 'accent-cyan-500' : 'accent-amber-500')}
              />
              <span className="text-[10px] text-white/50">Queue</span>
            </label>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {confirmCloseAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">Close all {positionCount} positions?</span>
                <button onClick={onCloseAll} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30">
                  Confirm
                </button>
                <button onClick={() => onConfirmCloseAll(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 hover:text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onConfirmCloseAll(true)}
                disabled={positionCount === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  'bg-red-500/10 text-red-400/60 border border-red-500/10 hover:bg-red-500/20 hover:text-red-400',
                  positionCount === 0 && 'opacity-30 cursor-not-allowed',
                )}
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                Close All
              </button>
            )}

            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">Reset everything?</span>
                <button onClick={onReset} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30">
                  Confirm
                </button>
                <button onClick={() => onConfirmReset(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 hover:text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onConfirmReset(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/5 text-white/40 border border-white/[0.06] hover:bg-white/10 hover:text-white/60"
              >
                <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                Reset Wallet
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
