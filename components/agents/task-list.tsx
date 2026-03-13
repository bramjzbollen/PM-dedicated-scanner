'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelTaskDialog } from "./cancel-task-dialog";
import type { AgentTask } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TaskListProps {
  tasks: AgentTask[];
  onCancelTask?: (taskId: string) => Promise<void>;
}

export function TaskList({ tasks, onCancelTask }: TaskListProps) {
  const [cancellingTask, setCancellingTask] = useState<AgentTask | null>(null);

  const statusColors = {
    pending: 'bg-amber-500/[0.12] text-amber-400 border-amber-500/[0.15]',
    in_progress: 'bg-blue-500/[0.12] text-blue-400 border-blue-500/[0.15]',
    completed: 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]',
    failed: 'bg-red-500/[0.12] text-red-400 border-red-500/[0.15]',
    cancelled: 'bg-orange-500/[0.12] text-orange-400 border-orange-500/[0.15]',
  } as const;

  const statusLabels = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };

  const canCancel = (task: AgentTask) =>
    (task.status === 'in_progress' || task.status === 'pending') && !!onCancelTask;

  const runningCount = tasks.filter(t => t.status === 'in_progress').length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Active Tasks</CardTitle>
            {runningCount > 0 && (
              <Badge className="bg-blue-500/[0.12] text-blue-400 border-blue-500/[0.15]">
                {runningCount} running
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] transition-all duration-200 hover:bg-white/[0.04]",
                  task.status === 'cancelled' && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={cn(
                        "font-medium text-white/90",
                        task.status === 'cancelled' && 'line-through text-white/50'
                      )}>
                        {task.title}
                      </h4>
                      <Badge className={statusColors[task.status]}>
                        {statusLabels[task.status]}
                      </Badge>
                      {task.agentName && (
                        <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">
                          {task.agentName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/45">
                      {task.description}
                    </p>
                  </div>

                  {/* Cancel button */}
                  {canCancel(task) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCancellingTask(task);
                      }}
                      className="shrink-0 ml-3 text-red-400/60 hover:text-red-400 hover:bg-red-500/[0.1] border border-transparent hover:border-red-500/[0.15] transition-all duration-200"
                      title="Cancel this task"
                    >
                      <span className="text-xs">🛑</span>
                      <span className="text-xs font-medium">Cancel</span>
                    </Button>
                  )}
                </div>

                {task.status === 'in_progress' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/40">Progress</span>
                      <span className="font-medium text-white/70">{Math.round(task.progress)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    {task.eta && (
                      <p className="text-xs text-white/40">
                        ETA: {task.eta}
                      </p>
                    )}
                  </div>
                )}

                {task.status === 'cancelled' && task.cancelledAt && (
                  <p className="text-xs text-orange-400/60">
                    Cancelled at {task.cancelledAt.toLocaleTimeString()}
                  </p>
                )}
              </div>
            ))}

            {tasks.length === 0 && (
              <div className="text-center py-8 text-white/30 text-sm">
                No active tasks
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cancel confirmation dialog */}
      {cancellingTask && onCancelTask && (
        <CancelTaskDialog
          task={cancellingTask}
          onConfirm={onCancelTask}
          onClose={() => setCancellingTask(null)}
        />
      )}
    </>
  );
}
