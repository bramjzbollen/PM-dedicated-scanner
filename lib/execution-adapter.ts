/**
 * Execution Adapter — Paper ↔ Live switching layer
 * 
 * This sits between the trading engine and the exchange.
 * In paper mode: simulates fills with realistic slippage/fees/fill-rate
 * In live mode: sends real orders to Bybit/Hyperliquid via ccxt
 * 
 * Switch with: EXECUTION_MODE=paper|live in .env or runtime config
 * 
 * ARCHITECTURE:
 *   Scanner → Signal → server-trade-state.ts → ExecutionAdapter → Exchange (or Paper Ledger)
 *                                                    ↓
 *                                              Fill confirmation
 *                                                    ↓
 *                                           Position created in state
 */

// ── Types ──

export type ExecutionMode = 'paper' | 'live';
export type Exchange = 'bybit' | 'hyperliquid';

export interface OrderRequest {
  symbol: string;          // e.g. "BTC/USDT"
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  quantity: number;        // in base currency
  price?: number;          // for limit orders
  leverage?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;      // maker-only (for fee savings)
}

export interface OrderResult {
  success: boolean;
  orderId: string;
  filledPrice: number;
  filledQuantity: number;
  fee: number;             // in quote currency
  feeRate: number;         // e.g. 0.0002 = 0.02%
  slippage: number;        // actual vs requested price difference %
  timestamp: number;
  latencyMs: number;
  error?: string;
}

export interface StopOrder {
  symbol: string;
  side: 'buy' | 'sell';
  stopPrice: number;
  quantity: number;
  type: 'stop_market' | 'take_profit_market' | 'stop_limit';
  limitPrice?: number;     // for stop_limit
  reduceOnly: boolean;
}

export interface StopOrderResult {
  success: boolean;
  orderId: string;
  error?: string;
}

export interface BalanceInfo {
  total: number;           // total equity
  available: number;       // available for new positions
  unrealizedPnl: number;
  currency: string;
}

export interface ExecutionConfig {
  mode: ExecutionMode;
  exchange: Exchange;
  
  // API credentials (live mode only)
  apiKey?: string;
  apiSecret?: string;
  
  // Paper mode simulation settings
  paper: {
    initialBalance: number;
    simulateSlippage: boolean;
    slippageBps: number;         // basis points, e.g. 3 = 0.03%
    simulateFillRate: boolean;
    fillRatePercent: number;     // e.g. 85 = 85% of limit orders fill
    simulateFees: boolean;
    makerFeePct: number;         // e.g. 0.02 = 0.02%
    takerFeePct: number;         // e.g. 0.055 = 0.055%
    simulateLatency: boolean;
    latencyMs: number;           // simulated latency in ms
  };
  
  // Live mode settings
  live: {
    maxOrdersPerMinute: number;  // rate limit protection
    confirmBeforeEntry: boolean; // require manual confirm for live trades
    dryRunFirst: boolean;        // log what WOULD happen without executing
    bybitTestnet: boolean;       // true=testnet execution, false=mainnet execution
  };
}

// ── Default Config ──

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  mode: 'paper',
  exchange: 'bybit',
  
  paper: {
    initialBalance: 1000,
    simulateSlippage: true,
    slippageBps: 3,              // 0.03% average slippage
    simulateFillRate: true,
    fillRatePercent: 85,         // 85% of limit orders fill
    simulateFees: true,
    makerFeePct: 0.02,           // Bybit maker
    takerFeePct: 0.055,          // Bybit taker
    simulateLatency: false,
    latencyMs: 50,
  },
  
  live: {
    maxOrdersPerMinute: 200,     // stay under Bybit's 300/min limit
    confirmBeforeEntry: false,
    dryRunFirst: true,           // first run in dry-run to verify
    bybitTestnet: true,
  },
};

// ── Paper Execution Engine ──

class PaperExecutor {
  private balance: number;
  private orderCounter: number = 0;
  private config: ExecutionConfig['paper'];
  
  constructor(config: ExecutionConfig['paper']) {
    this.balance = config.initialBalance;
    this.config = config;
  }
  
