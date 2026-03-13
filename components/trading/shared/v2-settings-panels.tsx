'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faChevronDown, faChevronUp, faRotateRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import type {
  V2ScalpParams, V2ScalpEnabled,
  V2SwingParams, V2SwingEnabled,
} from '@/lib/use-trading-engine-v2';
import type { TradingConfig } from '@/lib/trading-engine';

// ── Shared sub-components ──

function Toggle({ label, enabled, onChange, color }: {
  label: string; enabled: boolean; onChange: () => void;
  color: 'emerald' | 'blue' | 'cyan' | 'violet' | 'amber' | 'purple' | 'rose';
}) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    emerald: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
    blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
    cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
    violet: { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400' },
    amber: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
    purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
    rose: { bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-400' },
  };
  const c = colors[color];
  return (
    <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all',
      enabled ? `${c.bg} ${c.border}` : 'bg-white/[0.02] border-white/[0.08]')}>
      <input type="checkbox" checked={enabled} onChange={onChange} className="w-4 h-4 rounded accent-emerald-500 cursor-pointer" />
      <span className={cn('text-xs font-medium', enabled ? c.text : 'text-white/40')}>{label}</span>
    </label>
  );
}

function Slider({ label, value, onChange, min, max, step, colorClass, unit }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; colorClass?: string; unit?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-white/40">{label}</label>
        <span className={cn('text-xs font-mono', colorClass || 'text-white/70')}>{value}{unit || ''}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.1] accent-emerald-500" />
    </div>
  );
}

// ── 1m Scalp Settings Panel ──

interface V2ScalpSettingsProps {
  show: boolean;
  onToggle: () => void;
  params: V2ScalpParams;
  enabled: V2ScalpEnabled;
  config: TradingConfig;
  onUpdateParam: (key: keyof V2ScalpParams, value: number) => void;
  onToggleIndicator: (key: keyof V2ScalpEnabled) => void;
  onUpdateConfig: (updates: Record<string, unknown>) => void;
  onReset: () => void;
  walletSize?: number;
  onUpdateWalletSize?: (size: number) => void;
}

