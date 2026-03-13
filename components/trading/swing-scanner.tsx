'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWaveSquare,
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

interface SwingParams {
  ema20: number;
  ema50: number;
  ema200: number;
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  stopLossPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  trailingPercent: number;
}

interface EnabledIndicators {
  ema: boolean;
  rsi: boolean;
  macd: boolean;
  volume: boolean;
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
    trend: 'BULLISH' | 'BEARISH' | 'RANGING';
    indicators: {
      ema20: number;
      ema50: number;
      ema200: number;
      rsi: number;
      macdLine: number;
      macdSignal: number;
      macdHistogram: number;
      volumeRatio: number;
      price: number;
      distToEma20: number;
      distToEma50: number;
    };
    zones: {
      entryZone: string;
      stopLoss: string;
      tp1: string;
      tp2: string;
    };
    positionManagement: {
      initial: string;
      atTP1: string;
      atTP2: string;
      trailing: string;
    };
  }>;
}

const DEFAULT_PARAMS: SwingParams = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stopLossPercent: 1.5,
  tp1Percent: 3,
  tp2Percent: 6,
  trailingPercent: 1.5,
};

const DEFAULT_INDICATORS: EnabledIndicators = {
  ema: true,
  rsi: true,
  macd: true,
  volume: true,
};

const signalColors = {
  LONG: { bg: 'bg-emerald-500/[0.12]', text: 'text-emerald-400', border: 'border-emerald-500/[0.2]', icon: faArrowTrendUp },
  SHORT: { bg: 'bg-red-500/[0.12]', text: 'text-red-400', border: 'border-red-500/[0.2]', icon: faArrowTrendDown },
  NEUTRAL: { bg: 'bg-white/[0.06]', text: 'text-white/50', border: 'border-white/[0.1]', icon: faMinus },
};

const trendColors = {
  BULLISH: 'text-emerald-400',
  BEARISH: 'text-red-400',
  RANGING: 'text-white/40',
};