  async placeOrder(order: OrderRequest, currentMarketPrice: number): Promise<OrderResult> {
    const start = Date.now();
    
    // Simulate latency
    if (this.config.simulateLatency) {
      await new Promise(r => setTimeout(r, this.config.latencyMs));
    }
    
    // Simulate fill rate for limit orders
    if (order.type === 'limit' && this.config.simulateFillRate) {
      const roll = Math.random() * 100;
      if (roll > this.config.fillRatePercent) {
        return {
          success: false,
          orderId: `paper-${++this.orderCounter}`,
          filledPrice: 0,
          filledQuantity: 0,
          fee: 0,
          feeRate: 0,
          slippage: 0,
          timestamp: Date.now(),
          latencyMs: Date.now() - start,
          error: 'Limit order not filled (simulated)',
        };
      }
    }
    
    // Calculate fill price with slippage
    let fillPrice = order.price || currentMarketPrice;
    let slippage = 0;
    
    if (this.config.simulateSlippage) {
      // Slippage direction depends on order side
      const slippagePct = (this.config.slippageBps / 10000);
      const slippageAmount = fillPrice * slippagePct * (Math.random() * 2); // 0 to 2x configured slippage
      
      if (order.side === 'buy') {
        fillPrice += slippageAmount; // buy higher
      } else {
        fillPrice -= slippageAmount; // sell lower
      }
      
      slippage = Math.abs(fillPrice - (order.price || currentMarketPrice)) / (order.price || currentMarketPrice) * 100;
    }
    
    // Calculate fee
    let feeRate = 0;
    if (this.config.simulateFees) {
      feeRate = (order.type === 'limit' && order.postOnly)
        ? this.config.makerFeePct / 100
        : this.config.takerFeePct / 100;
    }
    
    const notional = fillPrice * order.quantity;
    const fee = notional * feeRate;
    
    // Update balance
    if (order.side === 'buy') {
      this.balance -= fee; // fees reduce balance
    } else {
      this.balance -= fee;
    }
    
    return {
      success: true,
      orderId: `paper-${++this.orderCounter}`,
      filledPrice: +fillPrice.toFixed(8),
      filledQuantity: order.quantity,
      fee: +fee.toFixed(6),
      feeRate,
      slippage: +slippage.toFixed(4),
      timestamp: Date.now(),
      latencyMs: Date.now() - start,
    };
  }
  
  async placeStopOrder(stop: StopOrder): Promise<StopOrderResult> {
    // Paper mode: stop orders are tracked by the trading engine itself
    // (server-trade-state.ts already handles SL/TP checking)
    return {
      success: true,
      orderId: `paper-stop-${++this.orderCounter}`,
    };
  }
  
  async getBalance(): Promise<BalanceInfo> {
    return {
      total: this.balance,
      available: this.balance,
      unrealizedPnl: 0,
      currency: 'USDT',
    };
  }
  
  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
  
  setBalance(balance: number) {
    this.balance = balance;
  }
  
  getConfig() {
    return this.config;
  }
}

// ── Live Execution Engine (Bybit via ccxt) ──

class LiveExecutor {
  private exchange: any = null;  // ccxt exchange instance
  private exchangeName: Exchange;
  private orderCount: number = 0;
  private orderCountResetAt: number = 0;
  private maxOrdersPerMinute: number;
  private dryRun: boolean;
  private bybitTestnet: boolean;
  
  constructor(exchangeName: Exchange, apiKey: string, apiSecret: string, config: ExecutionConfig['live']) {
    this.exchangeName = exchangeName;
    this.maxOrdersPerMinute = config.maxOrdersPerMinute;
    this.dryRun = config.dryRunFirst;
    this.bybitTestnet = config.bybitTestnet !== false;
    
    // Lazy init - ccxt is imported dynamically only in live mode
    this.initExchange(apiKey, apiSecret);
  }
  
