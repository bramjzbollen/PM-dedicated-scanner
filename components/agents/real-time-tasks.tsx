'use client';

import { useEffect, useState, useCallback } from 'react';
import { TaskList } from './task-list';
import type { AgentTask } from '@/lib/types';
import { getMockTasks } from '@/lib/agent-data';

// Toast notification for task actions
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

export function RealTimeTasks() {
  const [tasks, setTasks] = useState<AgentTask[]>(getMockTasks());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Simulate progress updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prev => prev.map(task => {
        if (task.status !== 'in_progress') return task;
        
        const newProgress = Math.min(100, task.progress + Math.random() * 5);
        const isCompleted = newProgress >= 100;
        
        return {
          ...task,
          progress: newProgress,
          status: isCompleted ? 'completed' as const : task.status,
          completedAt: isCompleted ? new Date() : task.completedAt,
          eta: isCompleted ? undefined : task.eta,
        };
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Handle task cancellation
  const handleCancelTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    try {
      const res = await fetch('/api/agents/tasks/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          sessionKey: task.sessionKey,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Update task state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? {
                ...t,
                status: 'cancelled' as const,
                cancelledAt: new Date(),
                eta: undefined,
              }
            : t
        ));
        setToast({ message: `"${task.title}" cancelled`, type: 'success' });
      } else {
        setToast({ message: data.error || 'Failed to cancel task', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: 'Network error: ' + (err.message || 'unknown'), type: 'error' });
    }
  }, [tasks]);

  return (
    <>
      <TaskList tasks={tasks} onCancelTask={handleCancelTask} />
      {toast && (
        <TaskToast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
