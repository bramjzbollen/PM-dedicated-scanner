'use client';

/**
 * useTradingEngineV2 — Server-synced version
 *
 * All state lives server-side in JSON files.
 * Client polls for state and sends actions via POST.
 * Multiple browsers see the same positions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NormalizedSignal } from './normalize-signal';
import { normalizeSignals, symbolKey } from './normalize-signal';

// ── Types (matching server) ──

export interface ServerPosition {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  previousPrice?: number;
  size: number;
  leverage: number;
  quantity: number;
  remainingQuantity: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  trailingActivated: boolean;
  peakPrice?: number;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  closeReason?: 'tp' | 'sl' | 'trailing' | 'manual' | 'timeout' | 'breakeven' | string;
  pnl: number;
  pnlPercent: number;
  partialCloses: any[];
  _breakEvenApplied?: boolean;
  _riskR?: number;
}

export interface ServerStats {
  walletBalance: number;
  realizedPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  bestTrade: number;
  worstTrade: number;
  totalDurationMs: number;
  closedCount: number;
}

export interface ServerConfig {
  autoEntry: boolean;
  minConfidence: number;
  maxPositions: number;
  queueEnabled: boolean;
  positionSize: number;
  leverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
  trailingActivationPercent: number;
  timeoutMinutes?: number;
  maxHoldMinutes?: number;
  cooldownAfterLossMinutes?: number;
  reentryCooldownSameSymbolMinutes?: number;
  reentryCooldownLossMinutes?: number;
  latchCandles?: number;
  lossStreakLimit?: number;
  lossStreakPauseMinutes?: number;
}

export interface ServerQueueItem {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  price: number;
  queuedAt: string;
}

export interface RegimeConfig {
  enabled: boolean;
  neutralBandPct: number;
  hysteresisPct: number;
  neutralThrottleFactor: number;
  neutralConfidenceUplift: number;
  neutralSensitivity?: number;
  fallbackOnMissingData: 'neutral' | 'allow-all' | 'block-all';
  filterMode: 'strict' | 'signal-first';
  signalFirstDirectionalBlock: boolean;
  signalFirstDirectionalBlockMode?: 'hard' | 'soft';
  signalFirstDisableCooldown: boolean;
  signalFirstDisableLossStreak: boolean;
  signalFirstDisableLatch: boolean;
  signalFirstDisablePriceDriftCheck: boolean;
}

export interface RegimeState {
  status: 'bullish' | 'bearish' | 'neutral';
  source: 'btc-1h' | 'fallback';
  updatedAt: string;
  btcPrice?: number;
  ema50_1h?: number;
  ema200_1h?: number;
  ema50SlopePct?: number;
}

export interface RegimeTelemetry {
  blockedLongCount: number;
  blockedShortCount: number;
  neutralThrottleEvents: number;
  neutralConfidenceBlocks: number;
  neutralLastEntryTs: number;
}

export interface LoopTelemetry {
  topRepeatedSymbols: Array<{ symbol: string; count: number; avgGapSec: number }>;
  avgReentryGapSec: number;
  loopBlocks: number;
  lookbackMinutes: number;
}

// Re-export param types for settings panels
export {
  type V2ScalpParams, type V2ScalpEnabled,
  type V2SwingParams, type V2SwingEnabled,
} from './use-trading-engine-v2-params';

export interface V2Signal extends NormalizedSignal {
  trade?: any;
  skipTrade?: boolean;
}

// ── Param defaults (kept client-side for settings UI) ──

export interface V2ScalpParams {
  emaFast: number; emaMid: number; emaSlow: number;
  rsiLength: number; rsiLongMin: number; rsiLongMax: number; rsiShortMin: number; rsiShortMax: number;
  macdFast: number; macdSlow: number; macdSignal: number;
  volumeSma: number; minVolMultiple: number;
  atrLength: number; minAtrPercent: number;
  bodyRatioMin: number;
  tpR: number; strongTpR: number; beAtR: number;
  timeStopCandles: number; cooldownMinutes: number; stopAtrCap: number;
}

export interface V2ScalpEnabled {
  emaTrend: boolean; rsi: boolean; macd: boolean; volume: boolean; atr: boolean; bodyFilter: boolean;
}

export interface V2SwingParams {
  emaFast: number; emaSlow: number; htfEma: number;
  rsiLength: number; rsiLongMin: number; rsiLongMax: number; rsiShortMin: number; rsiShortMax: number;
  macdFast: number; macdSlow: number; macdSignal: number;
  volumeSma: number; minVolMultiple: number;
  atrLength: number; minAtrPercent: number;
  bodyRatioMin: number;
  tpR: number; strongTpR: number; beAtR: number;
  timeStopCandles: number; stopAtrCap: number; stopBufferAtr: number;
}

export interface V2SwingEnabled {
  emaTrend: boolean; htfBias: boolean; rsi: boolean; macd: boolean;
  volume: boolean; atr: boolean; bodyFilter: boolean; pullbackDetection: boolean;
}

export const DEFAULT_V2_SCALP_PARAMS: V2ScalpParams = {
  emaFast: 9, emaMid: 21, emaSlow: 50,
  rsiLength: 7, rsiLongMin: 45, rsiLongMax: 58, rsiShortMin: 42, rsiShortMax: 55,
  macdFast: 5, macdSlow: 13, macdSignal: 6,
  volumeSma: 20, minVolMultiple: 1.20,
  atrLength: 14, minAtrPercent: 0.08,
  bodyRatioMin: 0.55,
  tpR: 1.50, strongTpR: 2.00, beAtR: 0.75,
  timeStopCandles: 6, cooldownMinutes: 3, stopAtrCap: 1.50,
};

export const DEFAULT_V2_SCALP_ENABLED: V2ScalpEnabled = {
  emaTrend: true, rsi: true, macd: true, volume: true, atr: true, bodyFilter: true,
};

export const DEFAULT_V2_SWING_PARAMS: V2SwingParams = {
  emaFast: 20, emaSlow: 50, htfEma: 200,
  rsiLength: 14, rsiLongMin: 50, rsiLongMax: 62, rsiShortMin: 38, rsiShortMax: 50,
  macdFast: 12, macdSlow: 26, macdSignal: 9,
  volumeSma: 20, minVolMultiple: 1.20,
  atrLength: 14, minAtrPercent: 0.35,
  bodyRatioMin: 0.55,
  tpR: 1.50, strongTpR: 2.00, beAtR: 0.75,
  timeStopCandles: 8, stopAtrCap: 1.50, stopBufferAtr: 0.15,
};

export const DEFAULT_V2_SWING_ENABLED: V2SwingEnabled = {
  emaTrend: true, htfBias: true, rsi: true, macd: true,
  volume: true, atr: true, bodyFilter: true, pullbackDetection: true,
};

// ── Helper: save/load from localStorage (only for scanner UI params) ──

function loadLocal<T>(key: string, def: T): T {
  if (typeof window === 'undefined') return def;
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
}
function saveLocal(key: string, val: unknown) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── API helpers ──

const API_URL = '/api/v2-trade-state';

const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  enabled: true,
  neutralBandPct: 0.35,
  hysteresisPct: 0.15,
  neutralThrottleFactor: 0.30,
  neutralConfidenceUplift: 10,
  neutralSensitivity: 0.58,
  fallbackOnMissingData: 'neutral',
  filterMode: 'signal-first',
  signalFirstDirectionalBlock: true,
  signalFirstDirectionalBlockMode: 'soft',
  signalFirstDisableCooldown: false,
  signalFirstDisableLossStreak: false,
  signalFirstDisableLatch: false,
  signalFirstDisablePriceDriftCheck: true,
};

const DEFAULT_REGIME_STATE: RegimeState = {
  status: 'neutral',
  source: 'fallback',
  updatedAt: '',
};

const DEFAULT_REGIME_TELEMETRY: RegimeTelemetry = {
  blockedLongCount: 0,
  blockedShortCount: 0,
  neutralThrottleEvents: 0,
  neutralConfidenceBlocks: 0,
  neutralLastEntryTs: 0,
};

const DEFAULT_LOOP_TELEMETRY: LoopTelemetry = {
  topRepeatedSymbols: [],
  avgReentryGapSec: 0,
  loopBlocks: 0,
  lookbackMinutes: 60,
};

async function fetchState(mode: string) {
  const res = await fetch(`${API_URL}?mode=${mode}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
}

async function sendAction(mode: string, action: string, params: Record<string, any> = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, action, ...params }),
  });
  if (!res.ok) throw new Error('Action failed');
  return res.json();
}

// ── Main Hook ──

export type V2TradingMode = 'v2-scalping' | 'v2-swing';

interface PriceFeedHealth {
  feedAgeMs: number;
  wsConnected: boolean;
  reconnectCount: number;
  staleSymbols: number;
  source: 'ws' | 'poll' | 'fallback' | 'unknown' | 'unavailable';
  staleByOpenPositions: string[];
}

export function useTradingEngineV2(mode: V2TradingMode) {
  const isSwing = mode === 'v2-swing';
  const scannerApiUrl = isSwing ? '/api/v2-swing-scanner' : '/api/v2-scalp-scanner';
  const livePricesApiUrl = '/api/live-prices';
  const scannerIntervalMs = isSwing ? 15000 : 5000;
  const priceIntervalMs = isSwing ? 2000 : 1000;
  const cooldownMs = isSwing ? 0 : 3 * 60 * 1000;

  // ── Server state (polled) ──
  const [positions, setPositions] = useState<ServerPosition[]>([]);
  const [closedPositions, setClosedPositions] = useState<ServerPosition[]>([]);
  const [queue, setQueue] = useState<ServerQueueItem[]>([]);
  const [stats, setStats] = useState<ServerStats>({ walletBalance: 1000, realizedPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, bestTrade: 0, worstTrade: 0, totalDurationMs: 0, closedCount: 0 });
  const [config, setConfig] = useState<ServerConfig>({ autoEntry: true, minConfidence: 70, maxPositions: 8, queueEnabled: true, positionSize: 100, leverage: 15, stopLossPercent: 0.8, takeProfitPercent: 1.5, trailingStopPercent: 0.6, trailingActivationPercent: 1.0, timeoutMinutes: 3 });
  const [regimeConfig, setRegimeConfig] = useState<RegimeConfig>(DEFAULT_REGIME_CONFIG);
  const [regimeState, setRegimeState] = useState<RegimeState>(DEFAULT_REGIME_STATE);
  const [regimeTelemetry, setRegimeTelemetry] = useState<RegimeTelemetry>(DEFAULT_REGIME_TELEMETRY);
  const [loopTelemetry, setLoopTelemetry] = useState<LoopTelemetry>(DEFAULT_LOOP_TELEMETRY);
  const [isRunning, setIsRunningState] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [latestSignals, setLatestSignals] = useState<V2Signal[]>([]);
  const [openPnl, setOpenPnl] = useState(0);
  const [totalPnl, setTotalPnl] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [avgDuration, setAvgDuration] = useState(0);
  const [effectiveMaxPositions, setEffectiveMaxPositions] = useState(8);
  const [initialWalletSize, setInitialWalletSize] = useState(1000);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [priceFeedHealth, setPriceFeedHealth] = useState<PriceFeedHealth>({
    feedAgeMs: Number.POSITIVE_INFINITY,
    wsConnected: false,
    reconnectCount: 0,
    staleSymbols: 0,
    source: 'unknown',
    staleByOpenPositions: [],
  });

  // ── Client-only: scanner params (UI state, not synced) ──
  const [v2ScalpParams, setV2ScalpParams] = useState<V2ScalpParams>(() => loadLocal(`${mode}-v2-scalp-params`, DEFAULT_V2_SCALP_PARAMS));
  const [v2ScalpEnabled, setV2ScalpEnabled] = useState<V2ScalpEnabled>(() => loadLocal(`${mode}-v2-scalp-enabled`, DEFAULT_V2_SCALP_ENABLED));
  const [v2SwingParams, setV2SwingParams] = useState<V2SwingParams>(() => loadLocal(`${mode}-v2-swing-params`, DEFAULT_V2_SWING_PARAMS));
  const [v2SwingEnabled, setV2SwingEnabled] = useState<V2SwingEnabled>(() => loadLocal(`${mode}-v2-swing-enabled`, DEFAULT_V2_SWING_ENABLED));

  useEffect(() => { saveLocal(`${mode}-v2-scalp-params`, v2ScalpParams); }, [v2ScalpParams, mode]);
  useEffect(() => { saveLocal(`${mode}-v2-scalp-enabled`, v2ScalpEnabled); }, [v2ScalpEnabled, mode]);
  useEffect(() => { saveLocal(`${mode}-v2-swing-params`, v2SwingParams); }, [v2SwingParams, mode]);
  useEffect(() => { saveLocal(`${mode}-v2-swing-enabled`, v2SwingEnabled); }, [v2SwingEnabled, mode]);

  const mountedRef = useRef(true);
  const isRunningRef = useRef(false);
  const pricesRef = useRef(prices);
  const priceTsRef = useRef<Record<string, number>>({});
  useEffect(() => { pricesRef.current = prices; }, [prices]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  // Page visibility
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setIsPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // ── Poll server state ──
  const syncState = useCallback(async () => {
    try {
      const data = await fetchState(mode);
      if (!mountedRef.current) return;
      setPositions(data.positions || []);
      setClosedPositions(data.closedPositions || []);
      setQueue(data.queue || []);
      setStats(data.stats || stats);
      setConfig(prev => ({ ...prev, ...(data.config || {}) }));
      setRegimeConfig(data.regimeConfig || DEFAULT_REGIME_CONFIG);
      setRegimeState(data.regimeState || DEFAULT_REGIME_STATE);
      setRegimeTelemetry(data.regimeTelemetry || DEFAULT_REGIME_TELEMETRY);
      setLoopTelemetry(data.loopTelemetry || DEFAULT_LOOP_TELEMETRY);
      setIsRunningState(data.isRunning || false);
      setLastUpdate(data.lastUpdate || '');
      setOpenPnl(data.openPnl || 0);
      setTotalPnl(data.totalPnl || 0);
      setWinRate(data.winRate || 0);
      setAvgDuration(data.avgDuration || 0);
      setEffectiveMaxPositions(data.effectiveMaxPositions || 8);
      setInitialWalletSize(data.initialWalletSize || 1000);
    } catch (e) {
      console.error(`[${mode}] Sync error:`, e);
    }
  }, [mode]);

  // Initial load + polling
  useEffect(() => {
    syncState();
    const interval = setInterval(syncState, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [syncState]);

  useEffect(() => {
    const staleMs = mode === 'v2-scalping' ? 15_000 : 45_000;
    const now = Date.now();
    const staleByOpenPositions = positions
      .map((p) => p.symbol)
      .filter((s) => !priceTsRef.current[s] || (now - priceTsRef.current[s]) > staleMs);
    setPriceFeedHealth((prev) => ({ ...prev, staleByOpenPositions }));
  }, [mode, positions]);

  // ── Price tick: send prices to server for exit checks ──
  const priceTick = useCallback(async () => {
    if (!isRunningRef.current || !mountedRef.current) return;
    try {
      const res = await fetch(livePricesApiUrl, { cache: 'no-store' });
      if (!mountedRef.current) return;
      const data = await res.json();
      if (!data || typeof data !== 'object') return;

      const meta = (data as any).__meta || {};
      const symbolTs = (meta.symbolTs || {}) as Record<string, number>;
      const now = Date.now();

      const newPrices: Record<string, number> = {};
      Object.entries(data).forEach(([s, p]) => {
        if (s === '__meta') return;
        if (s && Number.isFinite(p) && (p as number) > 0) {
          newPrices[s] = p as number;
          priceTsRef.current[s] = symbolTs[s] || now;
        }
      });

      const staleMs = mode === 'v2-scalping' ? 15_000 : 45_000;
      const staleOpen = positions
        .map((p) => p.symbol)
        .filter((s) => !priceTsRef.current[s] || (now - priceTsRef.current[s]) > staleMs);

      // Fallback path: if open positions are stale, pull fresh scanner snapshot immediately.
      if (staleOpen.length > 0) {
        try {
          const fallbackRes = await fetch(scannerApiUrl, { cache: 'no-store' });
          const fallbackData = await fallbackRes.json();
          if (fallbackData?.prices) {
            Object.entries(fallbackData.prices).forEach(([s, p]) => {
              if (staleOpen.includes(s) && Number.isFinite(p) && (p as number) > 0) {
                newPrices[s] = p as number;
                priceTsRef.current[s] = now;
              }
            });
          }
        } catch {}
      }

      const lastSuccessTs = Number(meta.lastSuccessTs || 0);
      setPriceFeedHealth({
        // Must represent "time since last successful feed update", not app uptime.
        feedAgeMs: lastSuccessTs > 0 ? Math.max(0, now - lastSuccessTs) : Number.POSITIVE_INFINITY,
        wsConnected: Boolean(meta.ws?.connected),
        reconnectCount: Number(meta.ws?.reconnectCount || 0),
        staleSymbols: Number(meta.staleSymbols || 0),
        source: (meta.source || 'unknown') as PriceFeedHealth['source'],
        staleByOpenPositions: staleOpen,
      });

      const mergedPrices = { ...pricesRef.current, ...newPrices };
      setPrices(mergedPrices);

      // Send prices to server for exit checks
      await sendAction(mode, 'updatePrices', { prices: mergedPrices });
    } catch (e) {
      console.error(`[${mode}] Price tick error:`, e);
      // Keep server-side exit/time checks alive even if live-price fetch fails
      await sendAction(mode, 'updatePrices', { prices: pricesRef.current || {} });
    }
  }, [livePricesApiUrl, mode, positions, scannerApiUrl]);

  // ── Scanner tick: send signals to server for auto-entry ──
  const scannerTick = useCallback(async () => {
    if (!isRunningRef.current || !mountedRef.current) return;
    try {
      const res = await fetch(scannerApiUrl, { cache: 'no-store' });
      if (!mountedRef.current) return;
      const data = await res.json();
      if (!data.success || !data.signals) return;

      const signals: V2Signal[] = (data.signals as any[]).map(raw => ({
        ...normalizeSignals([raw])[0],
        trade: raw.trade, skipTrade: raw.skipTrade,
      })).filter(s => s.pair || s.symbol);

      if (mountedRef.current) setLatestSignals(signals);

      const scannerPrices: Record<string, number> = {};
      if (data.prices) Object.entries(data.prices).forEach(([s, p]) => {
        if (s && Number.isFinite(p) && (p as number) > 0) {
          scannerPrices[s] = p as number;
          priceTsRef.current[s] = Date.now();
        }
      });
      const mergedPrices = { ...pricesRef.current, ...scannerPrices };
      setPrices(mergedPrices);

      // Send signals + prices to server for processing
      const processableSignals = signals
        .filter(s => !s.skipTrade)
        .map(s => ({ symbol: symbolKey(s), signal: s.signal, confidence: s.confidence, reason: s.reason, price: s.price, skipTrade: s.skipTrade, trade: s.trade }));

      await sendAction(mode, 'processSignals', {
        signals: processableSignals,
        prices: mergedPrices,
        cooldownMs,
      });
    } catch (e) {
      console.error(`[${mode}] Scanner tick error:`, e);
    }
  }, [cooldownMs, mode, scannerApiUrl]);

  // ── Intervals ──
  useEffect(() => {
    if (!isRunning) return;
    // Keep cadence constant even in hidden tab to avoid stale open-position pricing.
    const effectiveInterval = priceIntervalMs;
    priceTick();
    const interval = setInterval(priceTick, effectiveInterval);
    return () => clearInterval(interval);
  }, [isRunning, isPageVisible, priceIntervalMs, priceTick]);

  useEffect(() => {
    if (!isRunning) return;
    const effectiveInterval = scannerIntervalMs;
    scannerTick();
    const interval = setInterval(scannerTick, effectiveInterval);
    return () => clearInterval(interval);
  }, [isRunning, isPageVisible, scannerIntervalMs, scannerTick]);

  // ── Actions (all go to server) ──
  const setIsRunning = useCallback(async (running: boolean) => {
    setIsRunningState(running);
    await sendAction(mode, running ? 'start' : 'stop');
  }, [mode]);

  const manualClose = useCallback(async (posId: string) => {
    await sendAction(mode, 'closePosition', { positionId: posId });
    syncState();
  }, [mode, syncState]);

  const closeAll = useCallback(async () => {
    await sendAction(mode, 'closeAll');
    syncState();
  }, [mode, syncState]);

  const resetWallet = useCallback(async () => {
    await sendAction(mode, 'reset');
    syncState();
  }, [mode, syncState]);

  const updateConfig = useCallback(async (updates: Partial<ServerConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    await sendAction(mode, 'updateConfig', { config: updates });
  }, [mode]);

  const updateRegimeConfig = useCallback(async (updates: Partial<RegimeConfig>) => {
    setRegimeConfig(prev => ({ ...prev, ...updates }));
    await sendAction(mode, 'updateRegimeConfig', { regimeConfig: updates });
  }, [mode]);

  const updateWalletSize = useCallback(async (size: number) => {
    setInitialWalletSize(size);
    await sendAction(mode, 'updateWalletSize', { walletSize: size });
  }, [mode]);

  const manualEntryFromSignal = useCallback(async (signal: V2Signal) => {
    if (signal.signal === 'NEUTRAL' || signal.skipTrade) return;
    const symbol = symbolKey(signal);
    const price = pricesRef.current[symbol] || signal.price || 0;
    if (price <= 0) return;
    await sendAction(mode, 'manualEntry', {
      symbol, direction: signal.signal, price,
      trade: signal.trade && signal.trade.riskR > 0 ? signal.trade : undefined,
    });
    syncState();
  }, [mode, syncState]);

  const manualEntryFromQueue = useCallback(async (queueItemId: string) => {
    const qi = queue.find(q => q.id === queueItemId);
    await sendAction(mode, 'manualEntryFromQueue', {
      queueItemId,
      price: qi ? (pricesRef.current[qi.symbol] || qi.price) : 0,
    });
    syncState();
  }, [mode, queue, syncState]);

  // Scanner param actions (client-only, for UI)
  const updateV2ScalpParams = useCallback((updates: Partial<V2ScalpParams>) => {
    setV2ScalpParams(prev => ({ ...prev, ...updates }));
  }, []);
  const toggleV2ScalpIndicator = useCallback((key: keyof V2ScalpEnabled) => {
    setV2ScalpEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const updateV2SwingParams = useCallback((updates: Partial<V2SwingParams>) => {
    setV2SwingParams(prev => ({ ...prev, ...updates }));
  }, []);
  const toggleV2SwingIndicator = useCallback((key: keyof V2SwingEnabled) => {
    setV2SwingEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const resetV2ScannerSettings = useCallback(() => {
    setV2ScalpParams(DEFAULT_V2_SCALP_PARAMS);
    setV2ScalpEnabled(DEFAULT_V2_SCALP_ENABLED);
    setV2SwingParams(DEFAULT_V2_SWING_PARAMS);
    setV2SwingEnabled(DEFAULT_V2_SWING_ENABLED);
  }, []);

  return {
    // State (from server)
    positions, closedPositions, queue, stats, config,
    regimeConfig, regimeState, regimeTelemetry, loopTelemetry,
    isRunning, lastUpdate, prices, latestSignals,
    openPnl, totalPnl, winRate, avgDuration,
    effectiveMaxPositions, initialWalletSize, priceFeedHealth,
    // Scanner settings (client-only)
    v2ScalpParams, v2ScalpEnabled, v2SwingParams, v2SwingEnabled,
    // Actions
    setIsRunning, manualClose, closeAll, resetWallet, updateConfig, updateRegimeConfig,
    manualEntryFromQueue, manualEntryFromSignal, updateWalletSize,
    updateV2ScalpParams, toggleV2ScalpIndicator,
    updateV2SwingParams, toggleV2SwingIndicator,
    resetV2ScannerSettings,
  };
}