  private async initExchange(apiKey: string, apiSecret: string) {
    try {
      const ccxt = await import('ccxt');
      
      if (this.exchangeName === 'bybit') {
        this.exchange = new ccxt.default.bybit({
          apiKey,
          secret: apiSecret,
          options: { defaultType: 'swap' }, // perpetual futures
          enableRateLimit: true,
        });
        if (this.bybitTestnet && typeof this.exchange?.setSandboxMode === 'function') {
          this.exchange.setSandboxMode(true);
        }
      } else if (this.exchangeName === 'hyperliquid') {
        // Hyperliquid uses a different auth model
        // For now, placeholder — will implement with their SDK
        console.warn('[LiveExecutor] Hyperliquid support not yet implemented, falling back to Bybit');
      }
      
      if (this.exchange) {
        await this.exchange.loadMarkets();
        console.log(`[LiveExecutor] Connected to ${this.exchangeName} — ${Object.keys(this.exchange.markets).length} markets loaded`);
      }
    } catch (e) {
      console.error(`[LiveExecutor] Failed to init ${this.exchangeName}:`, e);
    }
  }
  
  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.orderCountResetAt > 60000) {
      this.orderCount = 0;
      this.orderCountResetAt = now;
    }
    if (this.orderCount >= this.maxOrdersPerMinute) {
      console.warn(`[LiveExecutor] Rate limit: ${this.orderCount}/${this.maxOrdersPerMinute} orders/min`);
      return false;
    }
    this.orderCount++;
    return true;
  }
  
  async placeOrder(order: OrderRequest, _currentMarketPrice: number): Promise<OrderResult> {
    const start = Date.now();
    
    if (!this.exchange) {
      return { success: false, orderId: '', filledPrice: 0, filledQuantity: 0, fee: 0, feeRate: 0, slippage: 0, timestamp: Date.now(), latencyMs: 0, error: 'Exchange not initialized' };
    }
    
    if (!this.checkRateLimit()) {
      return { success: false, orderId: '', filledPrice: 0, filledQuantity: 0, fee: 0, feeRate: 0, slippage: 0, timestamp: Date.now(), latencyMs: 0, error: 'Rate limit exceeded' };
    }
    
    // Dry run mode: log but don't execute
    if (this.dryRun) {
      console.log(`[DRY RUN] ${order.side} ${order.quantity} ${order.symbol} @ ${order.price || 'market'} (${order.type})`);
      return {
        success: true,
        orderId: `dry-${Date.now()}`,
        filledPrice: order.price || _currentMarketPrice,
        filledQuantity: order.quantity,
        fee: 0,
        feeRate: 0,
        slippage: 0,
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
      };
    }
    
    try {
      // Set leverage if specified
      if (order.leverage) {
        await this.exchange.setLeverage(order.leverage, order.symbol);
      }
      
      const params: Record<string, any> = {};
      if (order.reduceOnly) params.reduceOnly = true;
      if (order.postOnly) params.postOnly = true;
      
      const result = await this.exchange.createOrder(
        order.symbol,
        order.type,
        order.side,
        order.quantity,
        order.price,
        params,
      );
      
      const filledPrice = result.average || result.price || order.price || _currentMarketPrice;
      const fee = result.fee?.cost || 0;
      const feeRate = result.fee?.rate || 0;
      
      return {
        success: true,
        orderId: result.id,
        filledPrice,
        filledQuantity: result.filled || order.quantity,
        fee,
        feeRate,
        slippage: order.price ? Math.abs(filledPrice - order.price) / order.price * 100 : 0,
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
      };
    } catch (e: any) {
      console.error(`[LiveExecutor] Order failed:`, e.message);
      return {
        success: false,
        orderId: '',
        filledPrice: 0,
        filledQuantity: 0,
        fee: 0,
        feeRate: 0,
        slippage: 0,
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        error: e.message,
      };
    }
  }
  
  async placeStopOrder(stop: StopOrder): Promise<StopOrderResult> {
    if (!this.exchange) {
      return { success: false, orderId: '', error: 'Exchange not initialized' };
    }
    
    if (this.dryRun) {
      console.log(`[DRY RUN] Stop: ${stop.side} ${stop.quantity} ${stop.symbol} @ ${stop.stopPrice}`);
      return { success: true, orderId: `dry-stop-${Date.now()}` };
    }
    
    try {
      const params: Record<string, any> = {
        stopPrice: stop.stopPrice,
        reduceOnly: stop.reduceOnly,
      };
      
      const orderType = stop.type === 'stop_limit' ? 'limit' : 'market';
      
      const result = await this.exchange.createOrder(
        stop.symbol,
        orderType,
        stop.side,
        stop.quantity,
        stop.limitPrice,
        { ...params, trigger: 'Last' },
      );
      
      return { success: true, orderId: result.id };
    } catch (e: any) {
      return { success: false, orderId: '', error: e.message };
    }
  }
  
  async getBalance(): Promise<BalanceInfo> {
    if (!this.exchange) {
      return { total: 0, available: 0, unrealizedPnl: 0, currency: 'USDT' };
    }
    
    try {
      const balance = await this.exchange.fetchBalance({ type: 'swap' });
      return {
        total: balance.total?.USDT || 0,
        available: balance.free?.USDT || 0,
        unrealizedPnl: (balance.total?.USDT || 0) - (balance.free?.USDT || 0),
        currency: 'USDT',
      };
    } catch {
      return { total: 0, available: 0, unrealizedPnl: 0, currency: 'USDT' };
    }
  }
  
  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    if (!this.exchange || this.dryRun) return true;
    try {
      await this.exchange.cancelOrder(orderId, symbol);
      return true;
    } catch {
      return false;
    }
  }
  
  setDryRun(enabled: boolean) {
    this.dryRun = enabled;
    console.log(`[LiveExecutor] Dry run: ${enabled ? 'ON' : 'OFF'}`);
  }
}

// ── Unified Adapter ──

