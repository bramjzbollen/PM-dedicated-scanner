import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet, JsonRpcProvider } from 'ethers';
import { ensureV2ScannerRunning } from '@/lib/v2-scanner-manager';
import { getTokenIdForSide } from '@/lib/pm-token-resolver-v3';
import { checkBalanceForOrder, getPMWalletBalance, type WalletBalanceResult } from '@/lib/pm-wallet-balance';

export type PMExecutionMode = 'paper' | 'live';
export type PMMode = 'v2-scalping' | 'v2-swing' | 'v2-grid';
export type PMStrategyMode = 'sniper' | 'oracle-lead';

export interface PMEventConfig {
  symbol: string;
  marketKey: string;
  tokenId?: string;
  label: string;
  timeframeMinutes: number;
  enabled: boolean;
}

export interface PMSuggestedMarket {
  id: string;
  marketKey: string;
  label: string;
  symbol: string;
  timeframeMinutes: number;
  slug?: string;
  question?: string;
  tags: string[];
  volumeNum?: number;
}

export interface PMBotConfig {
  enabled: boolean;
  mode: PMExecutionMode;
  paperBetSizeUsd: number;
  maxOpenBets: number;
  confidenceThreshold: number;
  maxDailyLossUsd: number;
  events: PMEventConfig[];
}

export interface PMDecision {
  id: string;
  timestamp: string;
  symbol: string;
  marketKey: string;
  side: 'UP' | 'DOWN';
  confidence: number;
  reason: string;
  source: 'bybit-v2-scalp-signals';
  strategyMode: PMStrategyMode;
}

export interface PMPaperBet {
  id: string;
  marketKey: string;
  pair: string;
  side: 'UP' | 'DOWN';
  sizeUsd: number;
  confidence: number;
  reason: string;
  source: 'bybit-v2-scalp-signals';
  strategyMode?: PMStrategyMode;
  entryPrice: number;
  intervalOpenPrice: number; // Chainlink price at interval start (PM settlement reference)
  entryOdds: number;
  openedAt: string;
  settleAt: string;
  status: 'open' | 'closed';
  execution?: 'paper' | 'live';
  liveOrderId?: string;
  liveTokenId?: string;
  liveOrderStatus?: string;
  fallbackReason?: string;
  exitPrice?: number;
  exit?: 'WIN' | 'LOSS';
  pnlUsd?: number;
  settledAt?: string;
}

export interface PMStats {
  openBets: number;
  closedBets: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalPnlUsd: number;
  todayPnlUsd: number;
  // Paper vs Live breakdown
  paperPnlUsd: number;
  livePnlUsd: number;
  paperWins: number;
  liveWins: number;
  paperLosses: number;
  liveLosses: number;
}

export interface PMRuntimeState {
  timestamp: string;
  ageMs: number;
  stale: boolean;
  feedTimestamp: string | null;
  feedAgeMs: number | null;
  enabled: boolean;
  mode: PMExecutionMode;
  executionStatus: 'PAPER' | 'LIVE' | 'BLOCKED';
  statusReason: string;
  paperModeOnly: boolean;
  sourceLabel: string;
  roadmapTag: string;
  walletBalance?: {
    ok: boolean;
    balanceUsd: number;
    address: string;
    cached: boolean;
    fetchedAt: string;
    error?: string;
  };
  events: Array<{
    symbol: string;
    marketKey: string;
    tokenId?: string | null;
    label: string;
    enabled: boolean;
    suggestedSide: 'UP' | 'DOWN' | 'NONE';
    confidence: number;
    reason: string;
    countdownSec: number;
    activeBetId?: string;
  }>;
  stats: PMStats;
}

interface BybitSignal {
  pair: string;
  signal?: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence?: number;
  reason?: string;
  indicators?: {
    price?: number;
    emaTrend?: number;
    atrPercent?: number;
    stochK?: number;
    stochD?: number;
  };
}

interface BybitFeed {
  timestamp?: string;
  prices?: Record<string, number>;
  signals?: BybitSignal[];
}

// In-memory cache for PM scanner signals (avoids redundant disk reads that can fail stale checks)
let _pmSignalCache: { timestamp: number; signals: PMScannerSignal[] } = { timestamp: 0, signals: [] };

const DATA_DIR = join(process.cwd(), '..', 'trade-state');
const PM_STALE_THRESHOLD_MS = Number(process.env.PM_STALE_THRESHOLD_MS || 30000); // 30s voor stabielere feed
const FALLBACK_DIR = join(process.cwd(), 'public');
const CONFIG_FILE = 'pm-bot-config.json';
const BETS_FILE = 'pm-bot-paper-bets.json';
const DECISIONS_FILE = 'pm-bot-decisions.json';
const LIVE_ORDERS_LOG_FILE = 'pm-bot-live-orders.log';
const BYBIT_FEED_FILE = join(process.cwd(), 'public', 'v2-scalp-signals.json');
const PM_SIGNALS_FILE = join(process.cwd(), 'public', 'pm-signals.json');
const PM_CLOB_HOST = process.env.PM_CLOB_HOST || 'https://clob.polymarket.com';
const PM_CHAIN_ID = Number(process.env.PM_CHAIN_ID || 137);
const PM_LIVE_MIN_BET_USD = Number(process.env.PM_LIVE_MIN_BET_USD || 2);
const PM_LIVE_MAX_BET_USD = Number(process.env.PM_LIVE_MAX_BET_USD || 25);
const PM_LIVE_MAX_CONCURRENT_ORDERS = 2;

const DEFAULT_CONFIG: PMBotConfig = {
  enabled: false,
  mode: 'paper',
  paperBetSizeUsd: 25,
  maxOpenBets: 3,
  confidenceThreshold: 70,
  maxDailyLossUsd: 75,
  events: [
    { symbol: 'BTC/USDT', marketKey: 'PM-BTC-5M-UPDOWN', label: 'BTC 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'ETH/USDT', marketKey: 'PM-ETH-5M-UPDOWN', label: 'ETH 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'SOL/USDT', marketKey: 'PM-SOL-5M-UPDOWN', label: 'SOL 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'XRP/USDT', marketKey: 'PM-XRP-5M-UPDOWN', label: 'XRP 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'DOGE/USDT', marketKey: 'PM-DOGE-5M-UPDOWN', label: 'DOGE 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'BTC/USDT', marketKey: 'PM-BTC-15M-UPDOWN', label: 'BTC 15m Up/Down', timeframeMinutes: 15, enabled: true },
    { symbol: 'ETH/USDT', marketKey: 'PM-ETH-15M-UPDOWN', label: 'ETH 15m Up/Down', timeframeMinutes: 15, enabled: true },
    { symbol: 'SOL/USDT', marketKey: 'PM-SOL-15M-UPDOWN', label: 'SOL 15m Up/Down', timeframeMinutes: 15, enabled: true },
    { symbol: 'XRP/USDT', marketKey: 'PM-XRP-15M-UPDOWN', label: 'XRP 15m Up/Down', timeframeMinutes: 15, enabled: true },
    { symbol: 'DOGE/USDT', marketKey: 'PM-DOGE-15M-UPDOWN', label: 'DOGE 15m Up/Down', timeframeMinutes: 15, enabled: true },
    { symbol: 'BTC/USDT', marketKey: 'PM-BTC-8AM-ET-UPDOWN', label: 'Bitcoin up or down (8am ET)', timeframeMinutes: 60, enabled: false },
    { symbol: 'ETH/USDT', marketKey: 'PM-ETH-8AM-ET-UPDOWN', label: 'Ethereum up or down (8am ET)', timeframeMinutes: 60, enabled: false },
    { symbol: 'SOL/USDT', marketKey: 'PM-SOL-8AM-ET-UPDOWN', label: 'Solana up or down (8am ET)', timeframeMinutes: 60, enabled: false },
  ],
};

const MAX_BETS = 500;
const MAX_DECISIONS = 300;

const CRYPTO_DISCOVERY_KEYWORDS = [
  'crypto', 'bitcoin', 'ethereum', 'solana', 'xrp', 'doge', 'bnb', 'avax', 'link', 'dot',
  'sui', 'arb', 'op', 'trump coin', 'memecoin', 'up or down', 'higher or lower',
];

const TIMEFRAME_HINTS: Array<{ timeframeMinutes: number; hints: string[] }> = [
  { timeframeMinutes: 5, hints: ['5m', '5 min', 'in 5 minutes', 'next 5 minutes'] },
  { timeframeMinutes: 15, hints: ['15m', '15 min', '15 minute', 'in 15 minutes', 'next 15 minutes'] },
  { timeframeMinutes: 60, hints: ['1h', '1 hour', 'in 1 hour', 'next hour'] },
  { timeframeMinutes: 240, hints: ['4h', '4 hour', 'in 4 hours'] },
];

async function ensureDir(): Promise<string> {
  try {
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
    return DATA_DIR;
  } catch {
    return FALLBACK_DIR;
  }
}

async function readJson<T>(filename: string): Promise<T | null> {
  const dir = await ensureDir();
  try {
    return JSON.parse(await readFile(join(dir, filename), 'utf-8')) as T;
  } catch {
    try {
      return JSON.parse(await readFile(join(FALLBACK_DIR, filename), 'utf-8')) as T;
    } catch {
      return null;
    }
  }
}

async function writeJson<T>(filename: string, payload: T): Promise<void> {
  const dir = await ensureDir();
  const path = join(dir, filename);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf-8');
  const { rename } = await import('node:fs/promises');
  await rename(tmp, path);
}

async function appendLiveOrderLog(message: string): Promise<void> {
  const dir = await ensureDir();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(join(dir, LIVE_ORDERS_LOG_FILE), line, 'utf-8').catch(() => undefined);
}

function todayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeRequestedMode(mode: unknown): PMExecutionMode {
  return mode === 'live' ? 'live' : 'paper';
}

function getEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim().length > 0) return String(value).trim();
  }
  return undefined;
}