export function SwingScanner() {
  const [params, setParams] = useState<SwingParams>(DEFAULT_PARAMS);
  const [enabled, setEnabled] = useState<EnabledIndicators>(DEFAULT_INDICATORS);
  const [data, setData] = useState<ScannerData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/swing-scanner');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Swing scanner fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  const updateParam = (key: keyof SwingParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const toggleIndicator = (key: keyof EnabledIndicators) => {
    setEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading || !data) {
    return (
      <Card className="border-violet-500/[0.1]">
        <CardHeader>
          <CardTitle>Loading scanner...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl shimmer" />
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
      <Card className="border-violet-500/[0.1]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="p-1.5 rounded-xl bg-violet-500/[0.1]">
                <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <span>Scanner Parameters</span>
              <Badge variant="outline" className="text-[10px] text-violet-400/60 border-violet-500/20">
                15m Timeframe
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
                  label="EMA Trend"
                  enabled={enabled.ema}
                  onChange={() => toggleIndicator('ema')}
                  color="emerald"
                />
                <IndicatorToggle
                  label="RSI"
                  enabled={enabled.rsi}
                  onChange={() => toggleIndicator('rsi')}
                  color="blue"
                />
                <IndicatorToggle
                  label="MACD"
                  enabled={enabled.macd}
                  onChange={() => toggleIndicator('macd')}
                  color="violet"
                />
                <IndicatorToggle
                  label="Volume"
                  enabled={enabled.volume}
                  onChange={() => toggleIndicator('volume')}
                  color="cyan"
                />
              </div>
            </div>

            {/* Parameter Sliders */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Parameters</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {enabled.ema && (
                  <>
                    <ParamInput label="EMA 20" value={params.ema20} onChange={v => updateParam('ema20', v)} min={5} max={50} step={1} />
                    <ParamInput label="EMA 50" value={params.ema50} onChange={v => updateParam('ema50', v)} min={20} max={100} step={5} />
                    <ParamInput label="EMA 200" value={params.ema200} onChange={v => updateParam('ema200', v)} min={100} max={300} step={10} />
                  </>
                )}
                {enabled.rsi && (
                  <ParamInput label="RSI Period" value={params.rsiPeriod} onChange={v => updateParam('rsiPeriod', v)} min={5} max={30} step={1} />
                )}
                {enabled.macd && (
                  <>
                    <ParamInput label="MACD Fast" value={params.macdFast} onChange={v => updateParam('macdFast', v)} min={5} max={20} step={1} />
                    <ParamInput label="MACD Slow" value={params.macdSlow} onChange={v => updateParam('macdSlow', v)} min={15} max={40} step={1} />
                    <ParamInput label="MACD Signal" value={params.macdSignal} onChange={v => updateParam('macdSignal', v)} min={5} max={15} step={1} />
                  </>
                )}
                <ParamInput label="Stop Loss %" value={params.stopLossPercent} onChange={v => updateParam('stopLossPercent', v)} min={0.5} max={5} step={0.5} />
                <ParamInput label="TP1 %" value={params.tp1Percent} onChange={v => updateParam('tp1Percent', v)} min={1} max={10} step={0.5} />
                <ParamInput label="TP2 %" value={params.tp2Percent} onChange={v => updateParam('tp2Percent', v)} min={2} max={15} step={0.5} />
                <ParamInput label="Trailing %" value={params.trailingPercent} onChange={v => updateParam('trailingPercent', v)} min={0.5} max={5} step={0.5} />
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
      <Card className="border-violet-500/[0.1]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="p-1.5 rounded-xl bg-violet-500/[0.1]">
                <FontAwesomeIcon icon={faWaveSquare} className="h-3.5 w-3.5 text-violet-400" />
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
                    'flex flex-col gap-3 p-4 rounded-xl border transition-all duration-200',
                    sc.bg, sc.border,
                    'hover:bg-white/[0.06]'
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Symbol + Trend */}
                    <div className="min-w-[100px]">
                      <p className="font-mono font-bold text-white/90 text-lg">{pair}</p>
                      <p className={cn('text-xs font-semibold', trendColors[sig.trend])}>
                        {sig.trend}
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
                      {enabled.ema && (
                        <div className="text-center">
                          <p className="font-mono text-white/60 text-[10px]">
                            {sig.indicators.ema20.toFixed(0)}/{sig.indicators.ema50.toFixed(0)}/{sig.indicators.ema200.toFixed(0)}
                          </p>
                          <p className="text-white/30">EMAs</p>
                        </div>
                      )}
                      {enabled.rsi && (
                        <div className="text-center">
                          <p className={cn(
                            'font-mono font-semibold',
                            sig.indicators.rsi < 40 ? 'text-emerald-400' :
                            sig.indicators.rsi > 60 ? 'text-red-400' : 'text-white/60'
                          )}>
                            {sig.indicators.rsi.toFixed(0)}
                          </p>
                          <p className="text-white/30">RSI</p>
                        </div>
                      )}
                      {enabled.macd && (
                        <div className="text-center">
                          <p className={cn(
                            'font-mono font-semibold',
                            sig.indicators.macdHistogram > 0 ? 'text-emerald-400' : 'text-red-400'
                          )}>
                            {sig.indicators.macdHistogram > 0 ? '+' : ''}{sig.indicators.macdHistogram.toFixed(3)}
                          </p>
                          <p className="text-white/30">MACD</p>
                        </div>
                      )}
                      {enabled.volume && (
                        <div className="text-center">
                          <p className={cn(
                            'font-mono font-semibold',
                            sig.indicators.volumeRatio > 1.2 ? 'text-cyan-400' : 'text-white/60'
                          )}>
                            {sig.indicators.volumeRatio.toFixed(1)}x
                          </p>
                          <p className="text-white/30">Vol</p>
                        </div>
                      )}
                    </div>

                    {/* Price */}
                    <div className="text-right min-w-[100px]">
                      <p className="text-sm font-mono text-white/70">
                        ${normalized.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-white/30">Price</p>
                    </div>
                  </div>

                  {/* Reason + Zones */}
                  <div className="grid md:grid-cols-2 gap-3 pt-2 border-t border-white/[0.05]">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Reason</p>
                      <p className="text-xs text-white/60">{normalized.reason || 'No reason provided'}</p>
                    </div>
                    {signal !== 'NEUTRAL' && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Zones</p>
                        <div className="flex gap-2 text-[11px]">
                          <span className="text-white/40">Entry: <span className="text-cyan-400 font-mono">{sig.zones.entryZone}</span></span>
                          <span className="text-white/40">SL: <span className="text-red-400 font-mono">{sig.zones.stopLoss}</span></span>
                          <span className="text-white/40">TP1: <span className="text-emerald-400 font-mono">{sig.zones.tp1}</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Position Management */}
          <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Position Management</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-white/50">
              <span>📍 Entry: <span className="text-white/70 font-mono">100%</span></span>
              <span>🎯 TP1 ({params.tp1Percent}%): <span className="text-white/70 font-mono">Take 50%</span></span>
              <span>🎯 TP2 ({params.tp2Percent}%): <span className="text-white/70 font-mono">Take 25%</span></span>
              <span>📏 Trail: <span className="text-white/70 font-mono">Rest @ {params.trailingPercent}%</span></span>
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
        className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
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

function ParamInput({ label, value, onChange, min, max, step }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-white/40">{label}</label>
        <span className="text-xs font-mono text-white/70">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.1] accent-violet-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(167,139,250,0.5)]"
      />
    </div>
  );
}
