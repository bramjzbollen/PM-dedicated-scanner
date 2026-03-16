'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Types ────────────────────────────────────────────────
export type V4Signal = {
  event: string;
  symbol: string;
  marketKey: string;
  timeframeMinutes: number;
  side: 'UP' | 'DOWN' | null;
  confidence: number;
  reason: string;
  skipTrade: boolean;
  edge?: number;
  pmOdds?: { up: number; down: number };
  pmSpread?: number;
  kelly?: { fullKellyPct: number; recommendedPct: number; edge: number; worthBetting: boolean };
  oraclePrice?: number;
  bybitPrice?: number;
  timeToSettle?: number;
  trend?: string;
  momentum?: number;
  volatility?: number;
  velocity?: { direction: string; strength: number; projected: number };
  flashCrash?: any;
  probUp?: number;
  probDown?: number;
};

type EventInfo = {
  marketKey: string;
  label: string;
  symbol: string;
  suggestedSide: string;
  confidence: number;
  reason: string;
  countdownSec: number;
  activeBetId?: string;
};

type Props = {
  event: EventInfo;
  v4?: V4Signal;
  enabled: boolean;
  stale: boolean;
  onToggle: () => void;
  onRemove: () => void;
  sparkline?: React.ReactNode;
  timeframe: string;
};

// ── Helpers ──────────────────────────────────────────────
const COIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  BTC: { bg: 'rgba(247,147,26,0.15)', border: 'rgba(247,147,26,0.4)', text: '#F7931A' },
  ETH: { bg: 'rgba(98,126,234,0.15)', border: 'rgba(98,126,234,0.4)', text: '#627EEA' },
  SOL: { bg: 'rgba(153,69,255,0.15)', border: 'rgba(153,69,255,0.4)', text: '#9945FF' },
  XRP: { bg: 'rgba(0,170,228,0.15)', border: 'rgba(0,170,228,0.4)', text: '#00AAE4' },
  BNB: { bg: 'rgba(243,186,47,0.15)', border: 'rgba(243,186,47,0.4)', text: '#F3BA2F' },
};

function CoinBadge({ symbol }: { symbol: string }) {
  const coin = symbol.replace('/USDT', '');
  const colors = COIN_COLORS[coin] || { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)', text: '#8B5CF6' };
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 select-none"
      style={{ backgroundColor: colors.bg, border: `1.5px solid ${colors.border}`, color: colors.text }}
    >
      {coin}
    </div>
  );
}

function OddsButton({ label, odds, active, variant, edge }: {
  label: string;
  odds?: number;
  active: boolean;
  variant: 'up' | 'down';
  edge?: string | null;
}) {
  const isUp = variant === 'up';
  return (
    <div
      className={cn(
        'relative rounded-xl border px-3 py-3 text-center transition-all duration-200 select-none',
        active
          ? isUp
            ? 'border-emerald-500/50 bg-emerald-500/[0.12] shadow-[0_0_20px_rgba(16,185,129,0.06)]'
            : 'border-rose-500/50 bg-rose-500/[0.12] shadow-[0_0_20px_rgba(244,63,94,0.06)]'
          : 'border-white/[0.06] bg-white/[0.015]'
      )}
    >
      <div className={cn(
        'text-[9px] uppercase tracking-[0.1em] mb-1',
        active
          ? isUp ? 'text-emerald-400/80' : 'text-rose-400/80'
          : 'text-white/30'
      )}>
        {label}
      </div>
      <div className={cn(
        'text-xl font-bold font-mono leading-none',
        active
          ? isUp ? 'text-emerald-300' : 'text-rose-300'
          : 'text-white/25'
      )}>
        {odds != null ? `${(odds * 100).toFixed(0)}¢` : '—'}
      </div>
      {active && edge && (
        <div className={cn(
          'text-[9px] font-semibold mt-1.5',
          isUp ? 'text-emerald-400' : 'text-rose-400'
        )}>
          +{edge} edge
        </div>
      )}
    </div>
  );
}

