'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Position, QueueItem, TradingStats, TradingConfig,
  ScalpParams, EnabledIndicators,
  SwingParams, SwingEnabledIndicators,
  INITIAL_WALLET, QUEUE_EXPIRY_MS,
  genId, calcPnl, calcPartialPnl, createPosition,
  checkExitConditions, updateTrailingStop,
  loadFromStorage, saveToStorage, migrateCloseReasons,
  DEFAULT_SCALPING_CONFIG, DEFAULT_SWING_CONFIG,
  DEFAULT_SCALP_PARAMS, DEFAULT_ENABLED_INDICATORS,
  DEFAULT_SWING_PARAMS, DEFAULT_SWING_ENABLED_INDICATORS,
  MAX_SCALPING_QUEUE, MAX_SWING_QUEUE,
} from './trading-engine';
import { normalizeSignals, type NormalizedSignal, safePairLabel, symbolKey } from './normalize-signal';

type ScannerSignal = NormalizedSignal;

// ── Re-entry protection: 60s after TP/manual, 5min after SL/timeout ──
const recentlyClosed: Record<string, { ts: number; reason: string }> = {};
const REENTRY_BLOCK_SHORT_MS = 60 * 1000;    // 60s after TP, manual, timeout
const REENTRY_BLOCK_SL_MS = 5 * 60 * 1000;   // 5 min only after stop loss

function markClosed(symbol: string, reason?: string) {
  recentlyClosed[symbol] = { ts: Date.now(), reason: reason || 'unknown' };
}
function isRecentlyClosed(symbol: string): boolean {
  const entry = recentlyClosed[symbol];
  if (!entry) return false;
  const elapsed = Date.now() - entry.ts;
  const blockMs = entry.reason === 'sl'
    ? REENTRY_BLOCK_SL_MS
    : REENTRY_BLOCK_SHORT_MS;
  if (elapsed > blockMs) {
    delete recentlyClosed[symbol];
    return false;
  }
  return true;
}

interface ScannerResponse {
  success: boolean;
  timestamp: string;
  signals: unknown[];
  prices?: Record<string, number>;
}

type LivePricesResponse = Record<string, number>;

const INITIAL_STATS: TradingStats = {
  walletBalance: INITIAL_WALLET,
  realizedPnl: 0,
  totalTrades: 0,
  winCount: 0,
  lossCount: 0,
  bestTrade: 0,
  worstTrade: 0,
  totalDurationMs: 0,
  closedCount: 0,
};

function shallowEqualPrices(a: Record<string, number>, b: Record<string, number>) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function sameSignalSnapshot(a: ScannerSignal[], b: ScannerSignal[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const sa = a[i];
    const sb = b[i];
    if (
      symbolKey(sa) !== symbolKey(sb) ||
      sa.signal !== sb.signal ||
      sa.confidence !== sb.confidence ||
      sa.price !== sb.price
    ) {
      return false;
    }
  }
  return true;
}

function samePositionSnapshot(a: Position[], b: Position[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const pa = a[i];
    const pb = b[i];
    if (
      pa.id !== pb.id ||
      pa.currentPrice !== pb.currentPrice ||
      pa.pnl !== pb.pnl ||
      pa.pnlPercent !== pb.pnlPercent ||
      pa.trailingStop !== pb.trailingStop ||
      pa.trailingActivated !== pb.trailingActivated ||
      pa.peakPrice !== pb.peakPrice
    ) {
      return false;
    }
  }
  return true;
}

