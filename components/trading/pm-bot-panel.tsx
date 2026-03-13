'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PMEventConfig = {
  symbol: string;
  marketKey: string;
  label: string;
  timeframeMinutes: number;
  enabled: boolean;
};

type PMConfig = {
  enabled: boolean;
  mode: 'paper' | 'live';
  paperBetSizeUsd: number;
  maxOpenBets: number;
  confidenceThreshold: number;
  maxDailyLossUsd: number;
  events: PMEventConfig[];
};

type PMRuntime = {
  timestamp: string;
  ageMs: number;
  stale: boolean;
  feedTimestamp: string | null;
  feedAgeMs: number | null;
  enabled: boolean;
  mode: 'paper' | 'live';
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
  stats: {
    openBets: number;
    closedBets: number;
    wins: number;
    losses: number;
    winRatePct: number;
    totalPnlUsd: number;
    todayPnlUsd: number;
  };
};

type PMBet = {
  id: string;
  marketKey: string;
  pair: string;
  side: 'UP' | 'DOWN';
  sizeUsd: number;
  confidence: number;
  reason: string;
  entryOdds: number;
  entryPrice: number;
  openedAt: string;
  settleAt: string;
  status: 'open' | 'closed';
  exit?: 'WIN' | 'LOSS';
  exitPrice?: number;
  pnlUsd?: number;
  settledAt?: string;
};

type PMDecision = {
  id: string;
  marketKey: string;
  side: 'UP' | 'DOWN';
  confidence: number;
  timestamp: string;
};

type SuggestedMarket = {
  id: string;
  marketKey: string;
  label: string;
  symbol: string;
  timeframeMinutes: number;
  slug?: string;
  question?: string;
  tags: string[];
  volumeNum?: number;
};

type PreflightState = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NEEDS_CONFIG' | 'BLOCKED' | 'STUB';

type PMPreflight = {
  timestamp: string;
  mode: 'paper' | 'live';
  liveOrdersEnabled: boolean;
  paperOnlyLock?: boolean;
  overallState: PreflightState;
  readinessScorePct?: number;
  selectedMarket: {
    input: string | null;
    resolved: string | null;
  };
  checks: Array<{
    key: string;
    label: string;
    state: PreflightState;
    detail: string;
    liveVerified: boolean;
  }>;
};

const BAG_PRESETS = [5, 10, 15, 25, 50];

type PMCollapsibleSection = 'settings' | 'preflight' | 'history';

type PMCollapsedState = Record<PMCollapsibleSection, boolean>;

const PM_COLLAPSE_STORAGE_KEY = 'pm-bot:collapsed-sections:v1';
const DEFAULT_COLLAPSED_STATE: PMCollapsedState = {
  settings: false,
  preflight: true,
  history: true,
};

function parseCustomBagValue(raw: string): { value?: number; error?: string } {
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: 'Voer een geldig getal in.' };
  if (n < 1) return { error: 'Minimale bag size is $1.' };
  if (n > 5000) return { error: 'Maximale bag size is $5000.' };
  return { value: Math.round(n * 100) / 100 };
}

