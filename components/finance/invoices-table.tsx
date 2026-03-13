'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/lib/types';

const statusConfig: Record<Invoice['status'], { label: string; emoji: string; color: string }> = {
  paid: { label: 'Betaald', emoji: '✅', color: 'bg-emerald-500/[0.12] text-emerald-400' },
  open: { label: 'Open', emoji: '⏳', color: 'bg-blue-500/[0.12] text-blue-400' },
  overdue: { label: 'Verlopen', emoji: '⚠️', color: 'bg-orange-500/[0.12] text-orange-400' },
  unpaid: { label: 'Onbetaald', emoji: '❌', color: 'bg-red-500/[0.12] text-red-400' },
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
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type StatusFilter = 'all' | Invoice['status'];

interface InvoiceRow extends Invoice {
  _isDraft?: boolean;
}

interface InvoicesTableProps {
  data: InvoiceRow[] | null;
  loading: boolean;
  onStatusChange?: (id: string, status: Invoice['status']) => void;
  savingKey?: string | null;
}

export function InvoicesTable({ data, loading, onStatusChange, savingKey }: InvoicesTableProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  if (loading || !data) {
    return <ShimmerTable />;
  }

  const filtered = data.filter(inv => filter === 'all' || inv.status === filter);
  const totalUnpaid = filtered.filter(i => i.status !== 'paid').reduce((s, i) => s + i.unpaid, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg">📄 Facturen</CardTitle>
        </div>
        <div className="flex gap-1 flex-wrap mt-2">
          {(['all', 'paid', 'open', 'overdue'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'secondary' : 'ghost'}
              className="text-xs h-7"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `Alle (${data.length})` : `${statusConfig[f].emoji} ${statusConfig[f].label}`}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nr</TableHead>
                <TableHead className="text-xs">Klant</TableHead>
                <TableHead className="text-xs text-right">Bedrag</TableHead>
                <TableHead className="text-xs">Verval</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(inv => {
                const status = statusConfig[inv.status];
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs text-white/60">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-sm text-white/80 max-w-[140px] truncate">{inv.client}</TableCell>
                    <TableCell className="text-right font-semibold text-sm text-white/90">
                      {formatEUR(inv.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-white/45">{formatDate(inv.dueDate)}</TableCell>
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
                          value={inv.status}
                          onChange={(e) => onStatusChange?.(inv.id, e.target.value as Invoice['status'])}
                          disabled={!onStatusChange || savingKey === `invoice:${inv.id}`}
                        >
                          {(['paid', 'open', 'overdue', 'unpaid'] as const).map((option) => (
                            <option key={option} value={option} className="bg-[#101117]">
                              {statusConfig[option].label}
                            </option>
                          ))}
                        </select>
                        {inv._isDraft && <span className="text-[10px] text-amber-400/80">draft</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-white/40 py-8">
                    Geen facturen gevonden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalUnpaid > 0 && (
          <div className="mt-3 text-xs text-white/40">
            Totaal openstaand: <span className="text-orange-400/80 font-semibold">{formatEUR(totalUnpaid)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