const REF_PRICE_CACHE_MS = 30_000;
const refPriceCache = new Map<string, { price: number; at: number }>();

function getMaxReferenceDeltaUsd(symbolPair: string): number {
  const symbol = String(symbolPair || '').split('/')[0]?.toUpperCase();
  const override = Number(getEnv('PM_MAX_REFERENCE_DELTA_USD'));
  if (Number.isFinite(override) && override > 0) return override;
  if (symbol === 'BTC') return 120;
  if (symbol === 'ETH') return 12;
  if (symbol === 'SOL') return 1.2;
  if (symbol === 'XRP') return 0.03;
  return 0;
}

async function getReferencePriceUsd(symbolPair: string): Promise<number | null> {
  const symbol = String(symbolPair || '').split('/')[0]?.toUpperCase();
  if (!symbol) return null;

  const cached = refPriceCache.get(symbol);
  if (cached && Date.now() - cached.at < REF_PRICE_CACHE_MS) return cached.price;

  const endpoint = symbol === 'BTC'
    ? 'https://api.coinbase.com/v2/prices/BTC-USD/spot'
    : symbol === 'ETH'
      ? 'https://api.coinbase.com/v2/prices/ETH-USD/spot'
      : symbol === 'SOL'
        ? 'https://api.coinbase.com/v2/prices/SOL-USD/spot'
        : symbol === 'XRP'
          ? 'https://api.coinbase.com/v2/prices/XRP-USD/spot'
          : null;

  if (!endpoint) return null;

  try {
    const res = await fetch(endpoint, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => ({}));
    const raw = payload?.data?.amount;
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) return null;
    refPriceCache.set(symbol, { price, at: Date.now() });
    return price;
  } catch {
    return null;
  }
}

function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