export class ExecutionAdapter {
  private paper: PaperExecutor | null = null;
  private live: LiveExecutor | null = null;
  private config: ExecutionConfig;
  
  constructor(config: ExecutionConfig = DEFAULT_EXECUTION_CONFIG) {
    this.config = config;
    
    if (config.mode === 'paper') {
      this.paper = new PaperExecutor(config.paper);
    } else if (config.mode === 'live') {
      if (!config.apiKey || !config.apiSecret) {
        console.warn('[ExecutionAdapter] Live mode requested but API credentials missing. Falling back to PAPER mode.');
        this.paper = new PaperExecutor(config.paper);
        this.config = { ...config, mode: 'paper' };
      } else {
        this.live = new LiveExecutor(config.exchange, config.apiKey, config.apiSecret, config.live);
      }
    }
  }
  
  get mode(): ExecutionMode { return this.config.mode; }
  get isLive(): boolean { return this.config.mode === 'live'; }
  get isPaper(): boolean { return this.config.mode === 'paper'; }
  
  async placeOrder(order: OrderRequest, currentPrice: number): Promise<OrderResult> {
    if (this.paper) return this.paper.placeOrder(order, currentPrice);
    if (this.live) return this.live.placeOrder(order, currentPrice);
    throw new Error('No executor initialized');
  }
  
  async placeStopOrder(stop: StopOrder): Promise<StopOrderResult> {
    if (this.paper) return this.paper.placeStopOrder(stop);
    if (this.live) return this.live.placeStopOrder(stop);
    throw new Error('No executor initialized');
  }
  
  async getBalance(): Promise<BalanceInfo> {
    if (this.paper) return this.paper.getBalance();
    if (this.live) return this.live.getBalance();
    throw new Error('No executor initialized');
  }
  
  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    if (this.paper) return this.paper.cancelOrder(orderId);
    if (this.live) return this.live.cancelOrder(orderId, symbol);
    return false;
  }
  
  // Paper-only: sync balance with trading engine state
  syncPaperBalance(balance: number) {
    if (this.paper) this.paper.setBalance(balance);
  }
  
  // Live-only: toggle dry run
  setDryRun(enabled: boolean) {
    if (this.live) this.live.setDryRun(enabled);
  }
  
  // Get fee rates for PnL calculation
  getFeeRates(): { maker: number; taker: number } {
    if (this.isPaper) {
      return {
        maker: this.config.paper.makerFeePct / 100,
        taker: this.config.paper.takerFeePct / 100,
      };
    }
    // Live: exchange-specific defaults
    if (this.config.exchange === 'bybit') return { maker: 0.0002, taker: 0.00055 };
    if (this.config.exchange === 'hyperliquid') return { maker: 0.00015, taker: 0.00045 };
    return { maker: 0.0002, taker: 0.0005 };
  }
  
  getConfig(): ExecutionConfig { return this.config; }

  getSourceStatus() {
    return {
      dataSource: 'Bybit MAINNET public market data',
      executionSource: this.isLive
        ? `Bybit ${this.config.live.bybitTestnet ? 'TESTNET' : 'MAINNET'} API`
        : 'Paper executor (fallback / simulation)',
      executionMode: this.mode,
      hasExecutionCredentials: Boolean(this.config.apiKey && this.config.apiSecret),
      bybitTestnet: this.config.live.bybitTestnet,
    };
  }
}

// ── Singleton for server-side usage ──

let _adapter: ExecutionAdapter | null = null;

function resolveConfigFromEnv(base: ExecutionConfig): ExecutionConfig {
  const env = process.env;
  const apiKey = env.BYBIT_TESTNET_API_KEY || env.BYBIT_API_KEY || base.apiKey;
  const apiSecret = env.BYBIT_TESTNET_API_SECRET || env.BYBIT_API_SECRET || base.apiSecret;
  const liveRequested = (env.EXECUTION_MODE || '').toLowerCase() === 'live';
  const mode: ExecutionMode = liveRequested ? 'live' : base.mode;

  return {
    ...base,
    mode,
    apiKey,
    apiSecret,
    live: {
      ...base.live,
      bybitTestnet: (env.BYBIT_EXECUTION_TESTNET || 'true').toLowerCase() !== 'false',
    },
  };
}

export function getExecutionAdapter(config?: ExecutionConfig): ExecutionAdapter {
  if (!_adapter) {
    const resolved = resolveConfigFromEnv(config || DEFAULT_EXECUTION_CONFIG);
    _adapter = new ExecutionAdapter(resolved);
  }
  return _adapter;
}

export function resetExecutionAdapter() {
  _adapter = null;
}
