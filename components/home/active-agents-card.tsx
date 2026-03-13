'use client';

import { useEffect, useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot } from '@fortawesome/free-solid-svg-icons';

const POLL_INTERVAL = 30000; // 30s instead of 10s — agent status doesn't change that fast

export function ActiveAgentsCard() {
  const [active, setActive] = useState(0);
  const [total] = useState(7);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const fetchActive = async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const res = await fetch('/api/agents/status', { signal: abortRef.current.signal });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (mountedRef.current) {
          setActive(data.active || 0);
          setLoading(false);
        }
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        if (mountedRef.current) {
          setActive(0);
          setLoading(false);
        }
      }
    };

    fetchActive();
    const interval = setInterval(fetchActive, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

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
        <p className="text-sm text-white/50">Active Agents</p>
        <div className="p-2.5 rounded-xl bg-white/[0.04] glow-blue transition-all duration-300 group-hover:scale-110">
          <FontAwesomeIcon icon={faRobot} className="h-4 w-4 text-indigo-400" />
        </div>
      </div>
      <p className="text-3xl font-bold mt-2 tracking-tight text-white/95">
        {active}/{total}
      </p>
    </div>
  );
}