async function fetchGeoblockStatus(): Promise<{ pass: boolean; reason?: string }> {
  try {
    const res = await fetch('https://polymarket.com/api/geoblock', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const payload = await res.json().catch(() => ({}));
    const blocked = Boolean(payload?.blocked);
    if (!res.ok) return { pass: false, reason: `geoblock endpoint ${res.status}` };
    if (blocked) return { pass: false, reason: 'geoblock=BLOCKED' };
    return { pass: true };
  } catch (error: any) {
    return { pass: false, reason: error?.message || 'geoblock check failed' };
  }
}

// Legacy env-based token mapping removed - now using dynamic Gamma API resolution

function isAuthOrSignatureError(msg: string): boolean {
  const s = msg.toLowerCase();
  return s.includes('401') || s.includes('403') || s.includes('unauthorized') || s.includes('invalid api key') || s.includes('signature');
}

async function createPMClobClient(): Promise<ClobClient> {
  const privateKey = getEnv('PM_PRIVATE_KEY', 'POLY_PRIVATE_KEY', 'POLYMARKET_PRIVATE_KEY', 'CLOB_PRIVATE_KEY', 'PRIVATE_KEY');
  const signatureType = Number(getEnv('PM_SIGNATURE_TYPE', 'POLY_SIGNATURE_TYPE', 'CLOB_SIGNATURE_TYPE') || 2);
  const funder = getEnv('PM_FUNDER_ADDRESS', 'POLY_FUNDER_ADDRESS', 'CLOB_FUNDER_ADDRESS');
  if (!privateKey) throw new Error('PM private key missing');
  if (!funder) throw new Error('PM funder address missing');

  // Create provider for Polygon
  const rpcUrl = getEnv('PM_RPC_URL', 'POLYGON_RPC_URL') || 'https://polygon-rpc.com';
  const provider = new JsonRpcProvider(rpcUrl);
  
  // Connect wallet to provider
  const baseWallet = new Wallet(privateKey, provider);
  
  // ClobClient expects EthersSigner interface:
  // - getAddress(): Promise<string>
  // - _signTypedData(domain, types, value): Promise<string>
  // But ethers v6 Wallet has:
  // - .address property (not getAddress() method)
  // - signTypedData(domain, types, value) (no underscore)
  // Wrap wallet to provide ClobSigner-compatible interface
  const signer = {
    ...baseWallet,
    getAddress: async () => baseWallet.address,
    _signTypedData: async (domain: any, types: any, value: any) => {
      return await baseWallet.signTypedData(domain, types, value);
    },
  } as any;
  
  console.log(`[ClobClient-Debug] signer.address=${baseWallet.address} funder=${funder} sigType=${signatureType}`);
  console.log(`[ClobClient-Debug] signer has getAddress=${typeof signer.getAddress} provider=${!!signer.provider}`);
  
  console.log(`[ClobClient] Creating bootstrap client...`);
  const bootstrapClient = new ClobClient(
    PM_CLOB_HOST, 
    PM_CHAIN_ID as any, 
    signer, 
    undefined, // no creds yet
    signatureType as any, 
    funder, // proxy address
    undefined, // geoBlockToken
    true // useServerTime
  );
  
  console.log(`[ClobClient] Deriving API key...`);
  const creds = await bootstrapClient.createOrDeriveApiKey();
  console.log(`[ClobClient] API key derived, creating final client...`);
  
  return new ClobClient(
    PM_CLOB_HOST, 
    PM_CHAIN_ID as any, 
    signer, 
    creds, 
    signatureType as any, 
    funder,
    undefined, // geoBlockToken
    true // useServerTime
  );
}

async function evaluateLiveGuards(config: PMBotConfig, feed: BybitFeed): Promise<{ allowed: boolean; reason: string }> {
  if (config.mode !== 'live') return { allowed: false, reason: 'Paper mode geselecteerd' };

  const now = Date.now();
  const feedTs = feed?.timestamp ? new Date(feed.timestamp).getTime() : NaN;
  const feedAgeMs = Number.isFinite(feedTs) ? Math.max(0, now - feedTs) : Number.POSITIVE_INFINITY;
  const stale = !Number.isFinite(feedAgeMs) || feedAgeMs > PM_STALE_THRESHOLD_MS;
  if (stale) return { allowed: false, reason: `Scanner feed stale (age ${Number.isFinite(feedAgeMs) ? Math.round(feedAgeMs) : 'unknown'}ms)` };

  const signatureTypeRaw = getEnv('PM_SIGNATURE_TYPE', 'POLY_SIGNATURE_TYPE', 'CLOB_SIGNATURE_TYPE');
  const signatureTypeNum = signatureTypeRaw === undefined ? Number.NaN : Number(signatureTypeRaw);
  if (![0, 1, 2].includes(signatureTypeNum)) return { allowed: false, reason: 'Preflight critical: signature type invalid' };

  const funder = getEnv('PM_FUNDER_ADDRESS', 'POLY_FUNDER_ADDRESS', 'CLOB_FUNDER_ADDRESS');
  if (!funder || !isEthAddress(funder)) return { allowed: false, reason: 'Preflight critical: funder address invalid' };

  const hasApiCreds = Boolean(getEnv('POLYMARKET_API_KEY', 'PM_API_KEY', 'CLOB_API_KEY') && getEnv('POLYMARKET_API_SECRET', 'PM_API_SECRET', 'CLOB_API_SECRET') && getEnv('POLYMARKET_API_PASSPHRASE', 'PM_API_PASSPHRASE', 'CLOB_API_PASSPHRASE'));
  const hasPrivateKey = Boolean(getEnv('PM_PRIVATE_KEY', 'POLY_PRIVATE_KEY', 'POLYMARKET_PRIVATE_KEY', 'CLOB_PRIVATE_KEY', 'PRIVATE_KEY'));
  if (!hasApiCreds && !hasPrivateKey) return { allowed: false, reason: 'Preflight critical: missing auth credentials/private key' };

  const geoblock = await fetchGeoblockStatus();
  if (!geoblock.pass) return { allowed: false, reason: `Geoblock check failed: ${geoblock.reason}` };

  return { allowed: true, reason: 'Live guards PASS' };
}

export async function getPMConfig(): Promise<PMBotConfig> {
  const saved = await readJson<PMBotConfig>(CONFIG_FILE);
  const baseEvents = DEFAULT_CONFIG.events.map((e) => {
    const existing = saved?.events?.find((x) => x.marketKey === e.marketKey || x.symbol === e.symbol);
    return { ...e, ...(existing || {}), timeframeMinutes: Number(existing?.timeframeMinutes || e.timeframeMinutes) };
  });

  const extraEvents = (saved?.events || [])
    .filter((ev) => ev?.marketKey && !baseEvents.some((base) => base.marketKey === ev.marketKey))
    .map((ev) => ({
      symbol: ev.symbol || 'CRYPTO/USDT',
      marketKey: ev.marketKey,
      tokenId: typeof ev.tokenId === 'string' ? ev.tokenId : undefined,
      label: ev.label || ev.marketKey,
      timeframeMinutes: Number(ev.timeframeMinutes || 60),
      enabled: Boolean(ev.enabled),
    }));

  // Deduplicate events by marketKey
  const allEvents = [...baseEvents, ...extraEvents];
  const uniqueEvents = allEvents.filter((ev, idx, arr) => 
    arr.findIndex(e => e.marketKey === ev.marketKey) === idx
  );

  const merged: PMBotConfig = {
    ...DEFAULT_CONFIG,
    ...saved,
    mode: normalizeRequestedMode(saved?.mode),
    events: uniqueEvents,
  };
  return merged;
}

export async function updatePMConfig(next: Partial<PMBotConfig>): Promise<PMBotConfig> {
  const current = await getPMConfig();
  const incomingEvents = next.events || [];

  const mergedExisting = current.events.map((ev) => {
    const incoming = incomingEvents.find((x) => x.marketKey === ev.marketKey || x.symbol === ev.symbol);
    return incoming
      ? { ...ev, ...incoming, timeframeMinutes: Number(incoming.timeframeMinutes || ev.timeframeMinutes || 60) }
      : ev;
  });

  const appended = incomingEvents
    .filter((ev) => ev?.marketKey && !mergedExisting.some((x) => x.marketKey === ev.marketKey))
    .map((ev) => ({
      symbol: ev.symbol || 'CRYPTO/USDT',
      marketKey: ev.marketKey,
      tokenId: typeof ev.tokenId === 'string' ? ev.tokenId : undefined,
      label: ev.label || ev.marketKey,
      timeframeMinutes: Number(ev.timeframeMinutes || 60),
      enabled: Boolean(ev.enabled),
    }));

  const requestedMode = normalizeRequestedMode(next.mode ?? current.mode);
  const merged: PMBotConfig = {
    ...current,
    ...next,
    mode: requestedMode,
    events: [...mergedExisting, ...appended],
  };

  // Persist requested mode; runtime will enforce guarded fallback (BLOCKED -> PAPER effective mode)
  // whenever preflight/freshness/geoblock checks fail.
  await writeJson(CONFIG_FILE, merged);
  return merged;
}

export async function getPMDecisions(): Promise<PMDecision[]> {
  return (await readJson<PMDecision[]>(DECISIONS_FILE)) || [];
}

async function appendDecision(d: PMDecision): Promise<void> {
  const current = await getPMDecisions();
  await writeJson(DECISIONS_FILE, [d, ...current].slice(0, MAX_DECISIONS));
}

export async function getPMBets(): Promise<PMPaperBet[]> {
  return (await readJson<PMPaperBet[]>(BETS_FILE)) || [];
}

async function savePMBets(bets: PMPaperBet[]): Promise<void> {
  await writeJson(BETS_FILE, bets.slice(0, MAX_BETS));
}

// ── PM Scanner v4 integration ──────────────────────────────────
interface PMScannerSignal {
  event: string;
  symbol: string;
  marketKey: string;
  timeframeMinutes: number;
  side: 'UP' | 'DOWN' | null;
  confidence: number;
  reason: string;
  skipTrade: boolean;
  skipReason?: string;
  edge?: number;
  pmOdds?: { up: number; down: number };
  kelly?: { fullKellyPct: number; recommendedPct: number; edge: number; worthBetting: boolean };
  oraclePrice?: number;
  bybitPrice?: number;
  priceGap?: { usd: number; percent?: number };
  timeToSettle?: number;
  trend?: string;
  momentum?: number;
  volatility?: number;
  velocity?: { direction: string; strength: number; projected: number };
  flashCrash?: any;
}

interface PMScannerFeed {
  timestamp: string;
  version: string;
  regime: string;
  regimeConfidence: number;
  oracleSource: string;
  signals: PMScannerSignal[];
  scanDurationMs: number;
}

async function readPMScannerFeed(): Promise<BybitFeed | null> {
  try {
    const raw = await readFile(PM_SIGNALS_FILE, 'utf-8');
    const feed = JSON.parse(raw) as PMScannerFeed;

    // Check freshness: max 60 seconds old
    const age = Date.now() - new Date(feed.timestamp).getTime();
    if (age > 60_000 || !feed.signals?.length) return null;

    console.log(`[PM Bot] Using PM Scanner v4 (age: ${Math.round(age / 1000)}s, ${feed.signals.length} signals, regime: ${feed.regime})`);

    // Cache PM scanner signals in memory so getPMScannerSignal doesn't need to re-read from disk
    _pmSignalCache = { timestamp: Date.now(), signals: feed.signals };

    const prices: Record<string, number> = {};
    const bestByPair = new Map<string, BybitSignal>();

    for (const sig of feed.signals) {
      // Track prices (oracle preferred)
      if (!prices[sig.symbol]) {
        prices[sig.symbol] = sig.oraclePrice || sig.bybitPrice || 0;
      }

      // Skip filtered signals or null side
      if (sig.skipTrade || !sig.side) continue;

      // Only take signals with positive edge
      if (typeof sig.edge === 'number' && sig.edge < 0.05) continue;

      const mapped: BybitSignal = {
        pair: sig.symbol,
        signal: sig.side === 'UP' ? 'LONG' as const : 'SHORT' as const,
        confidence: sig.confidence,
        reason: `PM-V5[${(sig as any).signalMode || 'dir'}]: edge=${sig.edge ? (sig.edge * 100).toFixed(1) : '?'}% | ${sig.reason}`,
        indicators: {
          price: sig.oraclePrice || sig.bybitPrice || 0,
          emaTrend: sig.bybitPrice || 0,
          atrPercent: sig.volatility || 0.2,
          stochK: 50 + (sig.momentum || 0) / 2,
          stochD: 50,
        },
      };

      const existing = bestByPair.get(sig.symbol);
      if (!existing || (mapped.confidence ?? 0) > (existing.confidence ?? 0)) {
        bestByPair.set(sig.symbol, mapped);
      }
    }

    // Even if no actionable signals pass the edge filter, still return prices
    // so the sniper and other strategies have price data to work with
    if (bestByPair.size === 0) {
      console.log('[PM Bot] PM Scanner v4: no actionable signals (all skipped/no-edge), but returning prices');
      return {
        timestamp: feed.timestamp,
        prices,
        signals: [],
      };
    }

    return {
      timestamp: feed.timestamp,
      prices,
      signals: [...bestByPair.values()],
    };
  } catch (err) {
    console.error('[PM Bot] readPMScannerFeed FAILED:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function readBybitFeed(): Promise<BybitFeed> {
  // 1. PRIMARY: Try PM Scanner v4 (edge-based, Polymarket-native)
  const pmFeed = await readPMScannerFeed();
  console.log('[PM Bot] readPMScannerFeed result:', pmFeed ? `OK, ${pmFeed.signals?.length ?? 0} signals` : 'NULL (fallback to Bybit)');
  if (pmFeed) return pmFeed;

  // 2. FALLBACK: Bybit scalp signals
  try {
    ensureV2ScannerRunning();
  } catch {
    // non-fatal
  }

  try {
    console.log('[PM Bot] Fallback: Using Bybit v2-scalp-signals');
    return JSON.parse(await readFile(BYBIT_FEED_FILE, 'utf-8')) as BybitFeed;
  } catch {
    return { prices: {}, signals: [] };
  }
}

// ── Interval open price tracking (in-memory) ──────────────────
// Stores the price at the start of each PM interval per symbol+timeframe.
// Key: "symbol|timeframeMinutes", e.g. "BTC/USDT|5"
const intervalOpenCache = new Map<string, { price: number; intervalStart: number }>();

/**
 * Track and return the interval open price for a symbol+timeframe.
 * Call this every cycle with the current price. When a new interval starts,
 * the current price is stored as the open price for that interval.
 */
function trackIntervalOpenPrice(symbol: string, timeframeMinutes: number, currentPrice: number): void {
  if (!currentPrice || currentPrice <= 0) return;
  const key = `${symbol}|${timeframeMinutes}`;
  const intervalSec = timeframeMinutes * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  const currentIntervalStart = Math.floor(nowSec / intervalSec) * intervalSec;

  const cached = intervalOpenCache.get(key);
  if (!cached || cached.intervalStart !== currentIntervalStart) {
    // New interval — store current price as the open
    intervalOpenCache.set(key, { price: currentPrice, intervalStart: currentIntervalStart });
    console.log(`[PM IntervalOpen] NEW interval ${symbol} ${timeframeMinutes}m: open=${currentPrice.toFixed(4)} (interval=${currentIntervalStart})`);
  }
}

// ── Odds history for momentum detection ────────────────────────
// Stores last N odds snapshots per marketKey for momentum strategy
const oddsHistory = new Map<string, Array<{ t: number; up: number; down: number }>>();
const ODDS_HISTORY_MAX_AGE_MS = 60_000; // keep 60s of history
const ODDS_HISTORY_MAX_ENTRIES = 10;

function recordOddsSnapshot(marketKey: string, up: number, down: number): void {
  const now = Date.now();
  const history = oddsHistory.get(marketKey) || [];
  history.push({ t: now, up, down });
  // Prune old entries
  const cutoff = now - ODDS_HISTORY_MAX_AGE_MS;
  const pruned = history.filter(h => h.t >= cutoff).slice(-ODDS_HISTORY_MAX_ENTRIES);
  oddsHistory.set(marketKey, pruned);
}

function getOddsMomentum(marketKey: string): { side: 'UP' | 'DOWN'; delta: number; windowMs: number } | null {
  const history = oddsHistory.get(marketKey);
  if (!history || history.length < 3) return null;

  const now = Date.now();
  // Look at entries within last 30 seconds
  const recent = history.filter(h => now - h.t <= 30_000);
  if (recent.length < 2) return null;

  const oldest = recent[0];
  const newest = recent[recent.length - 1];
  const windowMs = newest.t - oldest.t;
  if (windowMs < 5_000) return null; // need at least 5s window

  const upDelta = newest.up - oldest.up;
  const downDelta = newest.down - oldest.down;

  // Need > 10¢ move in < 30s
  if (Math.abs(upDelta) >= 0.10) {
    return { side: upDelta > 0 ? 'UP' : 'DOWN', delta: Math.abs(upDelta), windowMs };
  }
  if (Math.abs(downDelta) >= 0.10) {
    return { side: downDelta > 0 ? 'DOWN' : 'UP', delta: Math.abs(downDelta), windowMs };
  }
  return null;
}

// ── Strategy decision builder ──────────────────────────────────

interface StrategyContext {
  symbol: string;
  marketKey: string;
  timeframeMinutes: number;
  pmOdds: { up: number; down: number };
  oraclePrice: number | null;
  bybitPrice: number | null;
  timeToSettle: number; // seconds until settlement (computed fresh)
  sig: BybitSignal | undefined;
  price: number;
}

function trySniper(ctx: StrategyContext): PMDecision | null {
  // End-Cycle Sniper: T-90s to T-5s window (widened for 5m markets where 90s pre-settle is already decisive)
  const tts = ctx.timeToSettle;
  const inWindow = tts <= 90 && tts >= 5;

  const { up, down } = ctx.pmOdds;
  const maxOdds = Math.max(up, down);

  // Use best available current price for diagnostics
  const _sniperCurrentPrice = (ctx.oraclePrice && ctx.oraclePrice > 0) ? ctx.oraclePrice
    : (ctx.bybitPrice && ctx.bybitPrice > 0) ? ctx.bybitPrice
    : (ctx.price > 0 ? ctx.price : 0);
  const _intervalOpen = getIntervalOpenPrice(ctx.symbol, ctx.timeframeMinutes);
  const _diffPct = (_sniperCurrentPrice > 0 && _intervalOpen > 0)
    ? (((_sniperCurrentPrice - _intervalOpen) / _intervalOpen) * 100).toFixed(4)
    : 'N/A';
  console.log('[trySniper]', ctx.symbol, 'TTL:', tts, 'intervalOpen:', _intervalOpen, 'current:', _sniperCurrentPrice, 'priceDiff%:', _diffPct);

  console.log('[PM Sniper] Check:', ctx.symbol, 'TTL:', tts, 'maxOdds:', maxOdds.toFixed(2), 'threshold:', 0.65, 'inWindow:', inWindow);

  // === 1) Odds-based sniper: one side >= 0.65 ===
  const SNIPER_ODDS_THRESHOLD = 0.65;
  const upDominant = up >= SNIPER_ODDS_THRESHOLD;
  const downDominant = down >= SNIPER_ODDS_THRESHOLD;

  if (inWindow && (upDominant || downDominant)) {
    const side: 'UP' | 'DOWN' = upDominant ? 'UP' : 'DOWN';
    const dominantOdds = upDominant ? up : down;
    // Confidence scales with odds certainty: 0.65 → 85, 0.95 → 95
    const confidence = clamp(Math.round(65 + dominantOdds * 35), 85, 98);

    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      symbol: ctx.symbol,
      marketKey: ctx.marketKey,
      side,
      confidence,
      reason: `SNIPER-ODDS: T-${tts}s | odds=${dominantOdds.toFixed(3)}≥${SNIPER_ODDS_THRESHOLD} → ${side} | near-settlement certainty play`,
      source: 'bybit-v2-scalp-signals',
      strategyMode: 'sniper',
    };
  }

  // === 2) Price-based sniper: current price vs interval open ===
  const PRICE_SNIPER_THRESHOLD_PCT = 0.05; // 0.05% deviation from interval open
  const PRICE_SNIPER_MAX_TTL = 90; // trigger with ≤90s left (same as odds-based window)
  const priceInWindow = tts !== null && tts <= PRICE_SNIPER_MAX_TTL && tts >= 5;

  // Use best available current price: oracle > bybit > feed price
  const sniperCurrentPrice = (ctx.oraclePrice && ctx.oraclePrice > 0) ? ctx.oraclePrice
    : (ctx.bybitPrice && ctx.bybitPrice > 0) ? ctx.bybitPrice
    : (ctx.price > 0 ? ctx.price : 0);

  if (priceInWindow && sniperCurrentPrice > 0) {
    const intervalOpen = getIntervalOpenPrice(ctx.symbol, ctx.timeframeMinutes);
    if (intervalOpen > 0) {
      const priceDeltaPct = ((sniperCurrentPrice - intervalOpen) / intervalOpen) * 100;
      if (Math.abs(priceDeltaPct) >= PRICE_SNIPER_THRESHOLD_PCT) {
        const side: 'UP' | 'DOWN' = priceDeltaPct > 0 ? 'UP' : 'DOWN';
        const confidence = clamp(Math.round(80 + Math.abs(priceDeltaPct) * 50), 82, 95);

        return {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          symbol: ctx.symbol,
          marketKey: ctx.marketKey,
          side,
          confidence,
          reason: `SNIPER-PRICE: T-${tts}s | price=${sniperCurrentPrice.toFixed(2)} vs open=${intervalOpen.toFixed(2)} Δ=${priceDeltaPct.toFixed(3)}% → ${side} | price-settlement play`,
          source: 'bybit-v2-scalp-signals',
          strategyMode: 'sniper',
        };
      }
    }
  }

  // === Near-miss logging for debugging ===
  if (inWindow) {
    const dominantOdds = Math.max(up, down);
    const intervalOpen = getIntervalOpenPrice(ctx.symbol, ctx.timeframeMinutes);
    const priceDelta = (sniperCurrentPrice > 0 && intervalOpen > 0)
      ? ((sniperCurrentPrice - intervalOpen) / intervalOpen) * 100
      : null;
    console.log(
      `[SNIPER-MISS] ${ctx.symbol} T-${tts}s | odds: UP=${up.toFixed(3)} DOWN=${down.toFixed(3)} (need≥${SNIPER_ODDS_THRESHOLD})` +
      (priceDelta !== null ? ` | priceΔ=${priceDelta.toFixed(4)}% (need≥${PRICE_SNIPER_THRESHOLD_PCT}%)` : ' | no price data') +
      ` | neither triggered`
    );
  }

  return null;
}

function tryOracleLead(ctx: StrategyContext): PMDecision | null {
  // Oracle-Lead Arbitrage: Bybit leads oracle, PM odds still reflect old oracle price
  if (ctx.bybitPrice === null || ctx.oraclePrice === null) return null;
  if (ctx.oraclePrice <= 0 || ctx.bybitPrice <= 0) return null;

  // Timing gate: only bet when TTL < 120s — divergence at the start of an interval
  // is irrelevant because the market has plenty of time to correct
  const tts = ctx.timeToSettle;
  if (tts > 120) {
    console.log(`[ORACLE-LEAD] ${ctx.symbol} SKIP: TTL=${tts}s > 120s — too early in interval`);
    return null;
  }

  const divergencePct = ((ctx.bybitPrice - ctx.oraclePrice) / ctx.oraclePrice) * 100;
  const absDivPct = Math.abs(divergencePct);

  // Need > 0.05% divergence
  if (absDivPct < 0.05) return null;

  // Bybit > oracle → price going UP, but PM odds may not reflect this yet
  const side: 'UP' | 'DOWN' = divergencePct > 0 ? 'UP' : 'DOWN';
  const currentOdds = side === 'UP' ? ctx.pmOdds.up : ctx.pmOdds.down;

  // Only bet if our side's odds are in the sweet spot: 0.40–0.65
  // Below 0.40 = betting against market consensus (speculative, not arbitrage)
  // Above 0.65 = market has already adjusted, edge is gone
  if (currentOdds < 0.40 || currentOdds > 0.65) return null;

  // Confidence based on divergence magnitude: 0.05% → 70, 0.15%+ → 90
  const confidence = clamp(Math.round(70 + (absDivPct - 0.05) * 200), 70, 92);

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    symbol: ctx.symbol,
    marketKey: ctx.marketKey,
    side,
    confidence,
    reason: `ORACLE-LEAD: bybit=${ctx.bybitPrice.toFixed(2)} oracle=${ctx.oraclePrice.toFixed(2)} div=${divergencePct.toFixed(3)}% | PM odds ${side}=${currentOdds.toFixed(2)} (lagging)`,
    source: 'bybit-v2-scalp-signals',
    strategyMode: 'oracle-lead',
  };
}

function buildStrategyDecision(ctx: StrategyContext): PMDecision | null {
  // Priority: sniper (primary) > oracle-lead — odds-momentum disabled
  return trySniper(ctx) || tryOracleLead(ctx);
}

/** Read PM scanner signal data for a specific market */
function getPMScannerSignal(marketKey: string): PMScannerSignal | null {
  // 1) Try in-memory cache first (populated by readPMScannerFeed, always fresh within same tick)
  const cacheAge = Date.now() - _pmSignalCache.timestamp;
  if (cacheAge < PM_STALE_THRESHOLD_MS * 2 && _pmSignalCache.signals.length > 0) {
    const cached = _pmSignalCache.signals.find((s) => s.marketKey === marketKey);
    if (cached) return cached;
  }

  // 2) Fallback: re-read from disk
  try {
    const raw = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'public', 'pm-signals.json'), 'utf-8'
    );
    const feed = JSON.parse(raw) as PMScannerFeed;
    const age = Date.now() - new Date(feed.timestamp).getTime();
    if (age > PM_STALE_THRESHOLD_MS * 2) return null;
    // Update cache from disk read
    _pmSignalCache = { timestamp: Date.now(), signals: feed.signals || [] };
    return feed.signals?.find((s: any) => s.marketKey === marketKey) || null;
  } catch {
    return null;
  }
}

