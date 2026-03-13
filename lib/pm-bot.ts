import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { ensureV2ScannerRunning } from '@/lib/v2-scanner-manager';

export type PMExecutionMode = 'paper' | 'live';
export type PMMode = 'v2-scalping' | 'v2-swing' | 'v2-grid';

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
  entryPrice: number;
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
  events: Array<{
    symbol: string;
    marketKey: string;
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

const DATA_DIR = join(process.cwd(), '..', 'trade-state');
const PM_STALE_THRESHOLD_MS = Number(process.env.PM_STALE_THRESHOLD_MS || 12000);
const FALLBACK_DIR = join(process.cwd(), 'public');
const CONFIG_FILE = 'pm-bot-config.json';
const BETS_FILE = 'pm-bot-paper-bets.json';
const DECISIONS_FILE = 'pm-bot-decisions.json';
const LIVE_ORDERS_LOG_FILE = 'pm-bot-live-orders.log';
const BYBIT_FEED_FILE = join(process.cwd(), 'public', 'v2-scalp-signals.json');
const PM_CLOB_HOST = process.env.PM_CLOB_HOST || 'https://clob.polymarket.com';
const PM_CHAIN_ID = Number(process.env.PM_CHAIN_ID || 137);
const PM_LIVE_MIN_BET_USD = Number(process.env.PM_LIVE_MIN_BET_USD || 10);
const PM_LIVE_MAX_BET_USD = Number(process.env.PM_LIVE_MAX_BET_USD || 25);
const PM_LIVE_MAX_CONCURRENT_ORDERS = 2;

const DEFAULT_CONFIG: PMBotConfig = {
  enabled: false,
  mode: 'paper',
  paperBetSizeUsd: 25,
  maxOpenBets: 3,
  confidenceThreshold: 62,
  maxDailyLossUsd: 75,
  events: [
    { symbol: 'BTC/USDT', marketKey: 'PM-BTC-5M-UPDOWN', label: 'BTC 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'ETH/USDT', marketKey: 'PM-ETH-5M-UPDOWN', label: 'ETH 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'SOL/USDT', marketKey: 'PM-SOL-5M-UPDOWN', label: 'SOL 5m Up/Down', timeframeMinutes: 5, enabled: true },
    { symbol: 'BTC/USDT', marketKey: 'PM-BTC-15M-UPDOWN', label: 'BTC 15m Up/Down', timeframeMinutes: 15, enabled: false },
    { symbol: 'ETH/USDT', marketKey: 'PM-ETH-15M-UPDOWN', label: 'ETH 15m Up/Down', timeframeMinutes: 15, enabled: false },
    { symbol: 'SOL/USDT', marketKey: 'PM-SOL-15M-UPDOWN', label: 'SOL 15m Up/Down', timeframeMinutes: 15, enabled: false },
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

function parseTokenMapFromEnv(): Record<string, string> {
  const raw = getEnv('PM_MARKET_TOKEN_MAP', 'POLY_MARKET_TOKEN_MAP');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.trim().length > 0)
        .map(([k, v]) => [k, v.trim()])
    );
  } catch {
    return {};
  }
}

function resolveTokenId(ev: PMEventConfig, tokenMap: Record<string, string>): string | null {
  return ev.tokenId?.trim() || tokenMap[ev.marketKey]?.trim() || null;
}

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

  const signer = new Wallet(privateKey);
  const bootstrapClient = new ClobClient(PM_CLOB_HOST, PM_CHAIN_ID as any, signer as any, undefined, signatureType as any, funder, undefined, true);
  const creds = await bootstrapClient.createOrDeriveApiKey();
  return new ClobClient(PM_CLOB_HOST, PM_CHAIN_ID as any, signer as any, creds, signatureType as any, funder, undefined, true);
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

  const merged: PMBotConfig = {
    ...DEFAULT_CONFIG,
    ...saved,
    mode: normalizeRequestedMode(saved?.mode),
    events: [...baseEvents, ...extraEvents],
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

async function readBybitFeed(): Promise<BybitFeed> {
  try {
    // Ensure the V2 scanner producer is alive whenever PM bot reads feed state.
    ensureV2ScannerRunning();
  } catch {
    // non-fatal; we'll still try to read latest file snapshot
  }

  try {
    return JSON.parse(await readFile(BYBIT_FEED_FILE, 'utf-8')) as BybitFeed;
  } catch {
    return { prices: {}, signals: [] };
  }
}

function buildDecision(symbol: string, marketKey: string, sig: BybitSignal | undefined, price: number): PMDecision {
  const stochK = sig?.indicators?.stochK ?? 50;
  const stochD = sig?.indicators?.stochD ?? 50;
  const atr = sig?.indicators?.atrPercent ?? 0.2;
  const emaTrend = sig?.indicators?.emaTrend ?? price;
  const trendUp = price >= emaTrend;
  const side: 'UP' | 'DOWN' = sig?.signal === 'LONG' ? 'UP' : sig?.signal === 'SHORT' ? 'DOWN' : trendUp ? 'UP' : 'DOWN';

  const base = sig?.confidence ?? 50;
  const momentumBoost = clamp(Math.abs(stochK - stochD) * 0.4, 0, 15);
  const lowVolBoost = clamp((0.35 - atr) * 20, -8, 8);
  const confidence = clamp(Math.round(base + momentumBoost + lowVolBoost), 30, 95);

  const reason = [
    sig?.signal ? `Signal=${sig.signal}` : 'Signal=trend-fallback',
    `Trend=${trendUp ? 'UP' : 'DOWN'} (price ${price.toFixed(4)} vs EMA ${emaTrend.toFixed(4)})`,
    `Momentum Δ=${Math.abs(stochK - stochD).toFixed(1)}`,
    `Volatility ATR=${atr.toFixed(3)}%`,
    sig?.reason ? `Scanner=${sig.reason}` : null,
  ].filter(Boolean).join(' | ');

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    symbol,
    marketKey,
    side,
    confidence,
    reason,
    source: 'bybit-v2-scalp-signals',
  };
}

