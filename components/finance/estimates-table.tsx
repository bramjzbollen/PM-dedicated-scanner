'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Estimate } from '@/lib/types';

const statusConfig: Record<Estimate['status'], { label: string; emoji: string; color: string }> = {
  sent: { label: 'Verstuurd', emoji: '📧', color: 'bg-blue-500/[0.12] text-blue-400' },
  accepted: { label: 'Geaccepteerd', emoji: '✅', color: 'bg-emerald-500/[0.12] text-emerald-400' },
  rejected: { label: 'Afgewezen', emoji: '❌', color: 'bg-red-500/[0.12] text-red-400' },
  pending: { label: 'Concept', emoji: '📝', color: 'bg-gray-500/[0.12] text-gray-400' },
};

function formatEUR(value: number): string {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function ShimmerTable() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 rounded-md bg-white/[0.06] animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface EstimateRow extends Estimate {
  _isDraft?: boolean;
}

interface EstimatesTableProps {
  data: EstimateRow[] | null;
  loading: boolean;
  onStatusChange?: (id: string, status: Estimate['status']) => void;
  savingKey?: string | null;
}

export function EstimatesTable({ data, loading, onStatusChange, savingKey }: EstimatesTableProps) {
  if (loading || !data) {
    return <ShimmerTable />;
  }

  const totalAccepted = data.filter(e => e.status === 'accepted').reduce((s, e) => s + e.amount, 0);
  const totalPending = data.filter(e => e.status === 'sent' || e.status === 'pending').reduce((s, e) => s + e.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">📝 Offertes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nr</TableHead>
                <TableHead className="text-xs">Klant</TableHead>
                <TableHead className="text-xs text-right">Bedrag</TableHead>
                <TableHead className="text-xs">Datum</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(est => {
                const status = statusConfig[est.status];
                return (
                  <TableRow key={est.id}>
                    <TableCell className="font-mono text-xs text-white/60">{est.estimateNumber}</TableCell>
                    <TableCell className="text-sm text-white/80 max-w-[140px] truncate">{est.client}</TableCell>
                    <TableCell className="text-right font-semibold text-sm text-white/90">
                      {formatEUR(est.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-white/45">{formatDate(est.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'px-2 py-0.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1',
                          status.color
                        )}>
                          {status.emoji} {status.label}
                        </span>
                        <select
                          className="h-7 rounded-md bg-white/[0.03] border border-white/[0.08] px-2 text-xs text-white/70"
                          value={est.status}
                          onChange={(e) => onStatusChange?.(est.id, e.target.value as Estimate['status'])}
                          disabled={!onStatusChange || savingKey === `estimate:${est.id}`}
                        >
                          {(['sent', 'accepted', 'rejected', 'pending'] as const).map((option) => (
                            <option key={option} value={option} className="bg-[#101117]">
                              {statusConfig[option].label}
                            </option>
                          ))}
                        </select>
                        {est._isDraft && <span className="text-[10px] text-amber-400/80">draft</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-white/40 py-8">
                    Geen offertes gevonden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 text-xs text-white/40 flex gap-3">
          <span>Geaccepteerd: <span className="text-emerald-400/80 font-semibold">{formatEUR(totalAccepted)}</span></span>
          <span>·</span>
          <span>In behandeling: <span className="text-blue-400/80 font-semibold">{formatEUR(totalPending)}</span></span>
        </div>
      </CardContent>
    </Card>
  );
}