/** Get the Bybit price for a symbol from the v2-scalp-signals feed */
function getBybitLivePrice(symbol: string): number | null {
  try {
    const raw = require('node:fs').readFileSync(BYBIT_FEED_FILE, 'utf-8');
    const feed = JSON.parse(raw) as BybitFeed;
    const age = Date.now() - new Date(feed.timestamp || '').getTime();
    if (age > 30_000) return null;
    const price = feed.prices?.[symbol];
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Get real Polymarket odds for a market from the v4 scanner output.
 * Returns the market odds for the given side, or null if unavailable.
 */
/**
 * Get the Chainlink/oracle price at the START of the current PM interval.
 * This is what Polymarket uses as the reference price for settlement.
 * UP wins if closePrice >= this price, DOWN wins if closePrice < this price.
 */
/**
 * Get oracle (Chainlink) price for settlement.
 * PM settles on Chainlink, not exchange spot price.
 */
function getOracleSettlementPrice(symbol: string): number | null {
  try {
    const raw = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'public', 'pm-signals.json'), 'utf-8'
    );
    const feed = JSON.parse(raw);
    const sig = feed.signals?.find((s: any) => s.symbol === symbol);
    if (sig?.oraclePrice && sig.oraclePrice > 0) return sig.oraclePrice;
    return null;
  } catch {
    return null;
  }
}

