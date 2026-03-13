'use client';

import type { ScannerStats } from '@/lib/scanner-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSatelliteDish,
  faBolt,
  faArrowTrendUp,
  faArrowTrendDown,
  faClock,
  faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';

interface ScannerStatsBarProps {
  stats: ScannerStats;
}

export function ScannerStatsBar({ stats }: ScannerStatsBarProps) {
  const tradeCapacity = (stats.activeTrades / stats.maxTrades) * 100;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Pairs Monitored */}
      <div className="rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-3 transition-all duration-200 hover:bg-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faSatelliteDish} className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Pairs</span>
        </div>
        <p className="text-xl font-bold text-white/90">{stats.totalPairsMonitored}</p>
        <p className="text-[10px] text-white/30">monitored</p>
      </div>

      {/* Active Trades */}
      <div className="rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-3 transition-all duration-200 hover:bg-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Active</span>
        </div>
        <div className="flex items-baseline gap-1">
          <p className="text-xl font-bold text-white/90">{stats.activeTrades}</p>
          <p className="text-xs text-white/40">/ {stats.maxTrades}</p>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${tradeCapacity}%`,
              background: tradeCapacity > 90
                ? 'linear-gradient(90deg, #f87171, #ef4444)'
                : tradeCapacity > 70
                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                : 'linear-gradient(90deg, #34d399, #10b981)',
            }}
          />
        </div>
      </div>

      {/* Long Signals */}
      <div className="rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-3 transition-all duration-200 hover:bg-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faArrowTrendUp} className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Long</span>
        </div>
        <p className="text-xl font-bold text-emerald-400">{stats.longSignals}</p>
        <p className="text-[10px] text-white/30">signals</p>
      </div>

      {/* Short Signals */}
      <div className="rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-3 transition-all duration-200 hover:bg-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faArrowTrendDown} className="h-3.5 w-3.5 text-red-400" />
          <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Short</span>
        </div>
        <p className="text-xl font-bold text-red-400">{stats.shortSignals}</p>
        <p className="text-[10px] text-white/30">signals</p>
      </div>

      {/* Queue */}
      <div className="rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-3 transition-all duration-200 hover:bg-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Queue</span>
        </div>
        <p className="text-xl font-bold text-violet-400">{stats.queueSize}</p>
        <p className="text-[10px] text-white/30">pending</p>
      </div>

      {/* Scan Rate */}
      <div className="rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-3 transition-all duration-200 hover:bg-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Rate</span>
        </div>
        <p className="text-xl font-bold text-white/90">{stats.scanRate}</p>
        <p className="text-[10px] text-white/30">scans/min</p>
      </div>
    </div>
  );
}
