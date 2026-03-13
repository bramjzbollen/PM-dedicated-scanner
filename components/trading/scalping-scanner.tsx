'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faArrowTrendUp,
  faArrowTrendDown,
  faMinus,
  faGear,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons';
import { PulsingDot } from '@/components/ui/pulsing-dot';
import { cn } from '@/lib/utils';
import { normalizeSignal, compactPairLabel } from '@/lib/normalize-signal';

import {
  type ScalpParams as BaseScalpParams,
  type EnabledIndicators,
  DEFAULT_SCALP_PARAMS,
  DEFAULT_ENABLED_INDICATORS,
} from '@/lib/trading-engine';

// Extended ScalpParams with scanner-specific fields
interface ScalpParams extends BaseScalpParams {
  stopLoss: number;
  takeProfit: number;
  trailingStop: number;
  minVolume24h: number;
}

interface ScannerData {
  success: boolean;
  timestamp: string;
  params: any;
  signals: Array<{
    pair: string;
    signal: 'LONG' | 'SHORT' | 'NEUTRAL';
    confidence: number;
    reason: string;
    indicators: {
      rsi: number;
      bbPosition: number;
      bbUpper: number;
      bbMiddle: number;
      bbLower: number;
      volumeRatio: number;
      atr: number;
      atrPercent: number;
      price: number;
      stochRsiK?: number;
    };
    exitRules: {
      stopLoss: string;
      takeProfit: string;
      trailingStop: string;
    };
  }>;
}

const DEFAULT_PARAMS: ScalpParams = {
  ...DEFAULT_SCALP_PARAMS,
  stopLoss: 0.4,
  takeProfit: 0.8,
  trailingStop: 0.3,
  minVolume24h: 500000,
};

const DEFAULT_INDICATORS: EnabledIndicators = DEFAULT_ENABLED_INDICATORS;

const signalColors = {
  LONG: { bg: 'bg-emerald-500/[0.12]', text: 'text-emerald-400', border: 'border-emerald-500/[0.2]', icon: faArrowTrendUp },
  SHORT: { bg: 'bg-red-500/[0.12]', text: 'text-red-400', border: 'border-red-500/[0.2]', icon: faArrowTrendDown },
  NEUTRAL: { bg: 'bg-white/[0.06]', text: 'text-white/50', border: 'border-white/[0.1]', icon: faMinus },
};