function getIntervalOpenPrice(symbol: string, timeframeMinutes: number): number {
  const key = `${symbol}|${timeframeMinutes}`;
  const cached = intervalOpenCache.get(key);
  return cached?.price ?? 0;
}

function getRealPMOdds(marketKey: string, side: 'UP' | 'DOWN'): number | null {
  try {
    const raw = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'public', 'pm-signals.json'), 'utf-8'
    );
    const feed = JSON.parse(raw);
    const age = Date.now() - new Date(feed.timestamp).getTime();
    if (age > PM_STALE_THRESHOLD_MS * 2) {
      console.warn(`[PM-BOT] getRealPMOdds: pm-signals.json stale (${Math.round(age / 1000)}s old) for ${marketKey} ${side}`);
      return null;
    }
    const sig = feed.signals?.find((s: any) => s.marketKey === marketKey);
    if (sig?.pmOdds) {
      const odds = side === 'UP' ? sig.pmOdds.up : sig.pmOdds.down;
      if (typeof odds === 'number' && odds > 0.01 && odds < 0.99) return odds;
    }
    console.warn(`[PM-BOT] getRealPMOdds: no valid pmOdds for ${marketKey} ${side}`);
    return null;
  } catch (e) {
    console.warn(`[PM-BOT] getRealPMOdds: error reading pm-signals.json:`, e);
    return null;
  }
}

/**
 * Polymarket dynamic taker fee.
 * Fee is highest near 50/50 odds (~1.56%) and near-zero at extreme odds.
 * Formula: fee_rate = 2% × min(odds, 1-odds) × 2
 * This means: at 50¢ → 2% fee, at 75¢ → 1% fee, at 90¢ → 0.4% fee
 */
function pmTakerFee(odds: number): number {
  const p = clamp(odds, 0.01, 0.99);
  return 0.02 * Math.min(p, 1 - p) * 2;
}

function calcPnl(sizeUsd: number, entryOdds: number, won: boolean): number {
  // Polymarket binary market PnL with taker fees:
  // 1. Pay taker fee on entry: effectiveCost = sizeUsd × (1 + feeRate)
  // 2. Buy shares: shares = sizeUsd / entryOdds (fee doesn't buy more shares)
  // 3. WIN: payout = shares × $1 = sizeUsd / entryOdds
  //    profit = payout - sizeUsd - fee
  // 4. LOSS: payout = $0, lose sizeUsd + fee
  const odds = clamp(entryOdds, 0.05, 0.95);
  const feeRate = pmTakerFee(odds);
  const fee = sizeUsd * feeRate;
  
  if (!won) return Number((-sizeUsd - fee).toFixed(2));
  const grossProfit = sizeUsd * ((1 / odds) - 1);
  return Number((grossProfit - fee).toFixed(2));
}

async function tryPlaceLiveOrder(params: {
  client: ClobClient;
  decision: PMDecision;
  tokenId: string;
  sizeUsd: number;
  marketPrice: number;
}): Promise<{ ok: true; orderId: string; status?: string } | { ok: false; error: string; authOrSignature: boolean }> {
  const side = params.decision.side === 'UP' ? Side.BUY : Side.SELL;
  const tickSize = await params.client.getTickSize(params.tokenId);
  const negRisk = await params.client.getNegRisk(params.tokenId);

  // Use market price from Gamma as entry price (slight slippage tolerance)
  const entryPrice = Number(Math.max(0.01, Math.min(0.99, params.marketPrice)).toFixed(3));

  try {
    // Use MARKET order path (FOK) to avoid lingering open limit orders on CLOB.
    // For BUY market orders, amount is USD notional.
    const marketAmountUsd = Number(params.sizeUsd.toFixed(2));

    const resp = await params.client.createAndPostMarketOrder(
      {
        tokenID: params.tokenId,
        side,
        amount: marketAmountUsd,
      } as any,
      { tickSize, negRisk },
      OrderType.FOK
    );

    const orderId = String(resp?.orderID || resp?.orderId || resp?.id || '').trim();
    if (!orderId) {
      throw new Error(`No orderId returned: ${JSON.stringify(resp)}`);
    }

    return { ok: true, orderId, status: String(resp?.status || 'posted') };
  } catch (error: any) {
    const message = error?.message || String(error);
    return { ok: false, error: message, authOrSignature: isAuthOrSignatureError(message) };
  }
}

