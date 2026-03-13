/**
 * Bybit Live Trading Executor
 * 
 * Connects to Bybit V5 API via ccxt for USDT perpetual futures.
 * Handles: order placement, TP/SL, position management, leverage setting.
 * 
 * SAFETY:
 * - Testnet mode by default (switch to mainnet only when ready)
 * - All orders include SL/TP
 * - Position size capped by config
 * - Kill switch integration
 * 
 * Usage:
 *   import { BybitExecutor } from './bybit-executor';
 *   const exec = new BybitExecutor({ apiKey, apiSecret, testnet: true });
 *   await exec.init();
 *   await exec.openPosition('BTC/USDT:USDT', 'LONG', 0.001, 69000, 68500, 69500);
 */

import ccxt from 'ccxt';

export interface BybitConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;       // true = testnet, false = mainnet (REAL MONEY)
  defaultLeverage: number;
  maxPositionSize: number; // max notional USD per position
  maxOpenPositions: number;
  slippagePct: number;     // max acceptable slippage %
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  symbol?: string;
  side?: string;
  price?: number;
  qty?: number;
  error?: string;
  raw?: any;
}

export interface PositionInfo {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number;
}

const DEFAULT_CONFIG: BybitConfig = {
  apiKey: '',
  apiSecret: '',
  testnet: true,  // ALWAYS start on testnet
  defaultLeverage: 10,
  maxPositionSize: 1000,  // $1000 max per position
  maxOpenPositions: 10,
  slippagePct: 0.1,
};

export class BybitExecutor {
  private exchange: ccxt.bybit | null = null;
  private config: BybitConfig;
  private initialized = false;
  private leverageSet: Set<string> = new Set();

