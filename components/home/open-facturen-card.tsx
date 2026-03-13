'use client';

import { useEffect, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillWave } from '@fortawesome/free-solid-svg-icons';

export function OpenFacturenCard() {
  const [total, setTotal] = useState('€0');
  const [loading, setLoading] = useState(true);

  const fetchOpenInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/moneybird');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      
      // Use EXACT same value as Finance tab "Openstaand" KPI
      // This comes from the API's KPI calculation (already computed)
      const outstandingAmount = data.kpis?.outstandingAmount || 0;
      
      // Format as currency (same as Finance tab)
      const formatted = new Intl.NumberFormat('nl-BE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(outstandingAmount);
      
      setTotal(formatted);
    } catch (error) {
      console.error('Failed to load open invoices:', error);
      setTotal('€0');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpenInvoices();
    // Refresh every 60 seconds
    const interval = setInterval(fetchOpenInvoices, 60000);
    return () => clearInterval(interval);
  }, [fetchOpenInvoices]);

  if (loading) {
    return (
      <div className="glass-card-premium gradient-border-card rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-5">
        <div className="h-16 shimmer rounded-xl" />
      </div>
    );
  }

  return (
    <div className="glass-card-premium gradient-border-card rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-1 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">Openstaand</p>
        <div className="p-2.5 rounded-xl bg-white/[0.04] glow-green transition-all duration-300 group-hover:scale-110">
          <FontAwesomeIcon icon={faMoneyBillWave} className="h-4 w-4 text-emerald-400" />
        </div>
      </div>
      <p className="text-3xl font-bold mt-2 tracking-tight text-white/95">
        {total}
      </p>
    </div>
  );
}
