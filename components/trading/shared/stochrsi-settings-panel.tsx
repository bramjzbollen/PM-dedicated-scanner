'use client';

/**
 * StochRSI Scanner Settings Panel
 * 
 * Reads/writes to /api/scanner-config
 * Scanner picks up changes live (no restart needed)
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faChevronDown, faChevronUp, faRotateRight, faBolt, faShieldHalved, faCoins } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

// ── Types ──

interface ScannerConfig {
  stochRsi: { rsiPeriod: number; stochPeriod: number; kSmoothing: number; dSmoothing: number };
  entryZones: { oversoldThreshold: number; oversoldExitMax: number; overboughtThreshold: number; overboughtExitMin: number };
  bias: { ema5mPeriod: number; rsi5mLongMin: number; rsi5mShortMax: number };
  volume: { minMultiple: number; smaPeriod: number };
  risk: { slAtrMultiple: number; tpAtrMultiple: number; minSlPercent: number; roundtripFeePct: number; minTpFeeMultiple: number; timeStopCandles: number };
  _updated?: string;
}

const DEFAULT_CONFIG: ScannerConfig = {
  stochRsi: { rsiPeriod: 14, stochPeriod: 14, kSmoothing: 3, dSmoothing: 3 },
  entryZones: { oversoldThreshold: 15, oversoldExitMax: 40, overboughtThreshold: 85, overboughtExitMin: 60 },
  bias: { ema5mPeriod: 50, rsi5mLongMin: 45, rsi5mShortMax: 55 },
  volume: { minMultiple: 1.2, smaPeriod: 20 },
  risk: { slAtrMultiple: 1.5, tpAtrMultiple: 1.5, minSlPercent: 0.5, roundtripFeePct: 0.11, minTpFeeMultiple: 2.5, timeStopCandles: 8 },
};

// ── Sub-components ──

function Slider({ label, value, onChange, min, max, step, unit, colorClass, warn }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit?: string; colorClass?: string; warn?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-white/40">{label}</label>
        <span className={cn('text-xs font-mono font-bold', colorClass || 'text-white/70')}>{value}{unit || ''}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.1] accent-cyan-500" />
      {warn && <p className="text-[9px] text-amber-400/70">{warn}</p>}
    </div>
  );
}

function ZoneVisual({ oversold, oversoldExit, overbought, overboughtExit }: {
  oversold: number; oversoldExit: number; overbought: number; overboughtExit: number;
}) {
  return (
    <div className="relative h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      {/* Oversold zone */}
      <div className="absolute top-0 bottom-0 bg-emerald-500/15 border-r border-emerald-500/30"
        style={{ left: 0, width: `${oversoldExit}%` }} />
      <div className="absolute top-0 bottom-0 bg-emerald-500/30"
        style={{ left: 0, width: `${oversold}%` }} />
      
      {/* Overbought zone */}
      <div className="absolute top-0 bottom-0 bg-red-500/15 border-l border-red-500/30"
        style={{ right: 0, width: `${100 - overboughtExit}%` }} />
      <div className="absolute top-0 bottom-0 bg-red-500/30"
        style={{ right: 0, width: `${100 - overbought}%` }} />
      
      {/* Neutral zone */}
      <div className="absolute top-0 bottom-0 flex items-center justify-center text-[9px] text-white/20 font-mono"
        style={{ left: `${oversoldExit}%`, right: `${100 - overboughtExit}%` }}>
        NEUTRAL
      </div>

      {/* Labels */}
      <div className="absolute bottom-0.5 text-[8px] font-mono text-emerald-400/80" style={{ left: `${oversold/2}%` }}>
        ← LONG {oversold}
      </div>
      <div className="absolute bottom-0.5 text-[8px] font-mono text-emerald-400/50" style={{ left: `${(oversold + oversoldExit) / 2}%` }}>
        {oversoldExit}
      </div>
      <div className="absolute bottom-0.5 text-[8px] font-mono text-red-400/50 right-auto" style={{ right: `${(100 - overboughtExit + (100 - overbought)) / 2}%` }}>
        {overboughtExit}
      </div>
      <div className="absolute bottom-0.5 text-[8px] font-mono text-red-400/80" style={{ right: `${(100 - overbought) / 2}%` }}>
        {overbought} SHORT →
      </div>
    </div>
  );
}

// ── Main Component ──

interface StochRSISettingsPanelProps {
  show: boolean;
  onToggle: () => void;
}

