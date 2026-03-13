'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlanningTask } from '@/lib/types';

interface TaskCardProps {
  task: PlanningTask;
  onEdit: (task: PlanningTask) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: PlanningTask['status']) => void;
}

const statusColors: Record<PlanningTask['status'], string> = {
  'todo': 'bg-amber-500/[0.12] text-amber-400 border-amber-500/[0.15]',
  'in-progress': 'bg-blue-500/[0.12] text-blue-400 border-blue-500/[0.15]',
  'done': 'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]',
  'blocked': 'bg-red-500/[0.12] text-red-400 border-red-500/[0.15]',
};

const statusLabels: Record<PlanningTask['status'], string> = {
  'todo': '📝 Todo',
  'in-progress': '🔄 In Progress',
  'done': '✅ Done',
  'blocked': '🚫 Blocked',
};

const categoryLabels: Record<PlanningTask['category'], string> = {
  'prive': '🏠 Privé',
  'planb-task': '💼 PLAN B - Taak',
  'planb-project': '📁 PLAN B - Project',
};

function progressColor(progress: number): string {
  if (progress < 25) return 'bg-red-500';
  if (progress < 75) return 'bg-orange-500';
  return 'bg-emerald-500';
}

function daysUntil(deadline?: string): string | null {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d verlopen`;
  if (diff === 0) return 'Vandaag!';
  if (diff === 1) return 'Morgen';
  return `${diff} dagen`;
}

export function TaskCard({ task, onEdit, onDelete, onStatusChange }: TaskCardProps) {
  const countdown = daysUntil(task.deadline);
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';

  return (
    <div
      className={cn(
        'rounded-xl p-4 space-y-3 cursor-pointer transition-all duration-200',
        'bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl',
        'hover:bg-white/[0.06] hover:border-white/[0.12] hover:-translate-y-0.5',
        'shadow-[0_4px_16px_rgba(0,0,0,0.2)]',
        isOverdue && 'border-red-500/[0.3] shadow-[0_0_16px_rgba(239,68,68,0.1)]'
      )}
      onClick={() => onEdit(task)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-tight text-white/90">{task.title}</h3>
        <Badge className={cn('text-xs shrink-0', statusColors[task.status])}>
          {statusLabels[task.status]}
        </Badge>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-white/45 line-clamp-2">{task.description}</p>
      )}

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/45">Voortgang</span>
          <span className="font-semibold text-white/70">{task.progress}%</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', progressColor(task.progress))}
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs">
        <Badge variant="outline" className="text-xs text-white/50">
          {categoryLabels[task.category]}
        </Badge>
        {countdown && (
          <span className={cn('font-medium', isOverdue ? 'text-red-400' : 'text-white/45')}>
            ⏰ {countdown}
          </span>
        )}
      </div>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-white/45 border border-white/[0.06]">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-white/60"
          onClick={() => onEdit(task)}
        >
          ✏️ Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-red-400/70 hover:text-red-400"
          onClick={() => onDelete(task.id)}
        >
          🗑️
        </Button>
        {task.status !== 'done' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs ml-auto text-white/60"
            onClick={() => {
              const next: Record<string, PlanningTask['status']> = {
                'todo': 'in-progress',
                'in-progress': 'done',
                'blocked': 'in-progress',
              };
              onStatusChange(task.id, next[task.status] || 'done');
            }}
          >
            ▶️ Next
          </Button>
        )}
      </div>
    </div>
  );
}
