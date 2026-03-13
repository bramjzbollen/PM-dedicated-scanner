'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { KPICards } from "@/components/finance/kpi-cards";
import { RevenueChart } from "@/components/finance/revenue-chart";
import { InvoicesTable } from "@/components/finance/invoices-table";
import { EstimatesTable } from "@/components/finance/estimates-table";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faSync, faLock } from '@fortawesome/free-solid-svg-icons';
import type { Estimate, FinanceDashboardResponse, Invoice } from '@/lib/types';

export default function FinancePage() {
  const [data, setData] = useState<FinanceDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceDrafts, setInvoiceDrafts] = useState<Record<string, Invoice['status']>>({});
  const [estimateDrafts, setEstimateDrafts] = useState<Record<string, Estimate['status']>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/moneybird');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kan Moneybird data niet laden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const invoicesWithDrafts = useMemo(() => {
    if (!data?.invoices) return null;
    return data.invoices.map((inv) => ({
      ...inv,
      status: invoiceDrafts[inv.id] ?? inv.status,
      _isDraft: Boolean(invoiceDrafts[inv.id]),
    }));
  }, [data?.invoices, invoiceDrafts]);

  const estimatesWithDrafts = useMemo(() => {
    if (!data?.estimates) return null;
    return data.estimates.map((est) => ({
      ...est,
      status: estimateDrafts[est.id] ?? est.status,
      _isDraft: Boolean(estimateDrafts[est.id]),
    }));
  }, [data?.estimates, estimateDrafts]);

  // P1-6 FIX: Safe status updates — always apply local draft state first,
  // then attempt API call. On failure, keep the local draft with a warning.
  const updateInvoiceStatus = useCallback(async (id: string, status: Invoice['status']) => {
    const key = `invoice:${id}`;
    // Apply local draft immediately for responsive UI
    setInvoiceDrafts((prev) => ({ ...prev, [id]: status }));
    setSavingKey(key);
    try {
      const res = await fetch('/api/moneybird/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'invoice', id, status }),
      });
      if (!res.ok) {
        console.warn(`[Finance] Invoice status update failed (HTTP ${res.status}), kept as local draft`);
      }
    } catch (err) {
      console.warn('[Finance] Invoice status update failed (network), kept as local draft:', err);
    } finally {
      setSavingKey(null);
    }
  }, []);

  const updateEstimateStatus = useCallback(async (id: string, status: Estimate['status']) => {
    const key = `estimate:${id}`;
    // Apply local draft immediately for responsive UI
    setEstimateDrafts((prev) => ({ ...prev, [id]: status }));
    setSavingKey(key);
    try {
      const res = await fetch('/api/moneybird/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'estimate', id, status }),
      });
      if (!res.ok) {
        console.warn(`[Finance] Estimate status update failed (HTTP ${res.status}), kept as local draft`);
      }
    } catch (err) {
      console.warn('[Finance] Estimate status update failed (network), kept as local draft:', err);
    } finally {
      setSavingKey(null);
    }
  }, []);

  return (
    <main className="flex-1 container py-8">
      <div className="space-y-8">
        <div className="animate-fade-in-up flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3 tracking-tight">
              <div className="p-2.5 rounded-xl bg-emerald-500/[0.1] glow-green">
                <FontAwesomeIcon icon={faWallet} className="h-6 w-6 text-emerald-400" />
              </div>
              <span className="bg-gradient-to-r from-white via-emerald-200 to-white/60 bg-clip-text text-transparent">
                Finance
              </span>
              <span className="text-base font-normal text-white/25 ml-1">2026</span>
            </h1>
            <p className="text-white/50 mt-1">
              Omzet, facturen en offertes — Moneybird
              {data?.lastUpdated && (
                <span className="ml-2 text-white/30">
                  · {new Date(data.lastUpdated).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Read-only indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.12] text-amber-400/70 text-xs">
              <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
              Read-only API (draft edits enabled)
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:text-white/90 transition-all duration-300 disabled:opacity-50 text-sm"
            >
              <FontAwesomeIcon
                icon={faSync}
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? 'Laden...' : 'Vernieuwen'}
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && !data && (
          <div className="rounded-2xl bg-red-500/[0.06] backdrop-blur-2xl border border-red-500/[0.15] p-8 text-center">
            <p className="text-red-400 text-lg font-semibold mb-2">⚠️ Fout bij laden</p>
            <p className="text-white/50 text-sm mb-4">{error}</p>
            <button
              onClick={() => fetchData()}
              className="px-4 py-2 rounded-xl bg-red-500/[0.1] border border-red-500/[0.2] text-red-400 hover:bg-red-500/[0.2] transition-all text-sm"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <KPICards data={data?.kpis ?? null} loading={loading} />

        {/* Revenue Chart */}
        <RevenueChart data={data?.monthlyRevenue ?? null} loading={loading} />

        {/* Tables side by side on desktop */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Invoices */}
          <InvoicesTable
            data={invoicesWithDrafts as any}
            loading={loading}
            onStatusChange={updateInvoiceStatus}
            savingKey={savingKey}
          />

          {/* Estimates */}
          <EstimatesTable
            data={estimatesWithDrafts as any}
            loading={loading}
            onStatusChange={updateEstimateStatus}
            savingKey={savingKey}
          />
        </div>
      </div>
    </main>
  );
}
