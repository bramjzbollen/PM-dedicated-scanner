'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ScannerStatsBar } from './scanner-stats';
import { ActivePaperTrades } from './active-paper-trades';
import { QueueTable } from './queue-table';
import { ActiveScansTable } from './active-scans-table';
import { TradeHistory } from './trade-history';
import type { ScannerSignal, QueuedSignal, ScannerStats, PaperTrade, ClosedTrade, ScannerSettings, IndicatorToggles } from '@/lib/scanner-types';
import { ROVER_STRATEGY, DEFAULT_INDICATOR_TOGGLES } from '@/lib/scanner-types';
import {
  generateMockScannerSignals,
  generateMockQueuedSignals,
  generateMockScannerStats,
  generateMockPaperTrades,
  generateMockClosedTrades,
} from '@/lib/scanner-mock-data';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSatelliteDish, faCircle, faGear, faChevronUp, faChevronDown, faVolumeHigh, faVolumeXmark, faClock } from '@fortawesome/free-solid-svg-icons';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// ─── Sound Utility ───
function playTradeSound(win: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (win) {
      // Win: ascending two-tone
      osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
    } else {
      // Loss: descending tone
      osc.frequency.setValueAtTime(392, ctx.currentTime); // G4
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15); // E4
    }
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not available
  }
}

