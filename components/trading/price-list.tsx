import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CryptoPrice } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PriceListProps {
  prices: CryptoPrice[];
}

export function PriceList({ prices }: PriceListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Live Prices</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {prices.map((price) => (
            <div key={price.symbol} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] transition-all duration-200 hover:bg-white/[0.04]">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none text-white/90">
                  {price.symbol.replace('USDT', '')}
                </p>
                <p className="text-xs text-white/40">
                  Vol: ${(price.volume24h / 1e9).toFixed(2)}B
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white/90">
                  ${price.price.toLocaleString()}
                </p>
                <p className={cn(
                  "text-xs font-medium",
                  price.change24h >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