export function StochRSISettingsPanel({ show, onToggle }: StochRSISettingsPanelProps) {
  const [config, setConfig] = useState<ScannerConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>('');

  // Load config
  useEffect(() => {
    fetch('/api/scanner-config')
      .then(r => r.json())
      .then(data => { if (data && !data.error) setConfig(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-save with debounce
  const saveConfig = useCallback(async (section: string, values: Record<string, number>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/scanner-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [section]: values }),
      });
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        setLastSaved(new Date().toLocaleTimeString());
      }
    } catch {}
    setSaving(false);
  }, []);

  const updateEntry = (key: string, value: number) => {
    const updated = { ...config.entryZones, [key]: value };
    setConfig(c => ({ ...c, entryZones: updated }));
    saveConfig('entryZones', updated);
  };

  const updateStochRsi = (key: string, value: number) => {
    const updated = { ...config.stochRsi, [key]: value };
    setConfig(c => ({ ...c, stochRsi: updated }));
    saveConfig('stochRsi', updated);
  };

  const updateBias = (key: string, value: number) => {
    const updated = { ...config.bias, [key]: value };
    setConfig(c => ({ ...c, bias: updated }));
    saveConfig('bias', updated);
  };

  const updateVolume = (key: string, value: number) => {
    const updated = { ...config.volume, [key]: value };
    setConfig(c => ({ ...c, volume: updated }));
    saveConfig('volume', updated);
  };

  const updateRisk = (key: string, value: number) => {
    const updated = { ...config.risk, [key]: value };
    setConfig(c => ({ ...c, risk: updated }));
    saveConfig('risk', updated);
  };

  const resetToDefaults = async () => {
    setSaving(true);
    try {
      await fetch('/api/scanner-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_CONFIG),
      });
      setConfig(DEFAULT_CONFIG);
      setLastSaved('reset @ ' + new Date().toLocaleTimeString());
    } catch {}
    setSaving(false);
  };

  // Fee calculations
  const minTpPercent = config.risk.roundtripFeePct * config.risk.minTpFeeMultiple;
  const tpAfterFees = (config.risk.tpAtrMultiple / config.risk.slAtrMultiple * config.risk.minSlPercent) - config.risk.roundtripFeePct;
  const isProfitable = tpAfterFees > 0;

  return (
    <Card className="hover:-translate-y-0 border-cyan-500/[0.1]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="p-1.5 rounded-xl bg-cyan-500/[0.1]">
              <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <span>StochRSI Scanner</span>
            <Badge variant="outline" className="text-[10px] text-cyan-400/60 border-cyan-500/20">1m V5</Badge>
            {saving && <span className="text-[9px] text-amber-400 animate-pulse">saving...</span>}
            {lastSaved && !saving && <span className="text-[9px] text-white/20">saved {lastSaved}</span>}
          </CardTitle>
          <button onClick={onToggle} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            show ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white/80')}>
            <FontAwesomeIcon icon={show ? faChevronUp : faChevronDown} className="h-3 w-3" />
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </CardHeader>

      {show && !loading && (
        <CardContent className="pt-0 space-y-5">

          {/* ── Entry Zones Visual ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">
              <FontAwesomeIcon icon={faBolt} className="h-2.5 w-2.5 mr-1" />
              StochRSI Entry Zones
            </p>
            <ZoneVisual
              oversold={config.entryZones.oversoldThreshold}
              oversoldExit={config.entryZones.oversoldExitMax}
              overbought={config.entryZones.overboughtThreshold}
              overboughtExit={config.entryZones.overboughtExitMin}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <Slider label="Oversold Zone" value={config.entryZones.oversoldThreshold}
                onChange={v => updateEntry('oversoldThreshold', v)} min={5} max={30} step={1} colorClass="text-emerald-400" />
              <Slider label="Long Entry Max" value={config.entryZones.oversoldExitMax}
                onChange={v => updateEntry('oversoldExitMax', v)} min={25} max={50} step={1} colorClass="text-emerald-400" />
              <Slider label="Overbought Zone" value={config.entryZones.overboughtThreshold}
                onChange={v => updateEntry('overboughtThreshold', v)} min={70} max={95} step={1} colorClass="text-red-400" />
              <Slider label="Short Entry Min" value={config.entryZones.overboughtExitMin}
                onChange={v => updateEntry('overboughtExitMin', v)} min={50} max={75} step={1} colorClass="text-red-400" />
            </div>
          </div>

          {/* ── StochRSI Parameters ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">StochRSI Parameters</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Slider label="RSI Period" value={config.stochRsi.rsiPeriod}
                onChange={v => updateStochRsi('rsiPeriod', v)} min={5} max={21} step={1} />
              <Slider label="Stoch Period" value={config.stochRsi.stochPeriod}
                onChange={v => updateStochRsi('stochPeriod', v)} min={5} max={21} step={1} />
              <Slider label="K Smoothing" value={config.stochRsi.kSmoothing}
                onChange={v => updateStochRsi('kSmoothing', v)} min={1} max={7} step={1} />
              <Slider label="D Smoothing" value={config.stochRsi.dSmoothing}
                onChange={v => updateStochRsi('dSmoothing', v)} min={1} max={7} step={1} />
            </div>
          </div>

          {/* ── 5m Bias Filter ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">5m Trend Bias (Gate)</p>
            <div className="grid grid-cols-3 gap-4">
              <Slider label="EMA Period" value={config.bias.ema5mPeriod}
                onChange={v => updateBias('ema5mPeriod', v)} min={20} max={100} step={5} />
              <Slider label="RSI Long Min" value={config.bias.rsi5mLongMin}
                onChange={v => updateBias('rsi5mLongMin', v)} min={35} max={55} step={1} colorClass="text-emerald-400" />
              <Slider label="RSI Short Max" value={config.bias.rsi5mShortMax}
                onChange={v => updateBias('rsi5mShortMax', v)} min={45} max={65} step={1} colorClass="text-red-400" />
            </div>
          </div>

          {/* ── Volume ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Volume Confirmation</p>
            <div className="grid grid-cols-2 gap-4">
              <Slider label="Min Volume Multiple" value={config.volume.minMultiple}
                onChange={v => updateVolume('minMultiple', v)} min={1.0} max={3.0} step={0.1} unit="x" colorClass="text-cyan-400" />
              <Slider label="Volume SMA" value={config.volume.smaPeriod}
                onChange={v => updateVolume('smaPeriod', v)} min={5} max={50} step={1} />
            </div>
          </div>

          {/* ── Risk / SL / TP ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">
              <FontAwesomeIcon icon={faShieldHalved} className="h-2.5 w-2.5 mr-1" />
              Risk & SL/TP (ATR-based)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Slider label="SL (ATR multiple)" value={config.risk.slAtrMultiple}
                onChange={v => updateRisk('slAtrMultiple', v)} min={0.5} max={3.0} step={0.1} unit="x" colorClass="text-red-400" />
              <Slider label="TP (ATR multiple)" value={config.risk.tpAtrMultiple}
                onChange={v => updateRisk('tpAtrMultiple', v)} min={0.5} max={3.0} step={0.1} unit="x" colorClass="text-emerald-400" />
              <Slider label="Min SL Floor" value={config.risk.minSlPercent}
                onChange={v => updateRisk('minSlPercent', v)} min={0.2} max={2.0} step={0.1} unit="%" colorClass="text-red-400" />
              <Slider label="Time Stop" value={config.risk.timeStopCandles}
                onChange={v => updateRisk('timeStopCandles', v)} min={3} max={20} step={1} unit=" candles" />
              <Slider label="Roundtrip Fee" value={config.risk.roundtripFeePct}
                onChange={v => updateRisk('roundtripFeePct', v)} min={0.02} max={0.20} step={0.01} unit="%" colorClass="text-amber-400" />
              <Slider label="Min TP/Fee Ratio" value={config.risk.minTpFeeMultiple}
                onChange={v => updateRisk('minTpFeeMultiple', v)} min={1.5} max={5.0} step={0.5} unit="x" />
            </div>

            {/* Fee profitability indicator */}
            <div className={cn('mt-3 px-3 py-2 rounded-lg border text-xs font-mono',
              isProfitable ? 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400' : 'bg-red-500/[0.06] border-red-500/20 text-red-400')}>
              <FontAwesomeIcon icon={faCoins} className="h-3 w-3 mr-2" />
              Min TP to cover fees: {minTpPercent.toFixed(3)}% | 
              Est. net per trade: {isProfitable ? '+' : ''}{tpAfterFees.toFixed(3)}% |
              {isProfitable ? ' ✓ Profitable after fees' : ' ✗ TP does NOT cover fees — widen TP or reduce fees'}
            </div>
          </div>

          {/* ── Reset ── */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
            <button onClick={resetToDefaults} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all text-xs">
              <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />Reset to defaults
            </button>
            <span className="text-[9px] text-white/20">Changes apply instantly — no scanner restart needed</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
