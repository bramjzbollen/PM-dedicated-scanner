'use client';

import { useEffect, useState } from 'react';
import { LivePricesBar } from "@/components/trading/live-prices-bar";
import { ScalpingAutoTraderV2 } from "@/components/trading/scalping-auto-trader-v2";
import { SwingAutoTraderV2 } from "@/components/trading/swing-auto-trader-v2";
import { GridAutoTrader } from "@/components/trading/grid-auto-trader";
import { PMBotPanel } from "@/components/trading/pm-bot-panel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faArrowTrendUp, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

type TradingTab = 'v2-scalp' | 'v2-swing' | 'v2-grid' | 'pm-bot';

const tabs = [
  { id: 'v2-scalp' as TradingTab, label: '1m Scalp', icon: faArrowTrendUp, color: 'emerald' },
  { id: 'v2-swing' as TradingTab, label: '15m Swing', icon: faArrowTrendUp, color: 'amber' },
  { id: 'v2-grid' as TradingTab, label: 'Grid Bot', icon: faArrowTrendUp, color: 'cyan' },
  { id: 'pm-bot' as TradingTab, label: 'PM bot', icon: faShieldHalved, color: 'violet' },
];

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState<TradingTab>('v2-scalp');
  const [sources, setSources] = useState<{ dataSource: string; executionSource: string; executionMode: string } | null>(null);

  useEffect(() => {
    fetch('/api/trading-sources', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setSources)
      .catch(() => setSources(null));
  }, []);

  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up">
          <h1 className="text-4xl font-bold flex items-center gap-3 tracking-tight">
            <div className="p-2.5 rounded-xl bg-cyan-500/[0.1] glow-cyan">
              <FontAwesomeIcon icon={faChartLine} className="h-6 w-6 text-cyan-400" />
            </div>
            <span className="bg-gradient-to-r from-white via-cyan-200 to-white/60 bg-clip-text text-transparent">
              Auto Trading
            </span>
          </h1>
          <p className="text-white/50 mt-1">Paper trading • EMA/RSI/MACD continuation • Server-synced</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Data source: {sources?.dataSource || 'Bybit MAINNET public market data'}
            </span>
            <span className="px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              Execution source: {sources?.executionSource || 'Paper executor'}
            </span>
          </div>
        </div>

        <div className="animate-stagger-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
          <LivePricesBar />
        </div>

        <div className="animate-stagger-in" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit">
            {tabs.map((tab) => {
              const colorClasses: Record<string, string> = {
                emerald: 'bg-emerald-500/[0.15] text-emerald-400 border border-emerald-500/[0.2]',
                amber: 'bg-amber-500/[0.15] text-amber-400 border border-amber-500/[0.2]',
                cyan: 'bg-cyan-500/[0.15] text-cyan-300 border border-cyan-500/[0.2]',
                violet: 'bg-violet-500/[0.15] text-violet-300 border border-violet-500/[0.2]',
              };
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    activeTab === tab.id
                      ? `${colorClasses[tab.color]} shadow-sm`
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04] border border-transparent'
                  )}
                >
                  <FontAwesomeIcon icon={tab.icon} className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="animate-stagger-in" style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}>
          {activeTab === 'v2-scalp' && <ScalpingAutoTraderV2 key="v2-scalp" />}
          {activeTab === 'v2-swing' && <SwingAutoTraderV2 key="v2-swing" />}
          {activeTab === 'v2-grid' && <GridAutoTrader key="v2-grid" />}
          {activeTab === 'pm-bot' && <PMBotPanel key="pm-bot" />}
        </div>
      </div>
    </main>
  );
}