function sameQueueSnapshot(a: QueueItem[], b: QueueItem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

export type TradingMode = 'scalping' | 'swing';

export function useTradingEngine(mode: TradingMode) {
  const isSwing = mode === 'swing';
  const prefix = mode;
  const scannerApiUrl = isSwing ? '/api/swing-scanner' : '/api/scalping-scanner';
  const livePricesApiUrl = '/api/live-prices';
  const scannerIntervalMs = isSwing ? 15000 : 5000;
  const priceIntervalMs = isSwing ? 2000 : 1000;
  const maxQueue = isSwing ? MAX_SWING_QUEUE : MAX_SCALPING_QUEUE;
  const defaultConfig = isSwing ? DEFAULT_SWING_CONFIG : DEFAULT_SCALPING_CONFIG;
  const hardMaxHoldMs = isSwing ? Number.POSITIVE_INFINITY : 3 * 60 * 1000;

  const [positions, setPositions] = useState<Position[]>(() =>
    loadFromStorage<Position[]>(`${prefix}-positions`, [])
  );
  const [closedPositions, setClosedPositions] = useState<Position[]>(() =>
    migrateCloseReasons(loadFromStorage<Position[]>(`${prefix}-closed`, []))
  );
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    loadFromStorage<QueueItem[]>(`${prefix}-queue`, [])
  );
  const [stats, setStats] = useState<TradingStats>(() =>
    loadFromStorage<TradingStats>(`${prefix}-stats`, INITIAL_STATS)
  );
  const [config, setConfig] = useState<TradingConfig>(() => {
    const stored = loadFromStorage<Partial<TradingConfig>>(`${prefix}-config`, {});
    return { ...defaultConfig, ...stored };
  });
  const [isRunning, setIsRunning] = useState<boolean>(() =>
    loadFromStorage<boolean>(`${prefix}-running`, false)
  );
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [isPageVisible, setIsPageVisible] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  });

  // Scanner settings (scalping-specific, but available for both modes)
  const [scalpParams, setScalpParams] = useState<ScalpParams>(() =>
    loadFromStorage<ScalpParams>(`${prefix}-scalp-params`, DEFAULT_SCALP_PARAMS)
  );
  const [enabledIndicators, setEnabledIndicators] = useState<EnabledIndicators>(() =>
    loadFromStorage<EnabledIndicators>(`${prefix}-enabled-indicators`, DEFAULT_ENABLED_INDICATORS)
  );

  // Swing scanner settings
  const [swingParams, setSwingParams] = useState<SwingParams>(() =>
    loadFromStorage<SwingParams>(`${prefix}-swing-params`, DEFAULT_SWING_PARAMS)
  );
  const [swingEnabledIndicators, setSwingEnabledIndicators] = useState<SwingEnabledIndicators>(() =>
    loadFromStorage<SwingEnabledIndicators>(`${prefix}-swing-enabled-indicators`, DEFAULT_SWING_ENABLED_INDICATORS)
  );

  // Latest scanner signals for the queue display
  const [latestSignals, setLatestSignals] = useState<ScannerSignal[]>([]);

  // Refs for interval access
  const scalpParamsRef = useRef(scalpParams);
  const enabledRef = useRef(enabledIndicators);

  const posRef = useRef(positions);
  const closedRef = useRef(closedPositions);
  const queueRef = useRef(queue);
  const statsRef = useRef(stats);
  const configRef = useRef(config);
  const isRunningRef = useRef(isRunning);
  const pricesRef = useRef(prices);
  const latestSignalsRef = useRef(latestSignals);

  const swingParamsRef = useRef(swingParams);
  const swingEnabledRef = useRef(swingEnabledIndicators);

  useEffect(() => { scalpParamsRef.current = scalpParams; }, [scalpParams]);
  useEffect(() => { enabledRef.current = enabledIndicators; }, [enabledIndicators]);
  useEffect(() => { swingParamsRef.current = swingParams; }, [swingParams]);
  useEffect(() => { swingEnabledRef.current = swingEnabledIndicators; }, [swingEnabledIndicators]);
  useEffect(() => { posRef.current = positions; }, [positions]);
  useEffect(() => { closedRef.current = closedPositions; }, [closedPositions]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { pricesRef.current = prices; }, [prices]);
  useEffect(() => { latestSignalsRef.current = latestSignals; }, [latestSignals]);

  // Persist to localStorage
  useEffect(() => { saveToStorage(`${prefix}-positions`, positions); }, [positions, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-closed`, closedPositions); }, [closedPositions, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-queue`, queue); }, [queue, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-stats`, stats); }, [stats, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-config`, config); }, [config, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-running`, isRunning); }, [isRunning, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-scalp-params`, scalpParams); }, [scalpParams, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-enabled-indicators`, enabledIndicators); }, [enabledIndicators, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-swing-params`, swingParams); }, [swingParams, prefix]);
  useEffect(() => { saveToStorage(`${prefix}-swing-enabled-indicators`, swingEnabledIndicators); }, [swingEnabledIndicators, prefix]);

  // Reduce polling pressure when tab is not visible
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Backfill missing config keys from older localStorage snapshots
  useEffect(() => {
    setConfig(prev => ({ ...defaultConfig, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Close a position
  const closePosition = useCallback((posId: string, reason: string, currentPrice: number) => {
    setPositions(prev => {
      const pos = prev.find(p => p.id === posId);
      if (!pos) return prev;

      const { pnl, pnlPercent } = calcPnl(pos, currentPrice);
      const partialPnl = calcPartialPnl(pos);
      const totalPnl = pnl + partialPnl;
      const duration = Date.now() - new Date(pos.openedAt).getTime();

      const closedPos: Position = {
        ...pos,
        currentPrice,
        status: 'closed',
        closeReason: reason as Position['closeReason'],
        closedAt: new Date().toISOString(),
        pnl: totalPnl,
        pnlPercent,
      };

      markClosed(pos.symbol, reason); // 60s after TP/manual, 5min after SL/timeout
      setClosedPositions(cp => [closedPos, ...cp].slice(0, 500));

      setStats(s => {
        const isWin = totalPnl > 0;
        return {
          walletBalance: s.walletBalance + totalPnl,
          realizedPnl: s.realizedPnl + totalPnl,
          totalTrades: s.totalTrades,
          winCount: s.winCount + (isWin ? 1 : 0),
          lossCount: s.lossCount + (isWin ? 0 : 1),
          bestTrade: Math.max(s.bestTrade, totalPnl),
          worstTrade: Math.min(s.worstTrade, totalPnl),
          totalDurationMs: s.totalDurationMs + duration,
          closedCount: s.closedCount + 1,
        };
      });

      return prev.filter(p => p.id !== posId);
    });
  }, []);

  // Partial close (swing)
  const partialClose = useCallback((posId: string, percent: number, reason: string, currentPrice: number) => {
    setPositions(prev => prev.map(pos => {
      if (pos.id !== posId) return pos;

      const closeQty = pos.remainingQuantity * (percent / 100);
      const isLong = pos.direction === 'LONG';
      const priceChange = isLong ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
      const partialPnl = closeQty * priceChange;

      const updatedPos: Position = {
        ...pos,
        remainingQuantity: pos.remainingQuantity - closeQty,
        partialCloses: [
          ...pos.partialCloses,
          { price: currentPrice, quantity: closeQty, pnl: partialPnl, reason, at: new Date().toISOString() },
        ],
      };

      // TP1: move SL to breakeven
      if (reason === 'tp1') {
        updatedPos.stopLoss = pos.entryPrice;
      }

      // TP2: activate trailing
      if (reason === 'tp2') {
        updatedPos.trailingActivated = true;
        updatedPos.peakPrice = currentPrice;
        const trailingPercent = configRef.current.trailingStopPercent / 100;
        updatedPos.trailingStop = isLong
          ? currentPrice * (1 - trailingPercent)
          : currentPrice * (1 + trailingPercent);
      }

      // Update realized P&L in stats
      setStats(s => ({
        ...s,
        walletBalance: s.walletBalance + partialPnl,
        realizedPnl: s.realizedPnl + partialPnl,
      }));

      return updatedPos;
    }));
  }, []);

  // Manual close
  const manualClose = useCallback((posId: string) => {
    const pos = posRef.current.find(p => p.id === posId);
    if (!pos) return;
    closePosition(posId, 'manual', pos.currentPrice);
  }, [closePosition]);

  // Close all positions
  const closeAll = useCallback(() => {
    const currentPositions = [...posRef.current];
    currentPositions.forEach(pos => {
      closePosition(pos.id, 'manual', pos.currentPrice);
    });
  }, [closePosition]);

  // Reset wallet
  const resetWallet = useCallback(() => {
    setPositions([]);
    setClosedPositions([]);
    setQueue([]);
    setStats(INITIAL_STATS);
    setIsRunning(false);
    setPrices({});
    setConfig(defaultConfig);
    setLatestSignals([]);
  }, [defaultConfig]);

  // Update config
  const updateConfig = useCallback((updates: Partial<TradingConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Manual entry from queue item
  const manualEntryFromQueue = useCallback((queueItemId: string) => {
    const qi = queueRef.current.find(q => q.id === queueItemId);
    if (!qi) return;
    const cfg = configRef.current;
    const price = pricesRef.current[qi.symbol] || qi.price;
    const newPos = createPosition(qi.symbol, qi.direction, price, cfg, isSwing);
    setPositions(prev => {
      if (prev.length >= cfg.maxPositions) return prev;
      return [...prev, newPos];
    });
    setStats(s => ({ ...s, totalTrades: s.totalTrades + 1 }));
    setQueue(prev => prev.filter(q => q.id !== queueItemId));
  }, [isSwing]);

  // Manual entry from a scanner signal
  const manualEntryFromSignal = useCallback((signal: ScannerSignal) => {
    if (signal.signal === 'NEUTRAL') return;
    const cfg = configRef.current;
    const symbol = symbolKey(signal);
    const price = pricesRef.current[symbol] || pricesRef.current[symbolKey(signal)] || signal.price || signal.indicators?.price || 0;
    if (!symbol) return;
    const livePrice = price > 0 ? price : (pricesRef.current[symbol] || 0);
    if (livePrice <= 0) { console.warn('[manual] No price for', symbol); return; }
    const newPos = createPosition(symbol, signal.signal, livePrice, cfg, isSwing);
    setPositions(prev => {
      if (prev.length >= cfg.maxPositions) return prev;
      return [...prev, newPos];
    });
    setStats(s => ({ ...s, totalTrades: s.totalTrades + 1 }));
  }, [isSwing]);

  // Update scanner settings
  const updateScalpParams = useCallback((updates: Partial<ScalpParams>) => {
    setScalpParams(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleIndicator = useCallback((key: keyof EnabledIndicators) => {
    setEnabledIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const resetScannerSettings = useCallback(() => {
    setScalpParams(DEFAULT_SCALP_PARAMS);
    setEnabledIndicators(DEFAULT_ENABLED_INDICATORS);
    setSwingParams(DEFAULT_SWING_PARAMS);
    setSwingEnabledIndicators(DEFAULT_SWING_ENABLED_INDICATORS);
  }, []);

  // Swing scanner settings
  const updateSwingParams = useCallback((updates: Partial<SwingParams>) => {
    setSwingParams(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleSwingIndicator = useCallback((key: keyof SwingEnabledIndicators) => {
    setSwingEnabledIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Mounted guard to prevent setState on unmounted component (P0-4)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const applyPositionPriceUpdates = useCallback((incomingPrices: Record<string, number>) => {
    if (!isRunningRef.current || !mountedRef.current) return;

    const cfg = configRef.current;
    let currentPositions = [...posRef.current];

    const positionsToClose: { id: string; reason: string; price: number }[] = [];
    const positionsToPartial: { id: string; percent: number; reason: string; price: number }[] = [];
    const positionsToActivateTrailing: string[] = [];

    currentPositions = currentPositions.map(pos => {
      const previousPrice = pos.currentPrice;
      const price = incomingPrices[pos.symbol] || pos.currentPrice;
      let updatedPos: Position = { ...pos, currentPrice: price };

      if (updatedPos.trailingActivated) {
        updatedPos = updateTrailingStop(updatedPos, price, cfg);
      }

      const { pnl, pnlPercent } = calcPnl(updatedPos, price);
      updatedPos.pnl = pnl + calcPartialPnl(updatedPos);
      updatedPos.pnlPercent = pnlPercent;

      const exit = checkExitConditions(updatedPos, price, cfg, isSwing);

      switch (exit.action) {
        case 'close':
          positionsToClose.push({ id: pos.id, reason: exit.reason!, price });
          break;
        case 'partial_tp1':
          positionsToPartial.push({ id: pos.id, percent: cfg.partialClosePercent1 || 50, reason: 'tp1', price });
          break;
        case 'partial_tp2':
          positionsToPartial.push({ id: pos.id, percent: cfg.partialClosePercent2 || 25, reason: 'tp2', price });
          break;
        case 'activate_trailing':
          positionsToActivateTrailing.push(pos.id);
          break;
      }

      return { ...updatedPos, previousPrice } as Position;
    });

    if (!mountedRef.current) return;
    if (!samePositionSnapshot(posRef.current, currentPositions)) {
      setPositions(currentPositions);
    }

    positionsToClose.forEach(({ id, reason, price }) => {
      closePosition(id, reason, price);
    });

    positionsToPartial.forEach(({ id, percent, reason, price }) => {
      partialClose(id, percent, reason, price);
    });

    if (positionsToActivateTrailing.length > 0) {
      setPositions(prev => prev.map(pos => {
        if (!positionsToActivateTrailing.includes(pos.id)) return pos;
        const price = incomingPrices[pos.symbol] || pos.currentPrice;
        const trailingPercent = cfg.trailingStopPercent / 100;
        const isLong = pos.direction === 'LONG';
        return {
          ...pos,
          trailingActivated: true,
          peakPrice: price,
          trailingStop: isLong
            ? price * (1 - trailingPercent)
            : price * (1 + trailingPercent),
        };
      }));
    }

    setLastUpdate(new Date().toISOString());
  }, [closePosition, isSwing, partialClose]);

  const enforceHardMaxHold = useCallback(() => {
    if (!isRunningRef.current || !mountedRef.current || isSwing) return;

    const now = Date.now();
    const overdue = posRef.current.filter(pos => {
      const openedAtMs = new Date(pos.openedAt).getTime();
      return Number.isFinite(openedAtMs) && now - openedAtMs >= hardMaxHoldMs;
    });

    overdue.forEach(pos => {
      const fallbackPrice = pricesRef.current[pos.symbol] || pos.currentPrice || pos.entryPrice;
      console.warn(`[${mode}] Hard max-hold close: ${pos.symbol} (${Math.round((now - new Date(pos.openedAt).getTime()) / 1000)}s)`);
      closePosition(pos.id, 'max_hold', fallbackPrice);
    });
  }, [closePosition, hardMaxHoldMs, isSwing, mode]);

  // Fast loop: prices + exit checks only
  const priceTick = useCallback(async () => {
    if (!isRunningRef.current || !mountedRef.current) return;

    try {
      const res = await fetch(livePricesApiUrl, { cache: 'no-store' });
      if (!mountedRef.current) return;
      const data: LivePricesResponse = await res.json();

      if (!data || typeof data !== 'object') return;

      const newPrices: Record<string, number> = {};
      Object.entries(data).forEach(([symbol, price]) => {
        if (symbol && Number.isFinite(price) && price > 0) {
          newPrices[symbol] = price;
        }
      });

      const mergedPrices = { ...pricesRef.current, ...newPrices };
      if (!shallowEqualPrices(pricesRef.current, mergedPrices)) {
        setPrices(mergedPrices);
      }

      applyPositionPriceUpdates(mergedPrices);
      enforceHardMaxHold();
    } catch (error) {
      console.error(`[${mode}] Price tick error:`, error);
      // Keep timeout guard alive even when live price fetch fails
      enforceHardMaxHold();
    }
  }, [applyPositionPriceUpdates, enforceHardMaxHold, livePricesApiUrl, mode]);

  // Slow loop: scanner + queue + auto-entry
  const scannerTick = useCallback(async () => {
    if (!isRunningRef.current || !mountedRef.current) return;

    const cfg = configRef.current;
    let currentQueue = [...queueRef.current];

    try {
      const res = await fetch(scannerApiUrl, { cache: 'no-store' });
      if (!mountedRef.current) return;
      const data: ScannerResponse = await res.json();

      if (!data.success || !data.signals) return;

      const normalizedSignals: ScannerSignal[] = normalizeSignals(data.signals);

      if (!mountedRef.current) return;
      if (!sameSignalSnapshot(latestSignalsRef.current, normalizedSignals)) {
        setLatestSignals(normalizedSignals);
      }

      const scannerPrices: Record<string, number> = {};

      if (data.prices) {
        Object.entries(data.prices).forEach(([symbol, price]) => {
          if (symbol && Number.isFinite(price) && price > 0) {
            scannerPrices[symbol] = price;
          }
        });
      }

      normalizedSignals.forEach(sig => {
        const symbol = symbolKey(sig);
        if (symbol !== 'â€”' && sig.price > 0) {
          scannerPrices[symbol] = sig.price;
        }
      });

      const mergedPrices = { ...pricesRef.current, ...scannerPrices };
      if (!shallowEqualPrices(pricesRef.current, mergedPrices)) {
        setPrices(mergedPrices);
      }

      // Process queue (fill empty slots)
      const openCount = posRef.current.length;
      const availableSlots = cfg.maxPositions - openCount;

      if (availableSlots > 0 && currentQueue.length > 0) {
        const toFill = currentQueue.slice(0, availableSlots);
        const remaining = currentQueue.slice(availableSlots);

        toFill.forEach(qi => {
          const price = mergedPrices[qi.symbol] || qi.price;
          const newPos = createPosition(qi.symbol, qi.direction, price, cfg, isSwing);

          setPositions(prev => {
            if (prev.length >= cfg.maxPositions) return prev;
            return [...prev, newPos];
          });

          setStats(s => ({ ...s, totalTrades: s.totalTrades + 1 }));
        });

        setQueue(remaining);
        currentQueue = remaining;
      }

      // Check new signals for auto-entry
      if (cfg.autoEntry) {
        const activeSymbols = new Set([
          ...posRef.current.map(p => p.symbol),
          ...currentQueue.map(q => q.symbol),
        ]);

        const validSignals = normalizedSignals.filter(sig => {
          const symbol = symbolKey(sig);
          return (
            sig.signal !== 'NEUTRAL' &&
            symbol !== 'â€”' &&
            sig.confidence >= cfg.minConfidence &&
            !activeSymbols.has(symbol) &&
            !isRecentlyClosed(symbol)
          );
        });

        const pendingSymbols = new Set<string>();
        validSignals.forEach(sig => {
          const symbol = symbolKey(sig);
          if (symbol === '\u2014') return;
          if (pendingSymbols.has(symbol)) return;
          const openCount2 = posRef.current.length + pendingSymbols.size;

          if (openCount2 < cfg.maxPositions) {
            const livePrice = pricesRef.current[symbol] || sig.price || sig.indicators?.price || 0;
            if (livePrice <= 0) return;
            const newPos = createPosition(symbol, sig.signal as 'LONG' | 'SHORT', livePrice, cfg, isSwing);
            pendingSymbols.add(symbol);
            setPositions(prev => {
              if (prev.some(p => p.symbol === symbol) || prev.length >= cfg.maxPositions) return prev;
              return [...prev, newPos];
            });
            setStats(s => ({ ...s, totalTrades: s.totalTrades + 1 }));
          } else if (cfg.queueEnabled && currentQueue.length < maxQueue) {
            pendingSymbols.add(symbol);
            const livePrice = pricesRef.current[symbol] || sig.price;
            const qi = {
              id: genId(),
              symbol,
              direction: sig.signal as 'LONG' | 'SHORT',
              confidence: sig.confidence,
              reason: sig.reason,
              price: livePrice,
              queuedAt: new Date().toISOString(),
            };
            setQueue(prev => {
              if (prev.length >= maxQueue) return prev;
              return [...prev, qi];
            });
          }
        });
      }
      // Clean expired queue items
      const filteredQueue = queueRef.current.filter(qi => {
        const age = Date.now() - new Date(qi.queuedAt).getTime();
        return age < QUEUE_EXPIRY_MS;
      });
      if (!sameQueueSnapshot(queueRef.current, filteredQueue)) {
        setQueue(filteredQueue);
      }

      setLastUpdate(new Date().toISOString());
    } catch (error) {
      console.error(`[${mode}] Scanner tick error:`, error);
    }
  }, [isSwing, maxQueue, mode, scannerApiUrl]);

  // Fast loop (price + exits)
  useEffect(() => {
    if (!isRunning) return;

    const effectivePriceInterval = isPageVisible
      ? priceIntervalMs
      : Math.max(priceIntervalMs * 5, 5000);

    priceTick();
    const interval = setInterval(priceTick, effectivePriceInterval);
    return () => clearInterval(interval);
  }, [isRunning, isPageVisible, priceIntervalMs, priceTick]);

  // Slow loop (scanner)
  useEffect(() => {
    if (!isRunning) return;

    const effectiveScannerInterval = isPageVisible
      ? scannerIntervalMs
      : Math.max(scannerIntervalMs * 4, 60000);

    scannerTick();
    const interval = setInterval(scannerTick, effectiveScannerInterval);
    return () => clearInterval(interval);
  }, [isRunning, isPageVisible, scannerIntervalMs, scannerTick]);

  // Dedicated fail-safe loop: enforce hard max hold independent of price/scanner freshness
  useEffect(() => {
    if (!isRunning || isSwing) return;

    enforceHardMaxHold();
    const interval = setInterval(enforceHardMaxHold, 1000);
    return () => clearInterval(interval);
  }, [enforceHardMaxHold, isRunning, isSwing]);

  // Compute derived stats
  const openPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalPnl = stats.realizedPnl + openPnl;
  const winRate = stats.closedCount > 0 ? (stats.winCount / stats.closedCount) * 100 : 0;
  const avgDuration = stats.closedCount > 0 ? stats.totalDurationMs / stats.closedCount : 0;

  return {
    // State
    positions,
    closedPositions,
    queue,
    stats,
    config,
    isRunning,
    lastUpdate,
    prices,
    latestSignals,

    // Scanner settings
    scalpParams,
    enabledIndicators,
    swingParams,
    swingEnabledIndicators,

    // Derived
    openPnl,
    totalPnl,
    winRate,
    avgDuration,

    // Actions
    setIsRunning,
    manualClose,
    closeAll,
    resetWallet,
    updateConfig,
    manualEntryFromQueue,
    manualEntryFromSignal,
    updateScalpParams,
    toggleIndicator,
    resetScannerSettings,
    updateSwingParams,
    toggleSwingIndicator,
  };
}