export function PairScanner() {
  const [signals, setSignals] = useState<ScannerSignal[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [queue, setQueue] = useState<QueuedSignal[]>([]);
  const [stats, setStats] = useState<ScannerStats | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ScannerSettings>({
    leverage: ROVER_STRATEGY.leverage,
    maxMonitoredPairs: ROVER_STRATEGY.maxMonitoredPairs,
    indicators: { ...DEFAULT_INDICATOR_TOGGLES },
    soundEnabled: true,
  });
  
  // Ref to track sound setting in interval callbacks
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateData = useCallback(() => {
    const newSignals = generateMockScannerSignals().slice(0, settings.maxMonitoredPairs);
    const newPaperTrades = generateMockPaperTrades(newSignals).map(t => ({
      ...t,
      leverage: settings.leverage,
    }));
    const newQueue = generateMockQueuedSignals(newSignals);
    const newStats = generateMockScannerStats(newSignals, newQueue);

    setSignals(newSignals);
    setPaperTrades(newPaperTrades);
    setQueue(newQueue);
    setStats(newStats);
    setLastUpdate(new Date());
  }, [settings.maxMonitoredPairs, settings.leverage]);

  useEffect(() => {
    // Initial load
    updateData();
    setClosedTrades(generateMockClosedTrades());
    setIsConnected(true);

    // Simulate real-time price updates on paper trades
    const interval = setInterval(() => {
      setPaperTrades(prev => prev.map(trade => {
        const priceChange = trade.currentPrice * (Math.random() - 0.48) * 0.003;
        return {
          ...trade,
          currentPrice: trade.currentPrice + priceChange,
          leverage: settingsRef.current.leverage,
        };
      }));

      setSignals(prev => prev.map(signal => {
        const priceChange = signal.price * (Math.random() - 0.5) * 0.002;
        const newPrice = signal.price + priceChange;
        const stochShift = (Math.random() - 0.5) * 3;
        const newK = Math.max(0, Math.min(100, signal.stochRSI_K + stochShift));
        const newD = Math.max(0, Math.min(100, signal.stochRSI_D + stochShift * 0.5));
        const volShift = (Math.random() - 0.5) * 0.2;
        const newVol = Math.max(0.3, signal.volumeRatio + volShift);
        const type = newK < 20 ? 'LONG' as const : newK > 80 ? 'SHORT' as const : 'NEUTRAL' as const;

        let confidence = 0;
        if (type !== 'NEUTRAL') {
          const extremity = newK < 20 ? (20 - newK) / 20 : (newK - 80) / 20;
          confidence += extremity * 40;
          if (newVol >= 1.5) confidence += Math.min((newVol - 1) / 3, 1) * 25;
          if (signal.atrRatio < 2) confidence += (1 - signal.atrRatio / 2) * 15;
          if (signal.spread < 0.1) confidence += (1 - signal.spread / 0.1) * 5;
          confidence += 10;
        }

        return {
          ...signal,
          price: newPrice,
          stochRSI_K: Math.round(newK * 10) / 10,
          stochRSI_D: Math.round(newD * 10) / 10,
          volumeRatio: Math.round(newVol * 100) / 100,
          type,
          confidence: Math.max(0, Math.min(100, Math.round(confidence))),
          timestamp: new Date(),
        };
      }));

      setLastUpdate(new Date());
    }, 3000);

    // Auto-close mechanism: every 10s, close 1-2 random trades
    const autoClose = setInterval(() => {
      setPaperTrades(prev => {
        if (prev.length < 2) return prev;
        
        const numToClose = Math.random() > 0.5 ? 2 : 1;
        const shuffled = [...prev].sort(() => Math.random() - 0.5);
        const toClose = shuffled.slice(0, numToClose);
        const toKeep = prev.filter(t => !toClose.find(c => c.id === t.id));
        
        const reasons: Array<ClosedTrade['closeReason']> = ['tp1', 'tp2', 'stop_loss', 'max_hold'];
        
        const newClosed: ClosedTrade[] = toClose.map(trade => {
          const rawPnl = trade.direction === 'LONG'
            ? ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100
            : ((trade.entryPrice - trade.currentPrice) / trade.entryPrice) * 100;
          const leveragedPnl = rawPnl * trade.leverage;
          const pnlDollar = (leveragedPnl / 100) * trade.positionSize;
          const isWin = leveragedPnl > 0;
          const reason = isWin 
            ? (Math.random() > 0.4 ? 'tp1' : 'tp2')
            : (Math.random() > 0.5 ? 'stop_loss' : 'max_hold');
          
          // Play sound
          if (settingsRef.current.soundEnabled) {
            playTradeSound(isWin);
          }

          return {
            id: `closed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            exitPrice: trade.currentPrice,
            pnlPercent: Math.round(leveragedPnl * 100) / 100,
            pnlDollar: Math.round(pnlDollar * 100) / 100,
            leverage: trade.leverage,
            openedAt: trade.openedAt,
            closedAt: new Date(),
            closeReason: reason,
          };
        });
        
        setClosedTrades(prevClosed => [...newClosed, ...prevClosed]);
        
        // Toast notification
        for (const ct of newClosed) {
          const isWin = ct.pnlPercent > 0;
          toast(
            `${isWin ? '🟢' : '🔴'} ${ct.symbol.replace('USDT', '')} closed`,
            {
              description: `${isWin ? '+' : ''}${ct.pnlPercent.toFixed(2)}% ($${ct.pnlDollar.toFixed(2)})`,
              style: {
                background: 'rgba(15, 15, 25, 0.95)',
                border: `1px solid ${isWin ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                color: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(12px)',
              },
            }
          );
        }
        
        return toKeep;
      });
    }, 10000);

    // Full refresh every 30 seconds
    const fullRefresh = setInterval(updateData, 30000);

    return () => {
      clearInterval(interval);
      clearInterval(autoClose);
      clearInterval(fullRefresh);
    };
  }, [updateData]);

  // Update queue/stats when signals change
  useEffect(() => {
    if (signals.length > 0) {
      const newQueue = generateMockQueuedSignals(signals);
      setQueue(newQueue);
      setStats(generateMockScannerStats(signals, newQueue));
    }
  }, [signals]);

  const handleCloseTrade = (tradeId: string) => {
    setPaperTrades(prev => {
      const trade = prev.find(t => t.id === tradeId);
      if (trade) {
        const rawPnl = trade.direction === 'LONG'
          ? ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          : ((trade.entryPrice - trade.currentPrice) / trade.entryPrice) * 100;
        const leveragedPnl = rawPnl * trade.leverage;
        const pnlDollar = (leveragedPnl / 100) * trade.positionSize;
        const isWin = leveragedPnl > 0;

        if (settings.soundEnabled) {
          playTradeSound(isWin);
        }

        const closedTrade: ClosedTrade = {
          id: `closed-${Date.now()}`,
          symbol: trade.symbol,
          direction: trade.direction,
          entryPrice: trade.entryPrice,
          exitPrice: trade.currentPrice,
          pnlPercent: Math.round(leveragedPnl * 100) / 100,
          pnlDollar: Math.round(pnlDollar * 100) / 100,
          leverage: trade.leverage,
          openedAt: trade.openedAt,
          closedAt: new Date(),
          closeReason: 'manual',
        };

        setClosedTrades(prevClosed => [closedTrade, ...prevClosed]);
      }
      return prev.filter(t => t.id !== tradeId);
    });
  };

  const toggleIndicator = (key: keyof IndicatorToggles) => {
    setSettings(prev => ({
      ...prev,
      indicators: { ...prev.indicators, [key]: !prev.indicators[key] },
    }));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/[0.1] glow-cyan">
            <FontAwesomeIcon icon={faSatelliteDish} className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white/90">Pair Scanner</h2>
            <p className="text-[11px] text-white/40">
              Rover&apos;s Strategy • {signals.length} pairs •{' '}
              <span className="text-cyan-400/70">{ROVER_STRATEGY.timeframe}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Timeframe badge */}
          <Badge className="bg-cyan-500/[0.12] text-cyan-400 border-cyan-500/[0.15] text-[10px] gap-1">
            <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" />
            {ROVER_STRATEGY.timeframe}
          </Badge>
          {/* Settings button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 text-[11px] ${
              showSettings
                ? 'bg-indigo-500/[0.12] border-indigo-500/[0.2] text-indigo-400'
                : 'bg-white/[0.04] border-white/[0.06] text-white/50 hover:text-white/70 hover:bg-white/[0.06]'
            }`}
          >
            <FontAwesomeIcon icon={faGear} className="h-3 w-3" />
            Settings
            <FontAwesomeIcon icon={showSettings ? faChevronUp : faChevronDown} className="h-2 w-2" />
          </button>
          {/* Sound toggle */}
          <button
            onClick={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
            className={`flex items-center justify-center h-8 w-8 rounded-lg border transition-all duration-200 ${
              settings.soundEnabled
                ? 'bg-emerald-500/[0.1] border-emerald-500/[0.15] text-emerald-400'
                : 'bg-white/[0.04] border-white/[0.06] text-white/30'
            }`}
            title={settings.soundEnabled ? 'Sound on' : 'Sound off'}
          >
            <FontAwesomeIcon icon={settings.soundEnabled ? faVolumeHigh : faVolumeXmark} className="h-3.5 w-3.5" />
          </button>
          {/* Connection status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <FontAwesomeIcon
              icon={faCircle}
              className={`h-2 w-2 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-red-400'}`}
            />
            <span className="text-[11px] text-white/50">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <span className="text-[10px] text-white/30">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] p-5 space-y-5 animate-in slide-in-from-top-2 duration-200">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Indicator Toggles */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Indicators</h3>
              <div className="space-y-2">
                {([
                  ['stochRSI', 'Stoch RSI'],
                  ['volume', 'Volume Spike'],
                  ['ema', 'EMA Confirmation'],
                  ['atr', 'ATR Filter'],
                  ['spread', 'Spread Filter'],
                ] as [keyof IndicatorToggles, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer group">
                    <button
                      onClick={() => toggleIndicator(key)}
                      className={`relative h-5 w-9 rounded-full transition-all duration-200 ${
                        settings.indicators[key]
                          ? 'bg-indigo-500/60 border-indigo-500/30'
                          : 'bg-white/[0.08] border-white/[0.06]'
                      } border`}
                    >
                      <span
                        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-200 ${
                          settings.indicators[key]
                            ? 'left-[18px] bg-indigo-300'
                            : 'left-0.5 bg-white/30'
                        }`}
                      />
                    </button>
                    <span className={`text-xs transition-colors ${
                      settings.indicators[key] ? 'text-white/80' : 'text-white/30'
                    }`}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Leverage */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Leverage</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-amber-400">{settings.leverage}×</span>
                  <Badge className="bg-amber-500/[0.1] text-amber-400/80 border-amber-500/[0.12] text-[10px]">
                    {settings.leverage <= 10 ? 'Low' : settings.leverage <= 50 ? 'Medium' : 'High'}
                  </Badge>
                </div>
                <input
                  type="range"
                  min="1"
                  max="125"
                  value={settings.leverage}
                  onChange={e => setSettings(s => ({ ...s, leverage: parseInt(e.target.value) }))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.08] accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-white/30">
                  <span>1×</span>
                  <span>25×</span>
                  <span>50×</span>
                  <span>75×</span>
                  <span>100×</span>
                  <span>125×</span>
                </div>
              </div>
            </div>

            {/* Monitored Pairs */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Monitored Pairs</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-cyan-400">{settings.maxMonitoredPairs}</span>
                  <Badge className="bg-cyan-500/[0.1] text-cyan-400/80 border-cyan-500/[0.12] text-[10px]">
                    pairs
                  </Badge>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={settings.maxMonitoredPairs}
                  onChange={e => setSettings(s => ({ ...s, maxMonitoredPairs: parseInt(e.target.value) }))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.08] accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-white/30">
                  <span>10</span>
                  <span>100</span>
                  <span>250</span>
                  <span>500</span>
                </div>
              </div>
            </div>

            {/* Sound & Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Alerts & Info</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-white/70">Trade close sound</span>
                  <button
                    onClick={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
                    className={`relative h-5 w-9 rounded-full transition-all duration-200 ${
                      settings.soundEnabled
                        ? 'bg-emerald-500/60 border-emerald-500/30'
                        : 'bg-white/[0.08] border-white/[0.06]'
                    } border`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-200 ${
                        settings.soundEnabled
                          ? 'left-[18px] bg-emerald-300'
                          : 'left-0.5 bg-white/30'
                      }`}
                    />
                  </button>
                </label>
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/40">Timeframe</span>
                    <span className="text-cyan-400 font-mono">{ROVER_STRATEGY.timeframe}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/40">Max Hold</span>
                    <span className="text-white/70 font-mono">{ROVER_STRATEGY.maxHoldMinutes}m</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/40">Stop Loss</span>
                    <span className="text-red-400 font-mono">{ROVER_STRATEGY.stopLoss}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/40">Take Profit</span>
                    <span className="text-emerald-400 font-mono">TP1: {ROVER_STRATEGY.tp1}% / TP2: {ROVER_STRATEGY.tp2}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/40">Daily Loss Limit</span>
                    <span className="text-amber-400 font-mono">${ROVER_STRATEGY.dailyLossLimit}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      {stats && <ScannerStatsBar stats={stats} />}

      {/* Two Column Layout: Active Paper Trades + Active Scans */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ActivePaperTrades
            trades={paperTrades}
            onCloseTrade={handleCloseTrade}
          />
        </div>
        <div className="lg:col-span-2">
          <ActiveScansTable signals={signals} disabledIndicators={settings.indicators} />
        </div>
      </div>

      {/* Trade History */}
      <TradeHistory trades={closedTrades} />
    </div>
  );
}