function getStats(bets: PMPaperBet[]): PMStats {
  const openBets = bets.filter((b) => b.status === 'open');
  const closed = bets.filter((b) => b.status === 'closed');
  const wins = closed.filter((b) => b.exit === 'WIN').length;
  const losses = closed.filter((b) => b.exit === 'LOSS').length;
  const totalPnlUsd = closed.reduce((s, b) => s + (b.pnlUsd || 0), 0);
  const today = todayStr();
  const todayPnlUsd = closed.filter((b) => (b.settledAt || '').slice(0, 10) === today).reduce((s, b) => s + (b.pnlUsd || 0), 0);
  
  // Paper vs Live breakdown
  const paperClosed = closed.filter((b) => (b.execution === 'paper' || !b.execution));
  const liveClosed = closed.filter((b) => b.execution === 'live');
  
  const paperPnlUsd = paperClosed.reduce((s, b) => s + (b.pnlUsd || 0), 0);
  const livePnlUsd = liveClosed.reduce((s, b) => s + (b.pnlUsd || 0), 0);
  
  const paperWins = paperClosed.filter((b) => b.exit === 'WIN').length;
  const liveWins = liveClosed.filter((b) => b.exit === 'WIN').length;
  
  const paperLosses = paperClosed.filter((b) => b.exit === 'LOSS').length;
  const liveLosses = liveClosed.filter((b) => b.exit === 'LOSS').length;
  
  return {
    openBets: openBets.length,
    closedBets: closed.length,
    wins,
    losses,
    winRatePct: closed.length ? (wins / closed.length) * 100 : 0,
    totalPnlUsd: Number(totalPnlUsd.toFixed(2)),
    todayPnlUsd: Number(todayPnlUsd.toFixed(2)),
    paperPnlUsd: Number(paperPnlUsd.toFixed(2)),
    livePnlUsd: Number(livePnlUsd.toFixed(2)),
    paperWins,
    liveWins,
    paperLosses,
    liveLosses,
  };
}