function EdgeBar({ edge, hasEdge }: { edge: number; hasEdge: boolean }) {
  const pct = Math.min(100, edge * 400); // 25% edge = full bar
  return (
    <div>
      <div className="flex justify-between text-[9px] mb-1.5">
        <span className="text-white/35 uppercase tracking-wider">Edge</span>
        <span className={hasEdge ? 'text-emerald-400 font-semibold' : 'text-white/30'}>
          {(edge * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            hasEdge ? 'bg-gradient-to-r from-emerald-500/60 to-emerald-400/80' : 'bg-white/[0.06]'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatCountdown(sec: number): string {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Main Component ───────────────────────────────────────
export function PMEventCard({ event: e, v4, enabled, stale, onToggle, onRemove, sparkline, timeframe }: Props) {
  const isOpen = Boolean(e.activeBetId && e.countdownSec > 0);
  const isClosing = isOpen && e.countdownSec <= 120;
  const hasEdge = v4 != null && typeof v4.edge === 'number' && v4.edge >= 0.05;
  const edgePct = v4?.edge ? (v4.edge * 100).toFixed(1) + '%' : null;
  const kellyPct = v4?.kelly?.recommendedPct?.toFixed(1);
  const isV4 = e.reason?.includes('PM-V4');

  return (
    <Card className={cn(
      'group relative overflow-hidden transition-all duration-300',
      isOpen
        ? 'border-white/[0.12] bg-gradient-to-b from-white/[0.04] to-transparent shadow-lg shadow-white/[0.02]'
        : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03]'
    )}>
      <div className="p-4 space-y-3">

        {/* ── Header ─────────────────────────────── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <CoinBadge symbol={e.symbol} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white/90 leading-tight">
                {e.symbol.replace('/USDT', '')} {timeframe}
              </div>
              <div className="text-[10px] text-white/35 mt-0.5">{timeframe}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isOpen && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[8px] font-semibold gap-1 py-0',
                  isClosing
                    ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                    : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full animate-pulse',
                  isClosing ? 'bg-amber-400' : 'bg-emerald-400'
                )} />
                {isClosing ? 'CLOSING' : 'LIVE'}
              </Badge>
            )}
            {!isOpen && e.confidence > 0 && (
              <Badge variant="outline" className="text-[8px] border-cyan-500/30 text-cyan-300/80 bg-cyan-500/[0.06] py-0">
                SETTLED
              </Badge>
            )}
            {!isOpen && e.confidence === 0 && (
              <Badge variant="outline" className="text-[8px] border-white/10 text-white/30 py-0">
                IDLE
              </Badge>
            )}
            {isV4 && (
              <Badge variant="outline" className="text-[8px] border-violet-500/35 text-violet-300 bg-violet-500/[0.08] py-0 font-mono">
                V4
              </Badge>
            )}
          </div>
        </div>

        {/* ── Odds Buttons ───────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <OddsButton
            label="Up"
            odds={v4?.pmOdds?.up}
            active={e.suggestedSide === 'UP'}
            variant="up"
            edge={e.suggestedSide === 'UP' && hasEdge ? edgePct : null}
          />
          <OddsButton
            label="Down"
            odds={v4?.pmOdds?.down}
            active={e.suggestedSide === 'DOWN'}
            variant="down"
            edge={e.suggestedSide === 'DOWN' && hasEdge ? edgePct : null}
          />
        </div>

        {/* ── Edge + Meta ────────────────────────── */}
        {v4 && typeof v4.edge === 'number' && (
          <div className="space-y-2">
            <EdgeBar edge={v4.edge} hasEdge={hasEdge} />
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-white/30">
                {kellyPct ? `Kelly ${kellyPct}%` : ''}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-white/30 cursor-help">
                      conf {e.confidence}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px] text-[10px]">
                    {e.reason}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* ── Countdown + Sparkline ──────────────── */}
        {(isOpen || sparkline) && (
          <div className="flex items-center justify-between gap-2">
            {isOpen && (
              <div className={cn(
                'text-[11px] font-mono font-medium tabular-nums',
                isClosing ? 'text-amber-300' : 'text-white/60'
              )}>
                T-{formatCountdown(e.countdownSec)}
              </div>
            )}
            {sparkline && <div className="flex-1 min-w-0">{sparkline}</div>}
          </div>
        )}

        {/* ── Actions ────────────────────────────── */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.04]">
          <button
            type="button"
            onClick={onToggle}
            disabled={stale}
            className={cn(
              'flex-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all duration-200 disabled:opacity-30',
              enabled
                ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300/90 hover:bg-emerald-500/[0.15]'
                : 'border-white/10 bg-white/[0.02] text-white/40 hover:text-white/60'
            )}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={stale}
            className="px-2.5 py-1.5 rounded-lg border border-white/[0.06] text-white/25 text-[10px] hover:border-rose-500/30 hover:text-rose-300/70 hover:bg-rose-500/[0.06] transition-all duration-200 disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      </div>
    </Card>
  );
}
