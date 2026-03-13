'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentTask } from '@/lib/types';

interface CancelTaskDialogProps {
  task: AgentTask;
  onConfirm: (taskId: string) => Promise<void>;
  onClose: () => void;
}

export function CancelTaskDialog({ task, onConfirm, onClose }: CancelTaskDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(task.id);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={!loading ? onClose : undefined}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-in zoom-in-95 fade-in-0 slide-in-from-bottom-4 duration-200">
        <div className="rounded-2xl border border-red-500/[0.15] bg-[#0f0f14]/95 backdrop-blur-xl shadow-2xl shadow-red-500/[0.05] overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-red-500/[0.12] border border-red-500/[0.15]">
                <span className="text-lg">⚠️</span>
              </div>
              <h3 className="text-lg font-semibold text-white/90">Cancel Task</h3>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              Are you sure you want to cancel{' '}
              <span className="text-white/80 font-medium">&quot;{task.title}&quot;</span>?
            </p>
            {task.agentName && (
              <p className="text-xs text-white/35 mt-1.5">
                Running on agent: <span className="text-white/50">{task.agentName}</span>
              </p>
            )}
            {task.progress > 0 && (
              <div className="mt-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white/40">Current progress</span>
                  <span className="font-medium text-white/60">{Math.round(task.progress)}%</span>
                </div>
                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <p className="text-[10px] text-red-400/70 mt-1.5">
                  This progress will be lost.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="text-white/50 hover:text-white/70"
            >
              Keep Running
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              disabled={loading}
              className={cn(
                'min-w-[100px]',
                loading && 'animate-pulse'
              )}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                  Cancelling...
                </span>
              ) : (
                '🛑 Cancel Task'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
