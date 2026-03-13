'use client';

import { useEffect, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardList } from '@fortawesome/free-solid-svg-icons';

export function OpenTasksCard() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchOpenTasks = useCallback(async () => {
    try {
      const res = await fetch('/public/planning.json');
      if (!res.ok) throw new Error('Failed to fetch');
      const tasks = await res.json();
      
      // Count tasks that are not done
      const openCount = tasks.filter((t: any) => 
        t.status !== 'done'
      ).length;
      
      setCount(openCount);
    } catch (error) {
      console.error('Failed to load open tasks:', error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpenTasks();
    // Refresh every 30 seconds
    const interval = setInterval(fetchOpenTasks, 30000);
    return () => clearInterval(interval);
  }, [fetchOpenTasks]);

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
        <p className="text-sm text-white/50">Open Tasks</p>
        <div className="p-2.5 rounded-xl bg-white/[0.04] glow-orange transition-all duration-300 group-hover:scale-110">
          <FontAwesomeIcon icon={faClipboardList} className="h-4 w-4 text-amber-400" />
        </div>
      </div>
      <p className="text-3xl font-bold mt-2 tracking-tight text-white/95">
        {count}
      </p>
    </div>
  );
}