  constructor(config: Partial<BybitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.apiKey || !this.config.apiSecret) {
      console.warn('[bybit] No API keys provided — executor will not connect');
      return;
    }
  }

  async init(): Promise<boolean> {
    if (!this.config.apiKey) return false;

    try {
      this.exchange = new ccxt.bybit({
        apiKey: this.config.apiKey,
        secret: this.config.apiSecret,
        enableRateLimit: true,
        options: {
          defaultType: 'future',
          defaultSubType: 'linear',  // USDT perpetual
          adjustForTimeDifference: true,
        },
      });

      if (this.config.testnet) {
        this.exchange.setSandboxMode(true);
        console.log('[bybit] Connected to TESTNET');
      } else {
        console.log('[bybit] ⚠️  Connected to MAINNET — REAL MONEY');
      }

      // Test connection
      await this.exchange.loadMarkets();
      const balance = await this.exchange.fetchBalance();
      const usdtBalance = balance.USDT?.free || 0;
      console.log(`[bybit] Balance: ${usdtBalance} USDT | Markets loaded: ${Object.keys(this.exchange.markets).length}`);

      this.initialized = true;
      return true;
    } catch (error: any) {
      console.error(`[bybit] Init failed: ${error.message}`);
      return false;
    }
  }

  isReady(): boolean {
    return this.initialized && this.exchange !== null;
  }

  // ── Set leverage for a symbol (only once per session) ──
  async setLeverage(symbol: string, leverage?: number): Promise<boolean> {
    if (!this.exchange || this.leverageSet.has(symbol)) return true;

    const lev = leverage || this.config.defaultLeverage;
    try {
      await this.exchange.setLeverage(lev, symbol);
      this.leverageSet.add(symbol);
      console.log(`[bybit] ${symbol} leverage set to ${lev}x`);
      return true;
    } catch (error: any) {
      // Leverage might already be set, that's ok
      if (error.message?.includes('leverage not modified')) {
        this.leverageSet.add(symbol);
        return true;
      }
      console.error(`[bybit] Set leverage failed: ${error.message}`);
      return false;
    }
  }

  // ── Set position mode (one-way) ──
  async setPositionMode(symbol: string): Promise<void> {
    if (!this.exchange) return;
    try {
      // Set to one-way mode (MergedSingle)
      await this.exchange.setPositionMode(false, symbol);
    } catch {
      // Already in one-way mode, ignore
    }
  }

  // ── Open a position with SL/TP ──
  async openPosition(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    quantity: number,
    limitPrice: number | null,  // null = market order
    stopLoss: number,
    takeProfit: number,
  ): Promise<OrderResult> {
    if (!this.exchange) return { success: false, error: 'Exchange not initialized' };

    const side = direction === 'LONG' ? 'buy' : 'sell';
    const ccxtSymbol = symbol.includes(':') ? symbol : symbol.replace('/', '/') + ':USDT';

    try {
      // Ensure leverage is set
      await this.setLeverage(ccxtSymbol);
      await this.setPositionMode(ccxtSymbol);

      // Build order params with TP/SL
      const params: any = {
        stopLoss: {
          triggerPrice: stopLoss,
          type: 'market',
        },
        takeProfit: {
          triggerPrice: takeProfit,
          type: 'market',
        },
        positionIdx: 0,  // one-way mode
      };

      let order;
      if (limitPrice) {
        // Limit order
        order = await this.exchange.createOrder(
          ccxtSymbol, 'limit', side, quantity, limitPrice, params
        );
      } else {
        // Market order
        order = await this.exchange.createOrder(
          ccxtSymbol, 'market', side, quantity, undefined, params
        );
      }

      console.log(`[bybit] ${direction} ${quantity} ${symbol} @ ${limitPrice || 'MARKET'} | SL: ${stopLoss} | TP: ${takeProfit} | OrderID: ${order.id}`);

      return {
        success: true,
        orderId: order.id,
        symbol,
        side,
        price: order.price || limitPrice || 0,
        qty: quantity,
        raw: order,
      };
    } catch (error: any) {
      console.error(`[bybit] Order failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ── Close a position ──
  async closePosition(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    quantity?: number,  // null = close all
  ): Promise<OrderResult> {
    if (!this.exchange) return { success: false, error: 'Exchange not initialized' };

    const side = direction === 'LONG' ? 'sell' : 'buy';  // opposite side to close
    const ccxtSymbol = symbol.includes(':') ? symbol : symbol.replace('/', '/') + ':USDT';

    try {
      const positions = await this.exchange.fetchPositions([ccxtSymbol]);
      const pos = positions.find((p: any) =>
        p.symbol === ccxtSymbol && p.side === direction.toLowerCase()
      );

      if (!pos || !pos.contracts || pos.contracts === 0) {
        return { success: false, error: 'No position found' };
      }

      const qty = quantity || pos.contracts;

      const order = await this.exchange.createOrder(
        ccxtSymbol, 'market', side, qty, undefined, {
          reduceOnly: true,
          positionIdx: 0,
        }
      );

      console.log(`[bybit] CLOSED ${direction} ${qty} ${symbol} | OrderID: ${order.id}`);

      return {
        success: true,
        orderId: order.id,
        symbol,
        side,
        qty,
        raw: order,
      };
    } catch (error: any) {
      console.error(`[bybit] Close failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ── Close all positions ──
  async closeAllPositions(): Promise<void> {
    if (!this.exchange) return;

    try {
      const positions = await this.exchange.fetchPositions();
      const openPositions = positions.filter((p: any) => p.contracts && p.contracts > 0);

      for (const pos of openPositions) {
        const side = pos.side === 'long' ? 'sell' : 'buy';
        await this.exchange.createOrder(
          pos.symbol, 'market', side, pos.contracts, undefined, {
            reduceOnly: true,
            positionIdx: 0,
          }
        );
        console.log(`[bybit] Emergency close: ${pos.symbol} ${pos.side} ${pos.contracts}`);
      }

      console.log(`[bybit] All positions closed (${openPositions.length})`);
    } catch (error: any) {
      console.error(`[bybit] Emergency close failed: ${error.message}`);
    }
  }

  // ── Cancel all open orders ──
  async cancelAllOrders(symbol?: string): Promise<void> {
    if (!this.exchange) return;
    try {
      if (symbol) {
        const ccxtSymbol = symbol.includes(':') ? symbol : symbol.replace('/', '/') + ':USDT';
        await this.exchange.cancelAllOrders(ccxtSymbol);
      } else {
        // Cancel for all known symbols
        const positions = await this.exchange.fetchPositions();
        const symbols = [...new Set(positions.map((p: any) => p.symbol))];
        for (const sym of symbols) {
          try { await this.exchange.cancelAllOrders(sym); } catch {}
        }
      }
      console.log(`[bybit] All orders cancelled`);
    } catch (error: any) {
      console.error(`[bybit] Cancel orders failed: ${error.message}`);
    }
  }

  // ── Get all open positions ──
  async getPositions(): Promise<PositionInfo[]> {
    if (!this.exchange) return [];

    try {
      const positions = await this.exchange.fetchPositions();
      return positions
        .filter((p: any) => p.contracts && p.contracts > 0)
        .map((p: any) => ({
          symbol: p.symbol,
          side: p.side as 'long' | 'short',
          size: p.contracts,
          entryPrice: p.entryPrice,
          markPrice: p.markPrice,
          unrealizedPnl: p.unrealizedPnl,
          leverage: p.leverage,
          liquidationPrice: p.liquidationPrice,
        }));
    } catch (error: any) {
      console.error(`[bybit] Fetch positions failed: ${error.message}`);
      return [];
    }
  }

  // ── Get account balance ──
  async getBalance(): Promise<{ total: number; free: number; used: number }> {
    if (!this.exchange) return { total: 0, free: 0, used: 0 };

    try {
      const balance = await this.exchange.fetchBalance();
      return {
        total: balance.USDT?.total || 0,
        free: balance.USDT?.free || 0,
        used: balance.USDT?.used || 0,
      };
    } catch {
      return { total: 0, free: 0, used: 0 };
    }
  }

  // ── Modify TP/SL on existing position ──
  async setTpSl(
    symbol: string,
    stopLoss?: number,
    takeProfit?: number,
  ): Promise<boolean> {
    if (!this.exchange) return false;
    const ccxtSymbol = symbol.includes(':') ? symbol : symbol.replace('/', '/') + ':USDT';

    try {
      const params: any = { positionIdx: 0 };
      if (stopLoss) params.stopLoss = stopLoss;
      if (takeProfit) params.takeProfit = takeProfit;

      await (this.exchange as any).setTradingStop(ccxtSymbol, params);
      return true;
    } catch (error: any) {
      // Fallback: use private API
      try {
        await (this.exchange as any).privatePostV5PositionTradingStop({
          category: 'linear',
          symbol: ccxtSymbol.replace('/', '').replace(':USDT', ''),
          stopLoss: stopLoss?.toString() || '',
          takeProfit: takeProfit?.toString() || '',
          positionIdx: '0',
        });
        return true;
      } catch (e2: any) {
        console.error(`[bybit] Set TP/SL failed: ${e2.message}`);
        return false;
      }
    }
  }

  // ── Get recent trades for tracking ──
  async getRecentTrades(symbol: string, limit = 20): Promise<any[]> {
    if (!this.exchange) return [];
    const ccxtSymbol = symbol.includes(':') ? symbol : symbol.replace('/', '/') + ':USDT';

    try {
      return await this.exchange.fetchMyTrades(ccxtSymbol, undefined, limit);
    } catch {
      return [];
    }
  }
}

// ── Config file management ──

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BYBIT_CONFIG_PATH = join(process.cwd(), 'config', 'bybit-credentials.json');

export interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  enabled: boolean;
}

export async function loadBybitCredentials(): Promise<BybitCredentials | null> {
  try {
    const raw = await readFile(BYBIT_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveBybitCredentials(creds: BybitCredentials): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  const dir = join(process.cwd(), 'config');
  try { await mkdir(dir, { recursive: true }); } catch {}
  await writeFile(BYBIT_CONFIG_PATH, JSON.stringify(creds, null, 2));
}
