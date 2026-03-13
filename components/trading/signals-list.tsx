import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TradingSignal } from "@/lib/types";

interface SignalsListProps {
  signals: TradingSignal[];
}

export function SignalsList({ signals }: SignalsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Trading Signals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {signals.length === 0 ? (
            <p className="text-sm text-white/40 text-center">
              No signals detected
            </p>
          ) : (
            signals.map((signal) => (
              <div key={signal.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all duration-200 hover:bg-white/[0.05]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white/90">
                      {signal.symbol.replace('USDT', '')}
                    </p>
                    <Badge className={signal.type === 'LONG'
                      ? 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]'
                      : 'bg-red-500/[0.12] text-red-400 border-red-500/[0.15]'
                    }>
                      {signal.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-white/40">
                    K: {signal.stochRSI_K} | D: {signal.stochRSI_D}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white/90">
                    ${signal.price.toLocaleString()}
                  </p>
                  <p className="text-xs text-white/40">
                    Strength: {signal.strength}%
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
