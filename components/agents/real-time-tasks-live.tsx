'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { TaskList } from './task-list';
import type { AgentTask } from '@/lib/types';

function TaskToast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl
        backdrop-blur-xl animate-in slide-in-from-bottom-5 fade-in-0 duration-300
        ${type === 'success'
          ? 'bg-emerald-500/[0.12] border-emerald-500/[0.2] text-emerald-400'
          : 'bg-red-500/[0.12] border-red-500/[0.2] text-red-400'
        }`}
    >
      <span className="text-lg">{type === 'success' ? '✅' : '❌'}</span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-white/40 hover:text-white/70 text-xs">✕</button>
    </div>
  );
}

const POLL_INTERVAL = 15000; // 15s instead of 10s
const POLL_INTERVAL_HIDDEN = 60000; // 60s when tab is hidden

export function RealTimeTasksLive() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const visibleRef = useRef(true);

  // Track page visibility
  useEffect(() => {
    const onChange = () => { visibleRef.current = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const fetchTasks = useCallback(async () => {
    // Abort previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/agents/status', { signal: abortRef.current.signal });
      if (!res.ok) throw new Error('Failed to fetch');
      if (!mountedRef.current) return;
      const data = await res.json();
      
      const convertedTasks: AgentTask[] = data.agents
        .filter((a: any) => a.currentTask)
        .map((a: any) => ({
          id: a.sessionKey || a.id,
          title: a.currentTask.title,
          description: `${a.name} (${a.role})`,
          agentId: a.id,
          agentName: a.name,
          status: a.status === 'working' ? 'in_progress' as const : 
                  a.status === 'done' ? 'completed' as const : 
                  a.status === 'blocked' ? 'failed' as const : 
                  'queued' as const,
          progress: a.currentTask.progress || 0,
          priority: 'medium' as const,
          startedAt: a.startedAt ? new Date(a.startedAt) : new Date(),
          eta: a.currentTask.eta,
          sessionKey: a.sessionKey,
          model: a.model,
        }));
      
      if (mountedRef.current) setTasks(convertedTasks);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error('Failed to fetch tasks:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchTasks();

    // Adaptive polling — faster when visible, slower when hidden
    const interval = setInterval(() => {
      if (mountedRef.current) fetchTasks();
    }, visibleRef.current ? POLL_INTERVAL : POLL_INTERVAL_HIDDEN);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchTasks]);

  const handleCancelTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    try {
      const res = await fetch('/api/agents/tasks/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, sessionKey: task.sessionKey }),
      });

      const data = await res.json();

      if (data.success) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: 'cancelled' as const, cancelledAt: new Date(), eta: undefined } : t
        ));
        setToast({ message: `"${task.title}" cancelled`, type: 'success' });
      } else {
        setToast({ message: data.error || 'Failed to cancel task', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: 'Network error: ' + (err.message || 'unknown'), type: 'error' });
    }
  }, [tasks]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl shimmer" />
        ))}
      </div>
    );
  }

  return (
    <>
      <TaskList tasks={tasks} onCancelTask={handleCancelTask} />
      {toast && (
        <TaskToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