function calcPnl(sizeUsd: number, entryOdds: number, won: boolean): number {
  // Binary market assumption for paper mode:
  // - WIN: payout = stake * (1/odds - 1)
  // - LOSS: lose full stake
  if (!won) return -sizeUsd;
  const gross = sizeUsd * ((1 / clamp(entryOdds, 0.05, 0.95)) - 1);
  return Number(gross.toFixed(2));
}

async function tryPlaceLiveOrder(params: {
  client: ClobClient;
  event: PMEventConfig;
  decision: PMDecision;
  tokenId: string;
  sizeUsd: number;
  entryPrice: number;
  entryOdds: number;
  settleAt: string;
}): Promise<{ ok: true; orderId: string; status?: string } | { ok: false; error: string; authOrSignature: boolean }> {
  const side = params.decision.side === 'UP' ? Side.BUY : Side.SELL;
  const tickSize = await params.client.getTickSize(params.tokenId);
  const negRisk = await params.client.getNegRisk(params.tokenId);

  try {
    const resp = await params.client.createAndPostOrder(
      {
        tokenID: params.tokenId,
        side,
        price: params.entryOdds,
        size: Number(params.sizeUsd.toFixed(2)),
      },
      { tickSize, negRisk },
      OrderType.GTC
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
  return {
    openBets: openBets.length,
    closedBets: closed.length,
    wins,
    losses,
    winRatePct: closed.length ? (wins / closed.length) * 100 : 0,
    totalPnlUsd: Number(totalPnlUsd.toFixed(2)),
    todayPnlUsd: Number(todayPnlUsd.toFixed(2)),
  };
}

export async function runPMCycle(): Promise<void> {
  const [config, feed, bets, decisions] = await Promise.all([
    getPMConfig(),
    readBybitFeed(),
    getPMBets(),
    getPMDecisions(),
  ]);

  const now = Date.now();
  const bySymbol = new Map((feed.signals || []).map((s) => [s.pair, s]));
  const openBets = bets.filter((b) => b.status === 'open');

  // settle matured bets
  const nextBets = bets.map((b) => {
    if (b.status !== 'open') return b;
    const settleAtMs = new Date(b.settleAt).getTime();
    if (settleAtMs > now) return b;

    const px = feed.prices?.[b.pair];
    if (typeof px !== 'number' || px <= 0) return b;

    const won = b.side === 'UP' ? px > b.entryPrice : px < b.entryPrice;
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
  const tokenMap = parseTokenMapFromEnv();
  const liveBetSizeUsd = clamp(config.paperBetSizeUsd, PM_LIVE_MIN_BET_USD, PM_LIVE_MAX_BET_USD);
  const activeLiveCount = mutable.filter((b) => b.status === 'open' && b.execution === 'live').length;
  let liveSlotsLeft = Math.max(0, PM_LIVE_MAX_CONCURRENT_ORDERS - activeLiveCount);
  let clobClient: ClobClient | null = null;
  let authBroken = false;

  if (config.enabled && stats.todayPnlUsd > -Math.abs(config.maxDailyLossUsd)) {
    for (const ev of config.events) {
      if (!ev.enabled) continue;
      if (mutable.filter((b) => b.status === 'open').length >= config.maxOpenBets) break;
      const hasOpenForEvent = mutable.some((b) => b.status === 'open' && b.marketKey === ev.marketKey);
      if (hasOpenForEvent) continue;

      const sig = bySymbol.get(ev.symbol);
      const price = feed.prices?.[ev.symbol] ?? sig?.indicators?.price;
      if (typeof price !== 'number' || price <= 0) continue;

      const decision = buildDecision(ev.symbol, ev.marketKey, sig, price);
      decisionBuffer = [decision, ...decisionBuffer].slice(0, MAX_DECISIONS);
      if (decision.confidence < config.confidenceThreshold) continue;

      const edge = clamp((decision.confidence - 50) / 100, 0.02, 0.35);
      const entryOdds = Number(clamp(0.5 - edge, 0.12, 0.88).toFixed(3));
      const openedAt = new Date().toISOString();
      const settleAt = new Date(Date.now() + ev.timeframeMinutes * 60_000).toISOString();
      const tokenId = resolveTokenId(ev, tokenMap);

      const baseBet: PMPaperBet = {
        id: `pm-paper-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        marketKey: ev.marketKey,
        pair: ev.symbol,
        side: decision.side,
        sizeUsd: config.paperBetSizeUsd,
        confidence: decision.confidence,
        reason: decision.reason,
        source: 'bybit-v2-scalp-signals',
        entryPrice: Number(price.toFixed(8)),
        entryOdds,
        openedAt,
        settleAt,
        status: 'open',
        execution: 'paper',
      };

      const canAttemptLive = effectiveMode === 'live' && executionStatus === 'LIVE' && !authBroken && liveSlotsLeft > 0 && Boolean(tokenId);
      if (!canAttemptLive) {
        if (effectiveMode === 'live' && !tokenId) {
          baseBet.fallbackReason = 'LIVE requested but tokenId missing; set PM_MARKET_TOKEN_MAP or event.tokenId';
          await appendLiveOrderLog(`[FALLBACK:PAPER] market=${ev.marketKey} reason=${baseBet.fallbackReason}`);
        }
        mutable.unshift(baseBet);
        continue;
      }

      try {
        if (!clobClient) clobClient = await createPMClobClient();
        const liveResult = await tryPlaceLiveOrder({
          client: clobClient,
          event: ev,
          decision,
          tokenId: tokenId!,
          sizeUsd: liveBetSizeUsd,
          entryPrice: Number(price.toFixed(8)),
          entryOdds,
          settleAt,
        });

        if (liveResult.ok) {
          liveSlotsLeft -= 1;
          const liveBet: PMPaperBet = {
            ...baseBet,
            id: `pm-live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            sizeUsd: liveBetSizeUsd,
            execution: 'live',
            liveOrderId: liveResult.orderId,
            liveOrderStatus: liveResult.status,
            liveTokenId: tokenId!,
            reason: `${baseBet.reason} | liveOrder=${liveResult.orderId}`,
          };
          console.log(`[pm-live-order] POSTED market=${ev.marketKey} token=${tokenId} side=${decision.side} size=${liveBetSizeUsd} orderId=${liveResult.orderId}`);
          await appendLiveOrderLog(`[POSTED] market=${ev.marketKey} token=${tokenId} side=${decision.side} sizeUsd=${liveBetSizeUsd} orderId=${liveResult.orderId}`);
          mutable.unshift(liveBet);
          continue;
        }

        if (liveResult.authOrSignature) {
          authBroken = true;
          console.error(`[pm-live-order][AUTH/SIGNATURE] ${liveResult.error}`);
          await appendLiveOrderLog(`[ALERT_AUTH_SIGNATURE] market=${ev.marketKey} token=${tokenId} error=${liveResult.error}`);
        } else {
          console.error(`[pm-live-order][FAIL] market=${ev.marketKey} token=${tokenId} error=${liveResult.error}`);
          await appendLiveOrderLog(`[FAIL] market=${ev.marketKey} token=${tokenId} error=${liveResult.error}`);
        }

        baseBet.fallbackReason = `live order failed: ${liveResult.error}`;
        mutable.unshift(baseBet);
      } catch (error: any) {
        const msg = error?.message || String(error);
        const authErr = isAuthOrSignatureError(msg);
        if (authErr) authBroken = true;
        console.error(`[pm-live-order][EXCEPTION] market=${ev.marketKey} token=${tokenId} error=${msg}`);
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
  const tokenMap = parseTokenMapFromEnv();
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
    events: config.events.map((ev) => {
      const open = bets.find((b) => b.status === 'open' && b.marketKey === ev.marketKey);
      const latestDecision = decisions.find((d) => d.marketKey === ev.marketKey);
      const countdownSec = open ? Math.max(0, Math.round((new Date(open.settleAt).getTime() - Date.now()) / 1000)) : 0;
      return {
        symbol: ev.symbol,
        marketKey: ev.marketKey,
        tokenId: ev.tokenId || tokenMap[ev.marketKey] || null,
        label: ev.label,
        enabled: ev.enabled,
        suggestedSide: latestDecision?.side || 'NONE',
        confidence: latestDecision?.confidence || 0,
        reason: latestDecision?.reason || 'Waiting for Bybit signal.',
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