export function V2ScalpSettingsPanel({
  show, onToggle, params, enabled, config,
  onUpdateParam, onToggleIndicator, onUpdateConfig, onReset,
  walletSize, onUpdateWalletSize,
}: V2ScalpSettingsProps) {
  const activeCount = Object.values(enabled).filter(Boolean).length;
  const leverageColor = config.leverage <= 5 ? 'text-emerald-400' : config.leverage <= 20 ? 'text-amber-400' : config.leverage <= 50 ? 'text-orange-400' : 'text-red-400';

  return (
    <Card className="hover:-translate-y-0 border-emerald-500/[0.1]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="p-1.5 rounded-xl bg-emerald-500/[0.1]">
              <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <span>V2 Scanner Settings</span>
            <Badge variant="outline" className="text-[10px] text-emerald-400/60 border-emerald-500/20">1m Continuation</Badge>
            <span className="text-[10px] text-white/25">{activeCount}/6 indicators</span>
          </CardTitle>
          <button onClick={onToggle} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            show ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white/80')}>
            <FontAwesomeIcon icon={show ? faChevronUp : faChevronDown} className="h-3 w-3" />
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </CardHeader>

      {show && (
        <CardContent className="pt-0 space-y-5">
          {/* Indicator Toggles */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Active Indicators</p>
            <div className="flex flex-wrap gap-3">
              <Toggle label="EMA Trend (9/21/50)" enabled={enabled.emaTrend} onChange={() => onToggleIndicator('emaTrend')} color="emerald" />
              <Toggle label="RSI (7)" enabled={enabled.rsi} onChange={() => onToggleIndicator('rsi')} color="violet" />
              <Toggle label="MACD (5/13/6)" enabled={enabled.macd} onChange={() => onToggleIndicator('macd')} color="blue" />
              <Toggle label="Volume Spike" enabled={enabled.volume} onChange={() => onToggleIndicator('volume')} color="cyan" />
              <Toggle label="ATR Filter" enabled={enabled.atr} onChange={() => onToggleIndicator('atr')} color="amber" />
              <Toggle label="Body/Range" enabled={enabled.bodyFilter} onChange={() => onToggleIndicator('bodyFilter')} color="rose" />
            </div>
          </div>

          {/* Parameter Sliders */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Parameters</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {enabled.emaTrend && (
                <>
                  <Slider label="EMA Fast" value={params.emaFast} onChange={v => onUpdateParam('emaFast', v)} min={3} max={20} step={1} />
                  <Slider label="EMA Mid" value={params.emaMid} onChange={v => onUpdateParam('emaMid', v)} min={10} max={50} step={1} />
                  <Slider label="EMA Slow" value={params.emaSlow} onChange={v => onUpdateParam('emaSlow', v)} min={30} max={100} step={5} />
                </>
              )}
              {enabled.rsi && (
                <>
                  <Slider label="RSI Length" value={params.rsiLength} onChange={v => onUpdateParam('rsiLength', v)} min={3} max={21} step={1} />
                  <Slider label="RSI Long Min" value={params.rsiLongMin} onChange={v => onUpdateParam('rsiLongMin', v)} min={30} max={55} step={1} />
                  <Slider label="RSI Long Max" value={params.rsiLongMax} onChange={v => onUpdateParam('rsiLongMax', v)} min={50} max={70} step={1} />
                  <Slider label="RSI Short Min" value={params.rsiShortMin} onChange={v => onUpdateParam('rsiShortMin', v)} min={30} max={55} step={1} />
                  <Slider label="RSI Short Max" value={params.rsiShortMax} onChange={v => onUpdateParam('rsiShortMax', v)} min={45} max={70} step={1} />
                </>
              )}
              {enabled.macd && (
                <>
                  <Slider label="MACD Fast" value={params.macdFast} onChange={v => onUpdateParam('macdFast', v)} min={3} max={15} step={1} />
                  <Slider label="MACD Slow" value={params.macdSlow} onChange={v => onUpdateParam('macdSlow', v)} min={8} max={30} step={1} />
                  <Slider label="MACD Signal" value={params.macdSignal} onChange={v => onUpdateParam('macdSignal', v)} min={3} max={15} step={1} />
                </>
              )}
              {enabled.volume && (
                <>
                  <Slider label="Volume SMA" value={params.volumeSma} onChange={v => onUpdateParam('volumeSma', v)} min={5} max={50} step={1} />
                  <Slider label="Min Vol Multiple" value={params.minVolMultiple} onChange={v => onUpdateParam('minVolMultiple', v)} min={1.0} max={3.0} step={0.1} unit="x" />
                </>
              )}
              {enabled.atr && (
                <>
                  <Slider label="ATR Length" value={params.atrLength} onChange={v => onUpdateParam('atrLength', v)} min={5} max={30} step={1} />
                  <Slider label="Min ATR %" value={params.minAtrPercent} onChange={v => onUpdateParam('minAtrPercent', v)} min={0.02} max={0.5} step={0.01} unit="%" />
                </>
              )}
              {enabled.bodyFilter && (
                <Slider label="Body/Range Min" value={params.bodyRatioMin} onChange={v => onUpdateParam('bodyRatioMin', v)} min={0.3} max={0.9} step={0.05} />
              )}
            </div>
          </div>

          {/* R-based Trade Parameters */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">📐 R-Based Trade Setup</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <Slider label="TP (R multiple)" value={params.tpR} onChange={v => onUpdateParam('tpR', v)} min={0.5} max={2.0} step={0.05} colorClass="text-emerald-400" unit="R" />
              <Slider label="Strong TP (R)" value={params.strongTpR} onChange={v => onUpdateParam('strongTpR', v)} min={0.5} max={2.5} step={0.05} colorClass="text-emerald-400" unit="R" />
              <Slider label="Break-Even at" value={params.beAtR} onChange={v => onUpdateParam('beAtR', v)} min={0.2} max={1.5} step={0.05} colorClass="text-amber-400" unit="R" />
              <Slider label="Stop ATR Cap" value={params.stopAtrCap} onChange={v => onUpdateParam('stopAtrCap', v)} min={0.3} max={1.5} step={0.1} colorClass="text-red-400" unit="×ATR" />
              <Slider label="Time Stop (candles)" value={params.timeStopCandles} onChange={v => onUpdateParam('timeStopCandles', v)} min={2} max={15} step={1} />
              <Slider label="Cooldown (min)" value={params.cooldownMinutes} onChange={v => onUpdateParam('cooldownMinutes', v)} min={0} max={10} step={1} unit="min" />
            </div>
          </div>

          {/* Risk Management */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">💰 Risk Management</p>
            <div className="grid grid-cols-2 gap-4">
              {/* Starting Wallet */}
              {onUpdateWalletSize && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-white/70">Starting Wallet</label>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-white/90">${walletSize || 1000}</span>
                      <span className="text-[10px] text-white/30">paper balance</span>
                    </div>
                  </div>
                  <input type="range" min={100} max={10000} step={100} value={walletSize || 1000}
                    onChange={e => onUpdateWalletSize(Number(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-white/10 via-white/20 to-white/30" />
                  <div className="flex items-center justify-between mt-1 text-[9px] text-white/20"><span>$100</span><span>Takes effect on Reset Wallet</span><span>$10,000</span></div>
                </div>
              )}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Position Size</label>
                  <span className="text-lg font-bold font-mono text-emerald-400">${config.positionSize}</span>
                </div>
                <input type="range" min={5} max={100} step={5} value={config.positionSize ?? 20}
                  onChange={e => onUpdateConfig({ positionSize: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-emerald-600/20 via-emerald-500/40 to-emerald-400/60" />
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Leverage</label>
                  <span className={cn('text-lg font-bold font-mono', leverageColor)}>{config.leverage}x</span>
                </div>
                <input type="range" min={1} max={100} step={1} value={config.leverage}
                  onChange={e => onUpdateConfig({ leverage: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-emerald-500/30 via-amber-500/30 to-red-500/30" />
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Max Open Positions</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-violet-400">{config.maxPositions}</span>
                    <span className="text-[10px] text-white/30">slots</span>
                  </div>
                </div>
                <input type="range" min={1} max={50} step={1} value={config.maxPositions ?? 5}
                  onChange={e => onUpdateConfig({ maxPositions: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-violet-600/20 via-violet-500/40 to-violet-400/60" />
                <div className="flex items-center justify-between mt-1 text-[9px] text-white/20"><span>1</span><span>50</span></div>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
            <button onClick={onReset} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all text-xs">
              <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />Reset to defaults
            </button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── 15m Swing Settings Panel ──

interface V2SwingSettingsProps {
  show: boolean;
  onToggle: () => void;
  params: V2SwingParams;
  enabled: V2SwingEnabled;
  config: TradingConfig;
  onUpdateParam: (key: keyof V2SwingParams, value: number) => void;
  onToggleIndicator: (key: keyof V2SwingEnabled) => void;
  onUpdateConfig: (updates: Record<string, unknown>) => void;
  onReset: () => void;
  walletSize?: number;
  onUpdateWalletSize?: (size: number) => void;
}

export function V2SwingSettingsPanel({
  show, onToggle, params, enabled, config,
  onUpdateParam, onToggleIndicator, onUpdateConfig, onReset,
  walletSize, onUpdateWalletSize,
}: V2SwingSettingsProps) {
  const activeCount = Object.values(enabled).filter(Boolean).length;
  const leverageColor = config.leverage <= 3 ? 'text-emerald-400' : config.leverage <= 10 ? 'text-amber-400' : 'text-orange-400';

  return (
    <Card className="hover:-translate-y-0 border-amber-500/[0.1]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="p-1.5 rounded-xl bg-amber-500/[0.1]">
              <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <span>V2 Scanner Settings</span>
            <Badge variant="outline" className="text-[10px] text-amber-400/60 border-amber-500/20">15m Continuation</Badge>
            <span className="text-[10px] text-white/25">{activeCount}/8 indicators</span>
          </CardTitle>
          <button onClick={onToggle} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            show ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white/80')}>
            <FontAwesomeIcon icon={show ? faChevronUp : faChevronDown} className="h-3 w-3" />
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </CardHeader>

      {show && (
        <CardContent className="pt-0 space-y-5">
          {/* Indicator Toggles */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Active Indicators</p>
            <div className="flex flex-wrap gap-3">
              <Toggle label="EMA Trend (20/50)" enabled={enabled.emaTrend} onChange={() => onToggleIndicator('emaTrend')} color="amber" />
              <Toggle label="1h EMA200 Bias" enabled={enabled.htfBias} onChange={() => onToggleIndicator('htfBias')} color="purple" />
              <Toggle label="RSI (14)" enabled={enabled.rsi} onChange={() => onToggleIndicator('rsi')} color="violet" />
              <Toggle label="MACD (12/26/9)" enabled={enabled.macd} onChange={() => onToggleIndicator('macd')} color="blue" />
              <Toggle label="Volume" enabled={enabled.volume} onChange={() => onToggleIndicator('volume')} color="cyan" />
              <Toggle label="ATR Filter" enabled={enabled.atr} onChange={() => onToggleIndicator('atr')} color="emerald" />
              <Toggle label="Body/Range" enabled={enabled.bodyFilter} onChange={() => onToggleIndicator('bodyFilter')} color="rose" />
              <Toggle label="Pullback Detection" enabled={enabled.pullbackDetection} onChange={() => onToggleIndicator('pullbackDetection')} color="amber" />
            </div>
          </div>

          {/* Parameters */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Parameters</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {enabled.emaTrend && (
                <>
                  <Slider label="EMA Fast" value={params.emaFast} onChange={v => onUpdateParam('emaFast', v)} min={5} max={50} step={1} />
                  <Slider label="EMA Slow" value={params.emaSlow} onChange={v => onUpdateParam('emaSlow', v)} min={20} max={100} step={5} />
                </>
              )}
              {enabled.htfBias && (
                <Slider label="1h EMA Period" value={params.htfEma} onChange={v => onUpdateParam('htfEma', v)} min={50} max={300} step={10} />
              )}
              {enabled.rsi && (
                <>
                  <Slider label="RSI Length" value={params.rsiLength} onChange={v => onUpdateParam('rsiLength', v)} min={5} max={30} step={1} />
                  <Slider label="RSI Long Min" value={params.rsiLongMin} onChange={v => onUpdateParam('rsiLongMin', v)} min={35} max={60} step={1} />
                  <Slider label="RSI Long Max" value={params.rsiLongMax} onChange={v => onUpdateParam('rsiLongMax', v)} min={55} max={75} step={1} />
                  <Slider label="RSI Short Min" value={params.rsiShortMin} onChange={v => onUpdateParam('rsiShortMin', v)} min={25} max={45} step={1} />
                  <Slider label="RSI Short Max" value={params.rsiShortMax} onChange={v => onUpdateParam('rsiShortMax', v)} min={40} max={60} step={1} />
                </>
              )}
              {enabled.macd && (
                <>
                  <Slider label="MACD Fast" value={params.macdFast} onChange={v => onUpdateParam('macdFast', v)} min={5} max={20} step={1} />
                  <Slider label="MACD Slow" value={params.macdSlow} onChange={v => onUpdateParam('macdSlow', v)} min={15} max={40} step={1} />
                  <Slider label="MACD Signal" value={params.macdSignal} onChange={v => onUpdateParam('macdSignal', v)} min={3} max={15} step={1} />
                </>
              )}
              {enabled.volume && (
                <>
                  <Slider label="Volume SMA" value={params.volumeSma} onChange={v => onUpdateParam('volumeSma', v)} min={5} max={50} step={1} />
                  <Slider label="Min Vol Multiple" value={params.minVolMultiple} onChange={v => onUpdateParam('minVolMultiple', v)} min={1.0} max={3.0} step={0.1} unit="x" />
                </>
              )}
              {enabled.atr && (
                <>
                  <Slider label="ATR Length" value={params.atrLength} onChange={v => onUpdateParam('atrLength', v)} min={5} max={30} step={1} />
                  <Slider label="Min ATR %" value={params.minAtrPercent} onChange={v => onUpdateParam('minAtrPercent', v)} min={0.1} max={1.0} step={0.05} unit="%" />
                </>
              )}
              {enabled.bodyFilter && (
                <Slider label="Body/Range Min" value={params.bodyRatioMin} onChange={v => onUpdateParam('bodyRatioMin', v)} min={0.3} max={0.9} step={0.05} />
              )}
            </div>
          </div>

          {/* R-based Trade Parameters */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">📐 R-Based Trade Setup</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <Slider label="TP (R multiple)" value={params.tpR} onChange={v => onUpdateParam('tpR', v)} min={0.5} max={3.0} step={0.1} colorClass="text-emerald-400" unit="R" />
              <Slider label="Strong TP (R)" value={params.strongTpR} onChange={v => onUpdateParam('strongTpR', v)} min={0.5} max={3.5} step={0.1} colorClass="text-emerald-400" unit="R" />
              <Slider label="Break-Even at" value={params.beAtR} onChange={v => onUpdateParam('beAtR', v)} min={0.3} max={2.0} step={0.05} colorClass="text-amber-400" unit="R" />
              <Slider label="Stop ATR Cap" value={params.stopAtrCap} onChange={v => onUpdateParam('stopAtrCap', v)} min={0.5} max={2.5} step={0.1} colorClass="text-red-400" unit="×ATR" />
              <Slider label="Stop Buffer ATR" value={params.stopBufferAtr} onChange={v => onUpdateParam('stopBufferAtr', v)} min={0.05} max={0.5} step={0.05} colorClass="text-red-400" unit="×ATR" />
              <Slider label="Time Stop (candles)" value={params.timeStopCandles} onChange={v => onUpdateParam('timeStopCandles', v)} min={3} max={20} step={1} />
            </div>
          </div>

          {/* Risk Management */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">💰 Risk Management</p>
            <div className="grid grid-cols-2 gap-4">
              {/* Starting Wallet */}
              {onUpdateWalletSize && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-white/70">Starting Wallet</label>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-white/90">${walletSize || 1000}</span>
                      <span className="text-[10px] text-white/30">paper balance</span>
                    </div>
                  </div>
                  <input type="range" min={100} max={10000} step={100} value={walletSize || 1000}
                    onChange={e => onUpdateWalletSize(Number(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-white/10 via-white/20 to-white/30" />
                  <div className="flex items-center justify-between mt-1 text-[9px] text-white/20"><span>$100</span><span>Takes effect on Reset Wallet</span><span>$10,000</span></div>
                </div>
              )}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Position Size</label>
                  <span className="text-lg font-bold font-mono text-amber-400">${config.positionSize}</span>
                </div>
                <input type="range" min={10} max={500} step={10} value={config.positionSize ?? 100}
                  onChange={e => onUpdateConfig({ positionSize: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-amber-600/20 via-amber-500/40 to-amber-400/60" />
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Leverage</label>
                  <span className={cn('text-lg font-bold font-mono', leverageColor)}>{config.leverage}x</span>
                </div>
                <input type="range" min={1} max={20} step={1} value={config.leverage}
                  onChange={e => onUpdateConfig({ leverage: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-emerald-500/30 via-amber-500/30 to-orange-500/30" />
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-white/70">Max Open Positions</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-violet-400">{config.maxPositions}</span>
                    <span className="text-[10px] text-white/30">slots</span>
                  </div>
                </div>
                <input type="range" min={1} max={20} step={1} value={config.maxPositions ?? 10}
                  onChange={e => onUpdateConfig({ maxPositions: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-violet-600/20 via-violet-500/40 to-violet-400/60" />
                <div className="flex items-center justify-between mt-1 text-[9px] text-white/20"><span>1</span><span>20</span></div>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
            <button onClick={onReset} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all text-xs">
              <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3 mr-1.5" />Reset to defaults
            </button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
