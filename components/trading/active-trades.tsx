import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActiveTradesProps {
  trades: Trade[];
}

export function ActiveTrades({ trades }: ActiveTradesProps) {
  const openTrades = trades.filter(t => t.status === 'OPEN');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Trades</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="text-right">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openTrades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No active trades
                </TableCell>
              </TableRow>
            ) : (
              openTrades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-medium">{trade.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={trade.type === 'LONG' ? 'default' : 'secondary'}>
                      {trade.type}
                    </Badge>
                  </TableCell>
                  <TableCell>${trade.entryPrice.toLocaleString()}</TableCell>
                  <TableCell>${trade.currentPrice.toLocaleString()}</TableCell>
                  <TableCell>{trade.quantity} × {trade.leverage}x</TableCell>
                  <TableCell className={cn(
                    "text-right font-semibold",
                    trade.profitLoss >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    ${trade.profitLoss.toFixed(2)} ({trade.profitLossPercent.toFixed(2)}%)
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