function formatTimeframe(minutes: number): string {
  if (minutes >= 240 && minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCompactCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(safe / 60).toString().padStart(2, '0');
  const ss = (safe % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function getBetTimer(settleAt?: string, nowMs = Date.now()): {
  status: 'COUNTDOWN' | 'OVERDUE' | 'MISSING';
  label: string;
  className: string;
} {
  if (!settleAt) {
    return {
      status: 'MISSING',
      label: 'Geen expiry timestamp',
      className: 'border-white/20 text-white/60',
    };
  }

  const settleMs = new Date(settleAt).getTime();
  if (!Number.isFinite(settleMs)) {
    return {
      status: 'MISSING',
      label: 'Ongeldige expiry timestamp',
      className: 'border-white/20 text-white/60',
    };
  }

  const diffSec = Math.floor((settleMs - nowMs) / 1000);
  if (diffSec >= 0) {
    return {
      status: 'COUNTDOWN',
      label: formatCompactCountdown(diffSec),
      className: diffSec <= 120 ? 'border-amber-500/40 text-amber-200' : 'border-cyan-500/35 text-cyan-200',
    };
  }

  return {
    status: 'OVERDUE',
    label: `OVERDUE +${formatCompactCountdown(Math.abs(diffSec))}`,
    className: 'border-rose-500/40 text-rose-200 bg-rose-500/10',
  };
}

function stateBadgeClass(state: PreflightState): string {
  switch (state) {
    case 'PASS':
      return 'border-emerald-500/35 text-emerald-200';
    case 'FAIL':
      return 'border-rose-500/35 text-rose-200';
    case 'BLOCKED':
      return 'border-rose-500/40 text-rose-200 bg-rose-500/10';
    case 'NEEDS_CONFIG':
      return 'border-amber-500/35 text-amber-200';
    case 'STUB':
      return 'border-violet-500/35 text-violet-200';
    default:
      return 'border-white/20 text-white/70';
  }
}

function EventSparkline({ points }: { points?: number[] }) {
  if (!points || points.length < 2) {
    return (
      <div className="h-10 rounded-md border border-dashed border-white/10 bg-white/[0.02] text-[10px] text-white/35 flex items-center justify-center">
        Geen trenddata
      </div>
    );
  }

  const width = 140;
  const height = 36;
  const min = Math.min(...points, -100);
  const max = Math.max(...points, 100);
  const range = Math.max(max - min, 1);

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const latest = points[points.length - 1];
  const stroke = latest >= 0 ? '#34d399' : '#f87171';

  return (
    <div className="h-10 rounded-md border border-white/10 bg-white/[0.02] px-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
        <polyline fill="none" stroke={stroke} strokeWidth="2" points={coords.join(' ')} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function PMBotPanel() {
  const [config, setConfig] = useState<PMConfig | null>(null);
  const [baselineConfig, setBaselineConfig] = useState<PMConfig | null>(null);
  const [runtime, setRuntime] = useState<PMRuntime | null>(null);
  const [openBets, setOpenBets] = useState<PMBet[]>([]);
  const [history, setHistory] = useState<PMBet[]>([]);
  const [saving, setSaving] = useState(false);

  const [customBagValue, setCustomBagValue] = useState('');
  const [bagError, setBagError] = useState<string | null>(null);

  const [suggestedMarkets, setSuggestedMarkets] = useState<SuggestedMarket[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [suggestedError, setSuggestedError] = useState<string | null>(null);
  const [selectedSuggested, setSelectedSuggested] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<PMDecision[]>([]);
  const [preflight, setPreflight] = useState<PMPreflight | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [collapsedSections, setCollapsedSections] = useState<PMCollapsedState>(DEFAULT_COLLAPSED_STATE);

  const loadSuggestedMarkets = async () => {
    setLoadingSuggested(true);
    setSuggestedError(null);
    try {
      const res = await fetch('/api/pm-bot/suggested-markets', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load suggested markets');
      setSuggestedMarkets(Array.isArray(data?.markets) ? data.markets : []);
    } catch (err: any) {
      setSuggestedError(err?.message || 'Kon suggesties niet laden.');
    } finally {
      setLoadingSuggested(false);
    }
  };

  const load = async (options?: { skipConfigUpdate?: boolean }) => {
    const [cfg, st, open, closed, dec, pfRes] = await Promise.all([
      fetch('/api/pm-bot/config', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/pm-bot/state', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/pm-bot/bets?status=open', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/pm-bot/bets?status=closed&limit=40', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/pm-bot/decisions', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/pm-bot/preflight', { cache: 'no-store' }),
    ]);

    const pf = await pfRes.json();

    if (!options?.skipConfigUpdate) {
      setConfig(cfg);
      setBaselineConfig(JSON.parse(JSON.stringify(cfg)));
      setCustomBagValue(String(cfg?.paperBetSizeUsd ?? ''));
      setBagError(null);
    }
    setRuntime(st);
    setOpenBets(Array.isArray(open) ? open : []);
    setHistory(Array.isArray(closed) ? closed : []);
    setDecisions(Array.isArray(dec) ? dec : []);
    if (pfRes.ok) {
      setPreflight(pf as PMPreflight);
      setPreflightError(null);
    } else {
      setPreflight(null);
      setPreflightError(pf?.error || 'Kon live readiness preflight niet laden.');
    }
  };

  useEffect(() => {
    load();
    loadSuggestedMarkets();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const hasDraft = !!config && !!baselineConfig && JSON.stringify(config) !== JSON.stringify(baselineConfig);
      load({ skipConfigUpdate: hasDraft });
    }, 1500);

    return () => clearInterval(id);
  }, [config, baselineConfig]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pm-bot/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        throw new Error('Kon PM config niet opslaan.');
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const applyCustomBag = () => {
    if (!config) return;
    const parsed = parseCustomBagValue(customBagValue);
    if (parsed.error) {
      setBagError(parsed.error);
      return;
    }
    setBagError(null);
    setConfig({ ...config, paperBetSizeUsd: parsed.value! });
  };

  const addSelectedToMapping = () => {
    if (!config) return;
    const selected = suggestedMarkets.filter((m) => selectedSuggested[m.id]);
    if (selected.length === 0) return;

    const existing = new Set(config.events.map((e) => e.marketKey));
    const nextEvents = [...config.events];

    for (const m of selected) {
      if (existing.has(m.marketKey)) continue;
      nextEvents.push({
        symbol: m.symbol,
        marketKey: m.marketKey,
        label: m.label,
        timeframeMinutes: m.timeframeMinutes,
        enabled: false,
      });
      existing.add(m.marketKey);
    }

    setConfig({ ...config, events: nextEvents });
  };

  const activeSuggestedCount = useMemo(() => Object.values(selectedSuggested).filter(Boolean).length, [selectedSuggested]);
  const hasUnsavedConfig = useMemo(() => {
    if (!config || !baselineConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(baselineConfig);
  }, [config, baselineConfig]);

  const runtimeAgeMs = Number.isFinite(runtime?.feedAgeMs as number)
    ? Number(runtime?.feedAgeMs)
    : Number(runtime?.ageMs || 0);
  const isRuntimeStale = Boolean(runtime?.stale) || runtimeAgeMs > 3000;
  const executionStatus = runtime?.executionStatus || (runtime?.mode === 'live' ? 'LIVE' : 'PAPER');
  const isBlocked = executionStatus === 'BLOCKED';
  const modeBadgeClass = executionStatus === 'LIVE'
    ? 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10'
    : executionStatus === 'BLOCKED'
      ? 'text-rose-200 border-rose-500/40 bg-rose-500/10'
      : 'text-cyan-200 border-cyan-500/35 bg-cyan-500/10';

  const resetConfig = () => {
    if (!baselineConfig) return;
    const cloned = JSON.parse(JSON.stringify(baselineConfig)) as PMConfig;
    setConfig(cloned);
    setCustomBagValue(String(cloned.paperBetSizeUsd ?? ''));
    setBagError(null);
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PM_COLLAPSE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PMCollapsedState>;
      setCollapsedSections({
        settings: typeof parsed.settings === 'boolean' ? parsed.settings : DEFAULT_COLLAPSED_STATE.settings,
        preflight: typeof parsed.preflight === 'boolean' ? parsed.preflight : DEFAULT_COLLAPSED_STATE.preflight,
        history: typeof parsed.history === 'boolean' ? parsed.history : DEFAULT_COLLAPSED_STATE.history,
      });
    } catch {
      setCollapsedSections(DEFAULT_COLLAPSED_STATE);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PM_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedSections));
    } catch {
      // ignore storage write errors
    }
  }, [collapsedSections]);

  const toggleSection = (section: PMCollapsibleSection) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const decisionSeriesByMarket = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    const sorted = [...decisions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const d of sorted) {
      const signed = d.side === 'UP' ? d.confidence : -d.confidence;
      grouped[d.marketKey] = [...(grouped[d.marketKey] || []), signed].slice(-14);
    }
    return grouped;
  }, [decisions]);

  if (!config || !runtime) {
    return <div className="text-white/50">PM bot laden…</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-violet-500/[0.15]">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white/90">PM Bot</h2>
              <Badge variant="outline" className={runtime.enabled ? 'text-emerald-300 border-emerald-500/30' : 'text-rose-300 border-rose-500/30'}>
                {runtime.enabled ? 'RUNNING' : 'STOPPED'}
              </Badge>
              <Badge variant="outline" className={cn('font-semibold', modeBadgeClass)}>{executionStatus}</Badge>
            </div>
            <Badge variant="outline" className="text-amber-200 border-amber-500/30">{runtime.roadmapTag}</Badge>
          </div>

          <div className={cn('mb-3 rounded-lg border px-2.5 py-2 text-[11px]', isBlocked ? 'border-rose-500/40 bg-rose-500/10 text-rose-100' : executionStatus === 'LIVE' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100')}>
            <span className="font-semibold">{executionStatus}</span> — {runtime.statusReason || 'Geen reden beschikbaar'}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
            <Badge variant="outline" className={cn('border-white/20 text-white/70', isRuntimeStale && 'border-rose-500/40 text-rose-200 bg-rose-500/10')}>
              Data age: {Number.isFinite(runtimeAgeMs) ? `${Math.round(runtimeAgeMs)}ms` : 'unknown'}
            </Badge>
            {isRuntimeStale && (
              <Badge variant="outline" className="border-rose-500/40 text-rose-200 bg-rose-500/10">
                STALE &gt; 3000ms — actions tijdelijk geblokkeerd
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Open Bets</div>
              <div className="text-xl font-bold font-mono text-cyan-300">{runtime.stats?.openBets ?? 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Winrate</div>
              <div className="text-xl font-bold font-mono text-white/90">{(runtime.stats?.winRatePct ?? 0).toFixed(1)}%</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Vandaag PnL</div>
              <div className={cn('text-xl font-bold font-mono', (runtime.stats?.todayPnlUsd ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                ${(runtime.stats?.todayPnlUsd ?? 0).toFixed(2)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-white/30">Bron</div>
              <div className="text-xs text-white/70 line-clamp-2">{runtime.sourceLabel}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-violet-500/[0.14] bg-gradient-to-b from-violet-500/[0.05] to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm text-white/90">Live Auth Preflight v1</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('text-[10px]', preflight?.liveOrdersEnabled ? 'border-emerald-500/35 text-emerald-200 bg-emerald-500/10' : 'border-rose-500/40 text-rose-200 bg-rose-500/10')}>
                {preflight?.liveOrdersEnabled ? 'LIVE ORDERS REQUESTED' : 'PAPER LOCK'}
              </Badge>
              <Badge variant="outline" className={cn('text-[10px]', stateBadgeClass(preflight?.overallState || 'UNKNOWN'))}>
                {preflight?.overallState || 'UNKNOWN'}
              </Badge>
              <button
                type="button"
                onClick={() => toggleSection('preflight')}
                className="h-7 w-7 rounded-md border border-white/15 bg-white/[0.03] text-white/70 hover:text-white/90"
                aria-label={collapsedSections.preflight ? 'Open preflight' : 'Collapse preflight'}
              >
                <span className={cn('inline-block transition-transform', collapsedSections.preflight ? '-rotate-90' : 'rotate-0')}>⌄</span>
              </button>
            </div>
          </div>
          <div className="text-[11px] text-white/55 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            <span>Mode: <span className="text-cyan-200">{(preflight?.mode || 'paper').toUpperCase()}</span></span>
            <span>Live orders: <span className={preflight?.liveOrdersEnabled ? 'text-emerald-200' : 'text-rose-200'}>{preflight?.liveOrdersEnabled ? 'REQUESTED' : 'DISABLED'}</span></span>
            <span>Readiness score: <span className="text-white/90 font-semibold">{preflight?.readinessScorePct ?? 0}%</span></span>
          </div>
        </CardHeader>
        {!collapsedSections.preflight && (
          <CardContent className="space-y-3">
            {preflightError && <div className="text-xs text-rose-300">{preflightError}</div>}
            <div className="space-y-2">
              {(preflight?.checks || []).map((check) => (
                <div key={check.key} className="rounded-lg border border-white/[0.1] bg-white/[0.02] p-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-white/90">{check.label}</div>
                    <div className="text-[11px] text-white/55">{check.detail}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className={cn('text-[10px]', stateBadgeClass(check.state))}>{check.state}</Badge>
                    <span className="text-[10px] text-white/45">{check.liveVerified ? 'live verified' : 'simulated/local'}</span>
                  </div>
                </div>
              ))}
              {!preflight && !preflightError && <div className="text-sm text-white/45">Preflight laden…</div>}
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="border-violet-500/[0.14] bg-gradient-to-b from-violet-500/[0.05] to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm text-white/90">PM bot settings</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('text-[10px]', hasUnsavedConfig ? 'border-amber-500/40 text-amber-200' : 'border-emerald-500/30 text-emerald-200')}>
                {hasUnsavedConfig ? 'UNSAVED CHANGES' : 'SYNCED'}
              </Badge>
              <button
                type="button"
                onClick={() => toggleSection('settings')}
                className="h-7 w-7 rounded-md border border-white/15 bg-white/[0.03] text-white/70 hover:text-white/90"
                aria-label={collapsedSections.settings ? 'Open settings' : 'Collapse settings'}
              >
                <span className={cn('inline-block transition-transform', collapsedSections.settings ? '-rotate-90' : 'rotate-0')}>⌄</span>
              </button>
            </div>
          </div>
        </CardHeader>
        {!collapsedSections.settings && (
          <CardContent className="space-y-4">
          <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Execution mode</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConfig({ ...config, mode: 'paper' })}
                className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold', config.mode === 'paper' ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200' : 'border-white/20 text-white/70')}
              >
                PAPER
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, mode: 'live' })}
                className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold', config.mode === 'live' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-white/20 text-white/70')}
              >
                LIVE (guarded)
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, mode: 'paper' })}
                className="px-3 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/15 text-rose-200 text-xs font-semibold"
              >
                Kill-switch → PAPER
              </button>
            </div>
            <div className="text-[11px] text-white/55">Live wordt alleen geactiveerd als preflight critical checks + freshness (≤3000ms) + geoblock PASS server-side slagen.</div>
          </div>

          <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Position sizing</div>
            <div className="text-xs text-white/60">Bag size selector (paper bet size)</div>
            <div className="flex flex-wrap gap-2">
              {BAG_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setConfig({ ...config, paperBetSizeUsd: preset });
                    setCustomBagValue(String(preset));
                    setBagError(null);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                    config.paperBetSizeUsd === preset
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                      : 'bg-white/[0.03] border-white/[0.08] text-white/70 hover:text-white/90'
                  )}
                >
                  ${preset}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={cn('w-40 bg-black/30 border rounded-lg px-3 py-1.5 text-sm', bagError ? 'border-rose-500/40' : 'border-white/20')}
                type="number"
                min={1}
                max={5000}
                step={0.5}
                value={customBagValue}
                onChange={(e) => setCustomBagValue(e.target.value)}
                onBlur={applyCustomBag}
                placeholder="Custom $"
              />
              <button type="button" onClick={applyCustomBag} className="px-3 py-1.5 rounded-lg text-xs border border-cyan-500/30 bg-cyan-500/15 text-cyan-200">
                Apply
              </button>
              {bagError && <span className="text-xs text-rose-300">{bagError}</span>}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.1] bg-black/20 p-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Risk limits</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <label className="space-y-1">
                <span className="text-white/60">Max open bets</span>
                <input className="w-full bg-black/30 border border-white/20 rounded px-2 py-1" type="number" value={config.maxOpenBets}
                  onChange={(e) => setConfig({ ...config, maxOpenBets: Number(e.target.value) })} />
              </label>
              <label className="space-y-1">
                <span className="text-white/60">Confidence threshold</span>
                <input className="w-full bg-black/30 border border-white/20 rounded px-2 py-1" type="number" value={config.confidenceThreshold}
                  onChange={(e) => setConfig({ ...config, confidenceThreshold: Number(e.target.value) })} />
              </label>
              <label className="space-y-1">
                <span className="text-white/60">Max daily loss ($)</span>
                <input className="w-full bg-black/30 border border-white/20 rounded px-2 py-1" type="number" value={config.maxDailyLossUsd}
                  onChange={(e) => setConfig({ ...config, maxDailyLossUsd: Number(e.target.value) })} />
              </label>
              <label className="flex items-end gap-2 text-white/80 pb-1">
                <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />
                Bot enabled
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-200 text-sm font-medium disabled:opacity-60">
              {saving ? 'Opslaan…' : 'Config opslaan'}
            </button>
            <button type="button" onClick={resetConfig} disabled={!hasUnsavedConfig || saving} className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/15 text-white/75 text-sm disabled:opacity-50">
              Reset
            </button>
          </div>
        </CardContent>
        )}
      </Card>

      <Card className="border-violet-500/[0.1]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm text-white/90">Suggested Markets</CardTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadSuggestedMarkets}
                className="px-3 py-1.5 rounded-lg text-xs border border-cyan-500/30 bg-cyan-500/15 text-cyan-200"
                disabled={loadingSuggested}
              >
                {loadingSuggested ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={addSelectedToMapping}
                className="px-3 py-1.5 rounded-lg text-xs border border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                disabled={activeSuggestedCount === 0 || isRuntimeStale}
              >
                Add selected ({activeSuggestedCount})
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {suggestedError && <div className="text-xs text-rose-300 mb-2">{suggestedError}</div>}
          <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
            {suggestedMarkets.map((m) => (
              <label key={m.id} className="rounded-lg border border-white/[0.1] bg-white/[0.02] p-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={!!selectedSuggested[m.id]}
                  onChange={(e) => setSelectedSuggested((prev) => ({ ...prev, [m.id]: e.target.checked }))}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium">{m.label}</div>
                  <div className="text-[11px] text-white/50 truncate">{m.question || m.slug || m.marketKey}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-200">{formatTimeframe(m.timeframeMinutes)}</Badge>
                    <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-200">{m.symbol}</Badge>
                    {typeof m.volumeNum === 'number' && <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">Vol ${Math.round(m.volumeNum).toLocaleString()}</Badge>}
                  </div>
                </div>
              </label>
            ))}
            {!loadingSuggested && suggestedMarkets.length === 0 && <div className="text-sm text-white/40">Geen extra suggesties gevonden.</div>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/[0.08]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white/90">Event mapping + signal status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(runtime.events || []).map((e) => {
              const cfg = config.events.find((x) => x.marketKey === e.marketKey);
              const timeframe = formatTimeframe(cfg?.timeframeMinutes ?? 60);
              const isOpen = Boolean(e.activeBetId && e.countdownSec > 0);
              const isClosing = isOpen && e.countdownSec <= 120;
              const statusLabel = isOpen ? (isClosing ? 'CLOSING' : 'OPEN') : (e.confidence > 0 ? 'SETTLED' : 'IDLE');
              const statusClass = isOpen
                ? (isClosing ? 'border-amber-500/40 text-amber-200' : 'border-emerald-500/40 text-emerald-200')
                : e.confidence > 0
                  ? 'border-cyan-500/30 text-cyan-200'
                  : 'border-white/20 text-white/60';

              return (
                <div key={e.marketKey} className="rounded-xl border border-white/[0.1] bg-white/[0.02] p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm text-white font-semibold truncate">{e.label}</div>
                      <div className="text-[11px] text-white/55 truncate">{e.symbol} • {timeframe} • {e.marketKey}</div>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px]', statusClass)}>{statusLabel}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className={cn('rounded-md border px-2 py-1.5', e.suggestedSide === 'UP' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200/60')}>
                      YES / UP
                    </div>
                    <div className={cn('rounded-md border px-2 py-1.5 text-right', e.suggestedSide === 'DOWN' ? 'border-rose-500/40 bg-rose-500/15 text-rose-200' : 'border-rose-500/20 bg-rose-500/5 text-rose-200/60')}>
                      NO / DOWN
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] border-violet-500/35 text-violet-200">
                      Side: {e.suggestedSide}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-cyan-500/35 text-cyan-200">
                      {e.confidence}%
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-white/20 text-white/70 max-w-full truncate">
                      {e.reason}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="text-[10px] text-white/55">
                      Countdown: <span className="text-white/85 font-mono">{formatCountdown(e.countdownSec)}</span>
                    </div>
                    <EventSparkline points={decisionSeriesByMarket[e.marketKey]} />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        events: config.events.map((x) => x.marketKey === e.marketKey ? { ...x, enabled: !x.enabled } : x),
                      })}
                      disabled={isRuntimeStale}
                      className={cn(
                        'px-2.5 py-1 rounded-md border text-[11px] transition-colors disabled:opacity-50',
                        cfg?.enabled
                          ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/20 bg-white/[0.03] text-white/70'
                      )}
                    >
                      {cfg?.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        events: config.events.filter((x) => x.marketKey !== e.marketKey),
                      })}
                      disabled={isRuntimeStale}
                      className="px-2.5 py-1 rounded-md border border-rose-500/30 bg-rose-500/15 text-rose-200 text-[11px] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/[0.08]">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-white/90">Open paper bets</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
            {openBets.map((b) => {
              const timer = getBetTimer(b.settleAt, nowMs);
              return (
                <div key={b.id} className="text-xs rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white/70 truncate"><span className="text-white font-medium">{b.pair}</span> • {b.side} • ${b.sizeUsd} • odds {b.entryOdds}</div>
                    <div className="text-[10px] text-white/45">settle {b.settleAt ? new Date(b.settleAt).toLocaleTimeString() : 'n/a'}</div>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-mono shrink-0', timer.className)}>
                    {timer.status === 'COUNTDOWN' ? `T-${timer.label}` : timer.label}
                  </Badge>
                </div>
              );
            })}
            {openBets.length === 0 && <div className="text-white/40 text-sm">Geen open paper bets.</div>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/[0.08]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm text-white/90">Paper betHistory</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">{history.length} items</Badge>
              <button
                type="button"
                onClick={() => toggleSection('history')}
                className="h-7 w-7 rounded-md border border-white/15 bg-white/[0.03] text-white/70 hover:text-white/90"
                aria-label={collapsedSections.history ? 'Open history' : 'Collapse history'}
              >
                <span className={cn('inline-block transition-transform', collapsedSections.history ? '-rotate-90' : 'rotate-0')}>⌄</span>
              </button>
            </div>
          </div>
        </CardHeader>
        {!collapsedSections.history && (
          <CardContent>
            <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
              {history.map((b) => (
                <div key={b.id} className="text-xs rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 flex items-center justify-between gap-2">
                  <div className="text-white/70"><span className="text-white font-medium">{b.pair}</span> {b.side} • {b.exit} • conf {b.confidence}%</div>
                  <div className={b.pnlUsd && b.pnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'}>${(b.pnlUsd || 0).toFixed(2)}</div>
                  <div className="text-white/50">{b.settledAt ? new Date(b.settledAt).toLocaleTimeString() : '-'}</div>
                </div>
              ))}
              {history.length === 0 && <div className="text-white/40 text-sm">Nog geen gesloten bets.</div>}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
