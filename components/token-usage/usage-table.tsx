'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { List } from 'lucide-react';

interface DailyData {
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function ShimmerTable() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 rounded-md bg-white/[0.06] animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface UsageTableProps {
  data: DailyData[] | null;
  loading: boolean;
}

export function UsageTable({ data, loading }: UsageTableProps) {
  if (loading || !data) {
    return <ShimmerTable />;
  }

  // Show last 14 days, most recent first
  const recentData = [...data].reverse().slice(0, 14);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <List className="h-5 w-5 text-cyan-400" />
          Dagelijks Overzicht
          <span className="text-sm font-normal text-white/30 ml-1">laatste 14 dagen</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto custom-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-white/50 text-xs font-medium">Datum</TableHead>
                <TableHead className="text-white/50 text-xs font-medium text-right">Input</TableHead>
                <TableHead className="text-white/50 text-xs font-medium text-right">Output</TableHead>
                <TableHead className="text-white/50 text-xs font-medium text-right">Totaal</TableHead>
                <TableHead className="text-white/50 text-xs font-medium text-right">Kosten</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentData.map((day, idx) => {
                const total = day.inputTokens + day.outputTokens;
                const dateFormatted = new Date(day.date).toLocaleDateString('nl-BE', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                const isToday = idx === 0;

                return (
                  <TableRow
                    key={day.date}
                    className={`border-white/[0.04] transition-colors duration-200 ${
                      isToday
                        ? 'bg-indigo-500/[0.06] hover:bg-indigo-500/[0.1]'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <TableCell className="text-sm text-white/70">
                      {dateFormatted}
                      {isToday && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/[0.15] text-indigo-400 border border-indigo-500/[0.2]">
                          vandaag
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-white/60 text-right font-mono">
                      {formatTokens(day.inputTokens)}
                    </TableCell>
                    <TableCell className="text-sm text-white/60 text-right font-mono">
                      {formatTokens(day.outputTokens)}
                    </TableCell>
                    <TableCell className="text-sm text-white/80 text-right font-mono font-medium">
                      {formatTokens(total)}
                    </TableCell>
                    <TableCell className="text-sm text-emerald-400/80 text-right font-mono font-medium">
                      ${day.costUSD.toFixed(2)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
