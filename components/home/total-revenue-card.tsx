"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine } from "@fortawesome/free-solid-svg-icons";

export function TotalRevenueCard() {
  const [revenue, setRevenue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/moneybird")
      .then((res) => res.json())
      .then((data) => {
        if (data.kpis?.totalRevenueYTD != null) {
          setRevenue(data.kpis.totalRevenueYTD);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatted = revenue != null
    ? `€${revenue >= 1000 ? (revenue / 1000).toFixed(1) + "K" : revenue.toFixed(0)}`
    : "—";

  return (
    <div className="glass-card-premium gradient-border-card rounded-2xl bg-white/[0.04] backdrop-blur-2xl saturate-[180%] border border-white/[0.08] p-5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-1 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[0_16px_48px_0_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">Total Revenue YTD</p>
        <div className="p-2.5 rounded-xl bg-white/[0.04] glow-green transition-all duration-300 group-hover:scale-110">
          <FontAwesomeIcon icon={faChartLine} className="h-4 w-4 text-emerald-400" />
        </div>
      </div>
      <p className={`text-3xl font-bold mt-2 tracking-tight ${loading ? "text-white/30 animate-pulse" : "text-emerald-400"}`}>
        {loading ? "..." : formatted}
      </p>
    </div>
  );
}