export async function runPMCycle(): Promise<void> {
  const [config, feed, bets, decisions] = await Promise.all([
    getPMConfig(),
    readBybitFeed(),
    getPMBets(),
    getPMDecisions(),
  ]);

  console.log('[PM Bot] Cycle start, enabled:', config.enabled, 'events:', config.events.length);

  const now = Date.now();
  const bySymbol = new Map((feed.signals || []).map((s) => [s.pair, s]));
  const openBets = bets.filter((b) => b.status === 'open');

  // settle matured bets
  const nextBets = bets.map((b) => {
    if (b.status !== 'open') return b;
    const settleAtMs = new Date(b.settleAt).getTime();
    if (settleAtMs > now) return b;

    // Use Chainlink/oracle price for settlement (PM settles on Chainlink, not exchange spot)
    const oraclePx = getOracleSettlementPrice(b.pair);
    const px = oraclePx ?? feed.prices?.[b.pair];
    if (typeof px !== 'number' || px <= 0) return b;

    // Polymarket settlement: UP wins if close >= interval open, DOWN wins if close < interval open
    const refPrice = b.intervalOpenPrice || b.entryPrice; // fallback for old bets without intervalOpenPrice
    const won = b.side === 'UP' ? px >= refPrice : px < refPrice;
    const pnl = calcPnl(b.sizeUsd, b.entryOdds, won);
    return {
      ...b,
      status: 'closed' as const,
      exit: won ? 'WIN' as const : 'LOSS' as const,
      exitPrice: px,
      pnlUsd: pnl,
      settledAt: new Date().toISOString(),
    };
  });

  const stats = getStats(nextBets);
  let mutable = [...nextBets];
  let decisionBuffer = [...decisions];
  const liveGuard = await evaluateLiveGuards(config, feed);
  const executionStatus: PMRuntimeState['executionStatus'] = config.mode === 'live' ? (liveGuard.allowed ? 'LIVE' : 'BLOCKED') : 'PAPER';
  const effectiveMode: PMExecutionMode = executionStatus === 'LIVE' ? 'live' : 'paper';
  
  const activeLiveCount = mutable.filter((b) => b.status === 'open' && b.execution === 'live').length;
  let liveSlotsLeft = Math.max(0, PM_LIVE_MAX_CONCURRENT_ORDERS - activeLiveCount);
  let clobClient: ClobClient | null = null;
  let authBroken = false;

  if (config.enabled && stats.todayPnlUsd > -Math.abs(config.maxDailyLossUsd)) {
    for (const ev of config.events) {
      if (!ev.enabled) continue;
      // Daily loss guard: recheck PnL each iteration (includes bets settled this tick)
      const currentStats = getStats(mutable);
      if (currentStats.todayPnlUsd <= -Math.abs(config.maxDailyLossUsd)) break;
      if (mutable.filter((b) => b.status === 'open').length >= config.maxOpenBets) break;
      const hasOpenForEvent = mutable.some((b) => b.status === 'open' && b.marketKey === ev.marketKey);
      if (hasOpenForEvent) continue;

      const sig = bySymbol.get(ev.symbol);
      const price = feed.prices?.[ev.symbol] ?? sig?.indicators?.price;
      if (typeof price !== 'number' || price <= 0) continue;

      // ── Build strategy context from PM scanner + Bybit feeds ──
      const pmSig = getPMScannerSignal(ev.marketKey);
      const rawOdds = pmSig?.pmOdds || { up: 0, down: 0 };
      const pmOdds = { up: Number(rawOdds.up), down: Number(rawOdds.down) };
      const oraclePrice = pmSig?.oraclePrice || null;
      const bybitLivePrice = getBybitLivePrice(ev.symbol);
      // Always compute TTL fresh from timeframeMinutes (scanner value can be null/stale)
      const intervalSec = ev.timeframeMinutes * 60;
      const nowSec = Math.floor(Date.now() / 1000);
      const nextSettle = Math.ceil(nowSec / intervalSec) * intervalSec;
      const timeToSettle = nextSettle - nowSec;

      // Track interval open price: use best available price source
      // Priority: oracle > bybit live > feed price
      const bestPrice = (oraclePrice && oraclePrice > 0) ? oraclePrice
        : (bybitLivePrice && bybitLivePrice > 0) ? bybitLivePrice
        : price;
      trackIntervalOpenPrice(ev.symbol, ev.timeframeMinutes, bestPrice);

      // Record odds snapshot for momentum tracking
      recordOddsSnapshot(ev.marketKey, pmOdds.up, pmOdds.down);

      const stratCtx: StrategyContext = {
        symbol: ev.symbol,
        marketKey: ev.marketKey,
        timeframeMinutes: ev.timeframeMinutes,
        pmOdds,
        oraclePrice,
        bybitPrice: bybitLivePrice,
        timeToSettle,
        sig,
        price,
      };

      const decision = buildStrategyDecision(stratCtx);
      console.log('[PM Strategy] Result:', decision?.strategyMode || 'NONE', decision?.side, 'conf:', decision?.confidence);
      if (!decision) continue; // No strategy triggered — skip (non-directional only)

      decisionBuffer = [decision, ...decisionBuffer].slice(0, MAX_DECISIONS);

      // Strategy-specific confidence threshold (sniper/oracle-lead are already high-prob)
      const effectiveThreshold = decision.strategyMode === 'sniper'
        ? Math.min(config.confidenceThreshold, 50)
        : decision.strategyMode === 'oracle-lead'
          ? Math.min(config.confidenceThreshold, 55)
          : config.confidenceThreshold;
      if (decision.confidence < effectiveThreshold) continue;

      // Use REAL Polymarket odds — prefer already-loaded pmOdds from scanner context,
      // fall back to fresh disk read via getRealPMOdds. NEVER default to 0.5.
      const ctxOdds = decision.side === 'UP' ? pmOdds.up : pmOdds.down;
      const realOdds = (ctxOdds > 0.01 && ctxOdds < 0.99 && ctxOdds !== 0.5)
        ? ctxOdds
        : getRealPMOdds(ev.marketKey, decision.side);
      if (realOdds === null || realOdds === 0.5) {
        console.warn(`[PM-BOT] SKIP bet: no real PM odds for ${ev.marketKey} ${decision.side} (would default to 0.5)`);
        continue;
      }
      const entryOdds = Number(clamp(realOdds, 0.05, 0.95).toFixed(3));

      // Strategy-specific odds guards
      if (decision.strategyMode === 'sniper') {
        // Sniper: buy the winning side at 0.65–0.95 (high odds, near-certain, small profit)
        if (entryOdds > 0.95 || entryOdds < 0.50) continue;
      } else {
        // Oracle-lead: only bet when our side odds are 0.40–0.65 (not speculative, not priced-in)
        if (entryOdds > 0.65 || entryOdds < 0.40) continue;
      }

      const openedAt = new Date().toISOString();
      // Align settleAt with actual PM interval boundary
      const intervalSecSettle = ev.timeframeMinutes * 60;
      const nowSecSettle = Math.floor(Date.now() / 1000);
      const intervalEnd = (Math.floor(nowSecSettle / intervalSecSettle) + 1) * intervalSecSettle;
      const settleAt = new Date(intervalEnd * 1000).toISOString();

      // Strategy-specific sizing
      const betSizeUsd = (() => {
        if (decision.strategyMode === 'sniper') {
          // Flat $10-15 — low profit per trade but consistent
          return clamp(12, 10, 15);
        }
        // Oracle-lead: Kelly-based $5-30 — edge-dependent
        const bankroll = 149.49; // TODO: use wallet balance dynamically
        const edgePct = Math.max(0, (decision.confidence - 50) / 100);
        const kellyFraction = 0.25;
        const kellySize = bankroll * edgePct * kellyFraction;
        return Number(clamp(kellySize, 5, 30).toFixed(2));
      })();

      const baseBet: PMPaperBet = {
        id: `pm-paper-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        marketKey: ev.marketKey,
        pair: ev.symbol,
        side: decision.side,
        sizeUsd: betSizeUsd,
        confidence: decision.confidence,
        reason: decision.reason,
        source: 'bybit-v2-scalp-signals',
        strategyMode: decision.strategyMode,
        entryPrice: Number(price.toFixed(8)),
        intervalOpenPrice: getIntervalOpenPrice(ev.symbol, ev.timeframeMinutes) || Number(price.toFixed(8)),
        entryOdds,
        openedAt,
        settleAt,
        status: 'open',
        execution: 'paper',
      };

      // Attempt live execution if guards pass
      const canAttemptLive = effectiveMode === 'live' && executionStatus === 'LIVE' && !authBroken && liveSlotsLeft > 0;
      if (!canAttemptLive) {
        mutable.unshift(baseBet);
        continue;
      }

      // Strategy-specific live sizing (mirrors paper sizing, clamped to live limits)
      const liveBetSizeUsd = (() => {
        if (decision.strategyMode === 'sniper') return clamp(12, PM_LIVE_MIN_BET_USD, 15);
        // Oracle-lead: Kelly-based
        const bankroll = 149.49;
        const edgePct = Math.max(0, (decision.confidence - 50) / 100);
        const kellySize = bankroll * edgePct * 0.25;
        return clamp(kellySize, PM_LIVE_MIN_BET_USD, Math.min(30, PM_LIVE_MAX_BET_USD));
      })();

      // Balance guard: block live order if wallet balance < order size
      const balanceCheck = await checkBalanceForOrder(liveBetSizeUsd);
      if (!balanceCheck.allowed) {
        baseBet.fallbackReason = `Balance guard: ${balanceCheck.reason}`;
        await appendLiveOrderLog(`[FALLBACK:PAPER:BALANCE] market=${ev.marketKey} ${balanceCheck.reason}`);
        mutable.unshift(baseBet);
        continue;
      }

      // Resolve dynamic token ID from Gamma API
      let tokenResolved;
      try {
        tokenResolved = await getTokenIdForSide(ev.marketKey, decision.side);
      } catch (err: any) {
        baseBet.fallbackReason = `Token resolution failed: ${err?.message || err}`;
        await appendLiveOrderLog(`[FALLBACK:PAPER] market=${ev.marketKey} reason=${baseBet.fallbackReason}`);
        mutable.unshift(baseBet);
        continue;
      }

      if (!tokenResolved) {
        baseBet.fallbackReason = 'No active Polymarket market found for this event';
        await appendLiveOrderLog(`[FALLBACK:PAPER] market=${ev.marketKey} reason=${baseBet.fallbackReason}`);
        mutable.unshift(baseBet);
        continue;
      }

      const { tokenId, price: marketPrice, resolved } = tokenResolved;

      // Hard safety guard: never execute live if resolved slug doesn't match configured timeframe/symbol.
      const resolvedSlug = String(resolved?.eventSlug || '').toLowerCase();
      const key = ev.marketKey.toUpperCase();
      const wants5m = key.includes('5M');
      const wants15m = key.includes('15M');
      const wantsBTC = key.includes('BTC');
      const wantsETH = key.includes('ETH');
      const wantsSOL = key.includes('SOL');
      const wantsXRP = key.includes('XRP');
      const symbolOk = (wantsBTC && /(^|-)btc|bitcoin/.test(resolvedSlug))
        || (wantsETH && /(^|-)eth|ethereum/.test(resolvedSlug))
        || (wantsSOL && /(^|-)sol|solana/.test(resolvedSlug))
        || (wantsXRP && /(^|-)xrp|ripple/.test(resolvedSlug));
      const timeframeOk = (wants5m && /-updown-5m-\d+$/.test(resolvedSlug))
        || (wants15m && /-updown-15m-\d+$/.test(resolvedSlug))
        || (!wants5m && !wants15m);
      if (!symbolOk || !timeframeOk) {
        baseBet.fallbackReason = `Resolver mismatch: key=${ev.marketKey} slug=${resolvedSlug || 'n/a'}`;
        await appendLiveOrderLog(`[FALLBACK:PAPER:MISMATCH] market=${ev.marketKey} slug=${resolvedSlug || 'n/a'}`);
        mutable.unshift(baseBet);
        continue;
      }

      try {
        if (!clobClient) clobClient = await createPMClobClient();
        const liveResult = await tryPlaceLiveOrder({
          client: clobClient,
          decision,
          tokenId,
          sizeUsd: liveBetSizeUsd,
          marketPrice,
        });

        if (liveResult.ok) {
          liveSlotsLeft -= 1;
          const liveBet: PMPaperBet = {
            ...baseBet,
            id: `pm-live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            sizeUsd: liveBetSizeUsd,
            execution: 'live',
            strategyMode: decision.strategyMode,
            liveOrderId: liveResult.orderId,
            liveOrderStatus: liveResult.status,
            liveTokenId: tokenId,
            reason: `${baseBet.reason} | liveOrder=${liveResult.orderId} | pmMarket=${resolved.eventSlug}`,
          };
          console.log(`[pm-live-order] POSTED market=${ev.marketKey} pmSlug=${resolved.eventSlug} token=${tokenId.slice(0, 12)}... side=${decision.side} size=${liveBetSizeUsd} orderId=${liveResult.orderId}`);
          await appendLiveOrderLog(`[POSTED] market=${ev.marketKey} pmSlug=${resolved.eventSlug} token=${tokenId} side=${decision.side} sizeUsd=${liveBetSizeUsd} orderId=${liveResult.orderId}`);
          mutable.unshift(liveBet);
          continue;
        }

        if (liveResult.authOrSignature) {
          authBroken = true;
          console.error(`[pm-live-order][AUTH/SIGNATURE] ${liveResult.error}`);
          await appendLiveOrderLog(`[ALERT_AUTH_SIGNATURE] market=${ev.marketKey} token=${tokenId} error=${liveResult.error}`);
        } else {
          console.error(`[pm-live-order][FAIL] market=${ev.marketKey} token=${tokenId.slice(0, 12)}... error=${liveResult.error}`);
          await appendLiveOrderLog(`[FAIL] market=${ev.marketKey} token=${tokenId} error=${liveResult.error}`);
        }

        baseBet.fallbackReason = `live order failed: ${liveResult.error}`;
        mutable.unshift(baseBet);
      } catch (error: any) {
        const msg = error?.message || String(error);
        const authErr = isAuthOrSignatureError(msg);
        if (authErr) authBroken = true;
        console.error(`[pm-live-order][EXCEPTION] market=${ev.marketKey} token=${tokenId.slice(0, 12)}... error=${msg}`);
        await appendLiveOrderLog(`[EXCEPTION] market=${ev.marketKey} token=${tokenId} authOrSignature=${authErr} error=${msg}`);
        baseBet.fallbackReason = `live exception: ${msg}`;
        mutable.unshift(baseBet);
      }
    }
  }

  await Promise.all([
    savePMBets(mutable),
    writeJson(DECISIONS_FILE, decisionBuffer),
  ]);
}

