import { BitcoinTicker } from "@/components/home/bitcoin-ticker";
import { WeatherWidget } from "@/components/home/weather-widget";
import { DailyPnLCard } from "@/components/home/daily-pnl";
import { TotalRevenueCard } from "@/components/home/total-revenue-card";
import { BavoNewsCard } from "@/components/home/bavo-news-card";
import { EmailWidget } from "@/components/home/email-widget";
import { DeadlinesWidget } from "@/components/home/deadlines-widget";
import { ActiveAgentsCard } from "@/components/home/active-agents-card";
import { OpenTasksCard } from "@/components/home/open-tasks-card";
import { OpenFacturenCard } from "@/components/home/open-facturen-card";

export default function Home() {
  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-fade-in-up">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-white via-indigo-200 to-white/60 bg-clip-text text-transparent">
              Dashboard
            </span>
          </h1>
          <p className="text-white/50 mt-1">Welkom terug. Hier is je overzicht.</p>
        </div>

        {/* Quick Stats - Row 1 */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="animate-stagger-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
            <ActiveAgentsCard />
          </div>
          <div className="animate-stagger-in" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
            <OpenTasksCard />
          </div>
          <div className="animate-stagger-in" style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}>
            <OpenFacturenCard />
          </div>
          <div className="animate-stagger-in" style={{ animationDelay: '320ms', animationFillMode: 'backwards' }}>
            <TotalRevenueCard />
          </div>
        </div>

        {/* Row 2: BTC + Weather (compact) */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="animate-stagger-in" style={{ animationDelay: '400ms', animationFillMode: 'backwards' }}>
            <BitcoinTicker compact />
          </div>
          <div className="animate-stagger-in" style={{ animationDelay: '480ms', animationFillMode: 'backwards' }}>
            <WeatherWidget compact />
          </div>
        </div>

        {/* Row 3: Emails + Deadlines */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="animate-stagger-in" style={{ animationDelay: '560ms', animationFillMode: 'backwards' }}>
            <EmailWidget />
          </div>
          <div className="animate-stagger-in" style={{ animationDelay: '640ms', animationFillMode: 'backwards' }}>
            <DeadlinesWidget />
          </div>
        </div>

        {/* Row 4: News + Daily PnL */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="animate-stagger-in" style={{ animationDelay: '720ms', animationFillMode: 'backwards' }}>
            <BavoNewsCard />
          </div>
          <div className="animate-stagger-in" style={{ animationDelay: '800ms', animationFillMode: 'backwards' }}>
            <DailyPnLCard />
          </div>
        </div>
      </div>
    </main>
  );
}