export function ScalpingScanner() {
  const [params, setParams] = useState<ScalpParams>(DEFAULT_PARAMS);
  const [enabled, setEnabled] = useState<EnabledIndicators>(DEFAULT_INDICATORS);
  const [data, setData] = useState<ScannerData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/scalping-scanner');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Scalping scanner fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const updateParam = (key: keyof ScalpParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const toggleIndicator = (key: keyof EnabledIndicators) => {
    setEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading || !data) {
    return (
      <Card className="border-cyan-500/[0.1]">
        <CardHeader>
          <CardTitle>Loading scanner...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl shimmer" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const lastUpdate = new Date(data.timestamp);

  return (
    <div className="space-y-4">
      {/* Settings Panel */}
      <Card className="border-cyan-500/[0.1]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="p-1.5 rounded-xl bg-cyan-500/[0.1]">
                <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <span>Scanner Parameters</span>
              <Badge variant="outline" className="text-[10px] text-cyan-400/60 border-cyan-500/20">
                1m Timeframe
              </Badge>
            </CardTitle>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all text-xs"
            >
              <FontAwesomeIcon icon={showSettings ? faChevronUp : faChevronDown} className="h-3 w-3" />
              {showSettings ? 'Verberg' : 'Toon'}
            </button>
          </div>
        </CardHeader>
        {showSettings && (
          <CardContent className="pt-0 space-y-4">
            {/* Indicator Toggles */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Actieve Indicators</p>
              <div className="flex flex-wrap gap-3">
                <IndicatorToggle
                  label="Stochastic RSI"
                  enabled={enabled.stochRsi}
                  onChange={() => toggleIndicator('stochRsi')}
                  color="emerald"
                />
                <IndicatorToggle
                  label="Bollinger Bands"
                  enabled={enabled.bb}
                  onChange={() => toggleIndicator('bb')}
                  color="blue"
                />
                <IndicatorToggle
                  label="Volume Spike"
                  enabled={enabled.volume}
                  onChange={() => toggleIndicator('volume')}
                  color="cyan"
                />
                <IndicatorToggle
                  label="ATR Filter"
                  enabled={enabled.atr}
                  onChange={() => toggleIndicator('atr')}
                  color="violet"
                />
              </div>
            </div>

            {/* Parameter Sliders */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Parameters</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {enabled.stochRsi && (
                  <>
                    <ParamInput label="Stoch RSI Period" value={params.stochRsiPeriod} onChange={v => updateParam('stochRsiPeriod', v)} min={2} max={30} step={1} />
                    <ParamInput label="Stoch Period" value={params.stochRsiStochPeriod} onChange={v => updateParam('stochRsiStochPeriod', v)} min={5} max={30} step={1} />
                    <ParamInput label="%K Smoothing" value={params.stochRsiKSmoothing} onChange={v => updateParam('stochRsiKSmoothing', v)} min={1} max={10} step={1} />
                    <ParamInput label="%D Smoothing" value={params.stochRsiDSmoothing} onChange={v => updateParam('stochRsiDSmoothing', v)} min={1} max={10} step={1} />
                    <ParamInput label="Bottom Threshold" value={params.stochRsiBottomThreshold} onChange={v => updateParam('stochRsiBottomThreshold', v)} min={5} max={30} step={5} />
                    <ParamInput label="Top Threshold" value={params.stochRsiTopThreshold} onChange={v => updateParam('stochRsiTopThreshold', v)} min={70} max={95} step={5} />
                    <ParamInput label="Cross Level" value={params.stochRsiCrossLevel} onChange={v => updateParam('stochRsiCrossLevel', v)} min={30} max={70} step={5} />
                  </>
                )}
                {enabled.bb && (
                  <>
                    <ParamInput label="BB Period" value={params.bbPeriod} onChange={v => updateParam('bbPeriod', v)} min={5} max={50} step={1} />
                    <ParamInput label="BB Std Dev" value={params.bbStdDev} onChange={v => updateParam('bbStdDev', v)} min={1} max={4} step={0.5} />
                  </>
                )}
                {enabled.volume && (
                  <ParamInput label="Volume SMA" value={params.volumeSMA} onChange={v => updateParam('volumeSMA', v)} min={5} max={50} step={1} />
                )}
                {enabled.atr && (
                  <>
                    <ParamInput label="ATR Period" value={params.atrPeriod} onChange={v => updateParam('atrPeriod', v)} min={5} max={50} step={1} />
                    <ParamInput label="Min ATR %" value={params.minATR} onChange={v => updateParam('minATR', v)} min={0.05} max={1} step={0.05} />
                  </>
                )}
                <ParamInput label="Stop Loss %" value={params.stopLoss} onChange={v => updateParam('stopLoss', v)} min={0.1} max={2} step={0.1} />
                <ParamInput label="Take Profit %" value={params.takeProfit} onChange={v => updateParam('takeProfit', v)} min={0.2} max={5} step={0.1} />
                <ParamInput label="Trailing Stop %" value={params.trailingStop} onChange={v => updateParam('trailingStop', v)} min={0.1} max={2} step={0.1} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setParams(DEFAULT_PARAMS);
                  setEnabled(DEFAULT_INDICATORS);
                }}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all text-xs"
              >
                Reset defaults
              </button>
              <span className="text-[10px] text-white/25">
                Actief: {Object.values(enabled).filter(Boolean).length}/4 indicators
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Live Signals */}
      <Card className="border-cyan-500/[0.1]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="p-1.5 rounded-xl bg-cyan-500/[0.1]">
                <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <span>Live Signalen</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] text-emerald-400/60 border-emerald-400/20">
                Mainnet
              </Badge>
              <PulsingDot status="online" size="sm" />
              <span className="text-[11px] text-white/40">
                {lastUpdate.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.signals.map((sig, index) => {
              const normalized = normalizeSignal(sig);
              const signal = normalized.signal;
              const pairRaw = normalized.pair ?? normalized.symbol ?? '—';
              const pair = compactPairLabel(normalized);
              const sc = signalColors[signal] ?? signalColors.NEUTRAL;

              return (
                <div
                  key={`${pairRaw}-${index}`}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-xl border transition-all duration-200',
                    sc.bg, sc.border,
                    'hover:bg-white/[0.06]'
                  )}
                >
                  {/* Symbol */}
                  <div className="min-w-[80px]">
                    <p className="font-mono font-bold text-white/90 text-lg">{pair}</p>
                    <p className="text-xs text-white/35 font-mono">
                      ${normalized.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Signal Badge */}
                  <Badge className={cn('text-sm font-bold min-w-[90px] justify-center', sc.bg, sc.text, sc.border)}>
                    <FontAwesomeIcon icon={sc.icon} className="h-3 w-3 mr-1.5" />
                    {signal}
                  </Badge>

                  {/* Confidence */}
                  <div className="min-w-[60px] text-center">
                    <p className={cn(
                      'text-lg font-bold',
                      normalized.confidence >= 70 ? 'text-emerald-400' :
                      normalized.confidence >= 50 ? 'text-amber-400' : 'text-white/40'
                    )}>
                      {normalized.confidence}%
                    </p>
                    <p className="text-[10px] text-white/30">Confidence</p>
                  </div>

                  {/* Indicators */}
                  <div className="hidden md:flex gap-4 text-xs flex-1">
                    {enabled.stochRsi && (
                      <div className="text-center">
                        <p className={cn(
                          'font-mono font-semibold',
                          (((normalized.indicators as any).stochRsiK ?? 50) as number) < params.stochRsiBottomThreshold ? 'text-emerald-400' :
                          (((normalized.indicators as any).stochRsiK ?? 50) as number) > params.stochRsiTopThreshold ? 'text-red-400' : 'text-white/60'
                        )}>
                          {typeof (normalized.indicators as any).stochRsiK === 'number' ? ((normalized.indicators as any).stochRsiK as number).toFixed(1) : '—'}
                        </p>
                        <p className="text-white/30">Stoch K</p>
                      </div>
                    )}
                    {enabled.bb && (
                      <div className="text-center">
                        <p className="font-mono text-white/60">
                          {(((normalized.indicators as any).bbPosition ?? 50) as number) < 20 ? 'Lower' : (((normalized.indicators as any).bbPosition ?? 50) as number) > 80 ? 'Upper' : 'Mid'}
                        </p>
                        <p className="text-white/30">BB</p>
                      </div>
                    )}
                    {enabled.volume && (
                      <div className="text-center">
                        <p className={cn(
                          'font-mono font-semibold',
                          (((normalized.indicators as any).volumeRatio ?? 0) as number) > 1.5 ? 'text-cyan-400' : 'text-white/60'
                        )}>
                          {typeof (normalized.indicators as any).volumeRatio === 'number' ? ((normalized.indicators as any).volumeRatio as number).toFixed(1) : '0.0'}x
                        </p>
                        <p className="text-white/30">Vol</p>
                      </div>
                    )}
                    {enabled.atr && (
                      <div className="text-center">
                        <p className={cn(
                          'font-mono',
                          (((normalized.indicators as any).atrPercent ?? 0) as number) > params.minATR ? 'text-white/60' : 'text-white/30'
                        )}>
                          {typeof (normalized.indicators as any).atrPercent === 'number' ? ((normalized.indicators as any).atrPercent as number).toFixed(2) : '0.00'}%
                        </p>
                        <p className="text-white/30">ATR</p>
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  <div className="hidden lg:block text-right min-w-[200px]">
                    <p className="text-xs text-white/50 leading-snug">{normalized.reason || 'No reason provided'}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Exit Rules Summary */}
          <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Exit Rules</p>
            <div className="flex gap-4 text-xs text-white/50">
              <span>🛑 SL: <span className="text-red-400 font-mono">{params.stopLoss}%</span></span>
              <span>🎯 TP: <span className="text-emerald-400 font-mono">{params.takeProfit}%</span></span>
              <span>📏 Trail: <span className="text-cyan-400 font-mono">{params.trailingStop}%</span></span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IndicatorToggle({ label, enabled, onChange, color }: {
  label: string;
  enabled: boolean;
  onChange: () => void;
  color: 'emerald' | 'blue' | 'cyan' | 'violet';
}) {
  const colors = {
    emerald: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
    blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
    cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
    violet: { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400' },
  };

  const c = colors[color];

  return (
    <label className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all',
      enabled ? `${c.bg} ${c.border}` : 'bg-white/[0.02] border-white/[0.08]'
    )}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={onChange}
        className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
      />
      <span className={cn(
        'text-xs font-medium',
        enabled ? c.text : 'text-white/40'
      )}>
        {label}
      </span>
    </label>
  );
}

function ParamInput({ label, value, onChange, min, max, step, format }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: 'compact';
}) {
  const displayValue = format === 'compact'
    ? `$${(value / 1000).toFixed(0)}K`
    : value.toString();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-white/40">{label}</label>
        <span className="text-xs font-mono text-white/70">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.1] accent-cyan-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(34,211,238,0.5)]"
      />
    </div>
  );
}