export async function getPMRuntimeState(): Promise<PMRuntimeState> {
  await runPMCycle();
  const now = Date.now();
  const [config, feed, bets] = await Promise.all([getPMConfig(), readBybitFeed(), getPMBets()]);
  const decisions = await getPMDecisions();
  const stats = getStats(bets);
  const serverTimestamp = new Date(now).toISOString();
  const feedTs = feed?.timestamp ? new Date(feed.timestamp).getTime() : NaN;
  const feedAgeMs = Number.isFinite(feedTs) ? Math.max(0, now - feedTs) : null;
  const stale = typeof feedAgeMs === 'number' ? feedAgeMs > PM_STALE_THRESHOLD_MS : true;

  const liveGuard = await evaluateLiveGuards(config, feed);
  const executionStatus: PMRuntimeState['executionStatus'] = config.mode === 'live'
    ? (liveGuard.allowed ? 'LIVE' : 'BLOCKED')
    : 'PAPER';

  const statusReason = executionStatus === 'LIVE'
    ? 'Live preflight + freshness + geoblock PASS'
    : executionStatus === 'BLOCKED'
      ? liveGuard.reason
      : 'Paper mode actief';

  const effectiveMode: PMExecutionMode = executionStatus === 'LIVE' ? 'live' : 'paper';

  // Fetch wallet balance (30s cached, non-blocking on failure)
  let walletBalance: WalletBalanceResult | undefined;
  try {
    walletBalance = await getPMWalletBalance();
  } catch {
    // Non-fatal: balance display will show as unavailable
  }

  return {
    timestamp: serverTimestamp,
    ageMs: 0,
    stale,
    feedTimestamp: Number.isFinite(feedTs) ? new Date(feedTs).toISOString() : null,
    feedAgeMs,
    enabled: config.enabled,
    mode: effectiveMode,
    executionStatus,
    statusReason,
    paperModeOnly: false,
    sourceLabel: 'Bybit v2 scalp signals feed (public market data)',
    roadmapTag: executionStatus === 'LIVE' ? 'LIVE mode actief (met server-side guards)' : executionStatus === 'BLOCKED' ? 'LIVE request geblokkeerd — fallback naar PAPER' : 'PAPER mode actief',
    walletBalance: walletBalance || undefined,
    events: config.events.map((ev) => {
      const open = bets.find((b) => b.status === 'open' && b.marketKey === ev.marketKey);
      const latestDecision = decisions.find((d) => d.marketKey === ev.marketKey);
      const countdownSec = open ? Math.max(0, Math.round((new Date(open.settleAt).getTime() - Date.now()) / 1000)) : 0;
      return {
        symbol: ev.symbol,
        marketKey: ev.marketKey,
        tokenId: open?.liveTokenId || null, // Show token from active live bet if any
        label: ev.label,
        enabled: ev.enabled,
        suggestedSide: latestDecision?.side || 'NONE',
        confidence: latestDecision?.confidence || 0,
        reason: latestDecision?.reason || 'Waiting for strategy trigger (sniper/oracle-lead/momentum).',
        countdownSec,
        activeBetId: open?.id,
      };
    }),
    stats,
  };
}

export async function getPMOpenBets(): Promise<PMPaperBet[]> {
  return (await getPMBets()).filter((b) => b.status === 'open').sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export async function getPMHistory(limit = 100): Promise<PMPaperBet[]> {
  return (await getPMBets()).filter((b) => b.status === 'closed').sort((a, b) => b.settledAt!.localeCompare(a.settledAt!)).slice(0, limit);
}

export async function getPMStats(): Promise<PMStats> {
  return getStats(await getPMBets());
}

function inferSymbolFromText(input: string): string {
  const txt = input.toLowerCase();
  const table: Array<[string, string]> = [
    ['btc', 'BTC/USDT'], ['bitcoin', 'BTC/USDT'],
    ['eth', 'ETH/USDT'], ['ethereum', 'ETH/USDT'],
    ['sol', 'SOL/USDT'], ['solana', 'SOL/USDT'],
    ['xrp', 'XRP/USDT'], ['doge', 'DOGE/USDT'], ['bnb', 'BNB/USDT'], ['avax', 'AVAX/USDT'],
    ['link', 'LINK/USDT'], ['dot', 'DOT/USDT'], ['sui', 'SUI/USDT'], ['arb', 'ARB/USDT'], ['op ', 'OP/USDT'],
  ];
  for (const [needle, symbol] of table) {
    if (txt.includes(needle)) return symbol;
  }
  return 'CRYPTO/USDT';
}

function inferTimeframeMinutes(input: string): number {
  const txt = input.toLowerCase();
  const found = TIMEFRAME_HINTS.find((x) => x.hints.some((h) => txt.includes(h)));
  return found?.timeframeMinutes ?? 60;
}

function toMarketKey(slug?: string, symbol = 'CRYPTO/USDT', timeframeMinutes = 60): string {
  const base = (slug || symbol || 'market')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `PM-${base}-${timeframeMinutes}M-UPDOWN`;
}

function normalizeGammaMarket(raw: any): PMSuggestedMarket | null {
  const question = String(raw?.question ?? raw?.title ?? '').trim();
  const slug = String(raw?.slug ?? raw?.market_slug ?? '').trim() || undefined;
  const id = String(raw?.id ?? raw?.market_id ?? slug ?? '').trim();
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.map((t: any) => String(typeof t === 'string' ? t : (t?.label || t?.slug || t?.name || '')).toLowerCase()).filter(Boolean)
    : [];

  if (!id || !question) return null;

  const lowerText = `${question} ${slug || ''} ${tags.join(' ')}`.toLowerCase();
  const hasUpDownIntent = /up|down|higher|lower|above|below/.test(lowerText);
  const isCrypto = CRYPTO_DISCOVERY_KEYWORDS.some((k) => lowerText.includes(k));
  if (!hasUpDownIntent || !isCrypto) return null;

  const symbol = inferSymbolFromText(lowerText);
  const timeframeMinutes = inferTimeframeMinutes(lowerText);
  const marketKey = toMarketKey(slug, symbol, timeframeMinutes);

  const volumeNum = Number(raw?.volumeNum ?? raw?.volume ?? raw?.liquidityNum ?? 0);

  return {
    id,
    marketKey,
    label: question,
    symbol,
    timeframeMinutes,
    slug,
    question,
    tags,
    volumeNum: Number.isFinite(volumeNum) && volumeNum > 0 ? volumeNum : undefined,
  };
}

async function fetchGammaWithTimeout(url: string, timeoutMs = 9000): Promise<any[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.markets)) return payload.markets;
    if (Array.isArray(payload?.data)) return payload.data;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverPMSuggestedMarkets(): Promise<PMSuggestedMarket[]> {
  const urls = [
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=300',
    'https://gamma-api.polymarket.com/events?closed=false&limit=200',
  ];

  const responses = await Promise.all(urls.map((u) => fetchGammaWithTimeout(u)));
  const mergedRaw = responses.flatMap((r) => r || []);

  const normalized = mergedRaw
    .map((x) => normalizeGammaMarket(x))
    .filter((x): x is PMSuggestedMarket => !!x)
    .filter((m) => !(m.timeframeMinutes === 5 && ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'].includes(m.symbol)));

  const dedup = new Map<string, PMSuggestedMarket>();
  for (const m of normalized) {
    const key = `${m.slug || ''}|${m.label}|${m.timeframeMinutes}`.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, m);
  }

  return [...dedup.values()]
    .sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))
    .slice(0, 40);
}

// Compatibility shim for existing v2 trade route hooks.
// PM bot is now standalone: this no longer gates scalp/swing/grid execution.
export async function evaluatePMDecision(input: {
  mode: PMMode;
  symbol: string;
  action: 'LONG' | 'SHORT';
  confidence?: number;
  intentType: 'signal' | 'manualEntry' | 'manualEntryFromQueue';
  executionHealthScore?: number;
}): Promise<{
  id: string;
  timestamp: string;
  mode: PMMode;
  intentType: 'signal' | 'manualEntry' | 'manualEntryFromQueue';
  symbol: string;
  action: 'LONG' | 'SHORT';
  allow: true;
  reasonCode: 'PM_STANDALONE_NO_GATING';
  shadowOnly: true;
  enforced: false;
}> {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    mode: input.mode,
    intentType: input.intentType,
    symbol: input.symbol,
    action: input.action,
    allow: true,
    reasonCode: 'PM_STANDALONE_NO_GATING',
    shadowOnly: true,
    enforced: false,
  };
}
