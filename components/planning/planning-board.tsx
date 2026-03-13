'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TaskCard } from './task-card';
import { TaskEditModal } from './task-edit-modal';
import type { PlanningTask } from '@/lib/types';
import { loadTasks, saveTasks, fetchAppleReminders, mergeTasks } from '@/lib/planning-data';
import { cn } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faTableColumns,
  faList,
  faGlobe,
  faHouse,
  faBriefcase,
  faFolder,
  faClipboard,
  faSpinner,
  faCircleCheck,
  faBan,
  faRotate,
} from '@fortawesome/free-solid-svg-icons';

type ViewMode = 'kanban' | 'list';
type CategoryFilter = 'all' | PlanningTask['category'];
type SortBy = 'deadline' | 'progress' | 'updated';

const columns: { status: PlanningTask['status']; label: string; icon: any; borderColor: string; glowColor: string }[] = [
  { status: 'todo', label: 'Todo', icon: faClipboard, borderColor: 'border-t-amber-500/50', glowColor: 'shadow-[0_-2px_12px_rgba(245,158,11,0.15)]' },
  { status: 'in-progress', label: 'In Progress', icon: faSpinner, borderColor: 'border-t-blue-500/50', glowColor: 'shadow-[0_-2px_12px_rgba(59,130,246,0.15)]' },
  { status: 'done', label: 'Done', icon: faCircleCheck, borderColor: 'border-t-emerald-500/50', glowColor: 'shadow-[0_-2px_12px_rgba(34,197,94,0.15)]' },
  { status: 'blocked', label: 'Blocked', icon: faBan, borderColor: 'border-t-red-500/50', glowColor: 'shadow-[0_-2px_12px_rgba(239,68,68,0.15)]' },
];

export function PlanningBoard() {
  const [tasks, setTasks] = useState<PlanningTask[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('deadline');
  const [editingTask, setEditingTask] = useState<PlanningTask | null>(null);
  const [isNewTask, setIsNewTask] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const loadedTasks = loadTasks();
    setTasks(loadedTasks);
    setMounted(true);

    // Sync to file
    if (loadedTasks.length > 0) {
      fetch('/api/planning-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadedTasks),
      }).catch(() => {});
    }

    // Fetch Apple Reminders and merge
    fetchAppleReminders().then(appleTasks => {
      if (appleTasks.length > 0) {
        const merged = mergeTasks(loadedTasks, appleTasks);
        setTasks(merged);
        saveTasks(merged);
      }
    });
  }, []);

  const syncAppleReminders = useCallback(async () => {
    setSyncing(true);
    try {
      const appleTasks = await fetchAppleReminders();
      const currentLocal = loadTasks();
      const merged = mergeTasks(currentLocal, appleTasks);
      setTasks(merged);
      saveTasks(merged);
    } finally {
      setSyncing(false);
    }
  }, []);

  const save = useCallback((newTasks: PlanningTask[]) => {
    setTasks(newTasks);
    saveTasks(newTasks);
  }, []);

  const handleSave = (task: PlanningTask) => {
    const existing = tasks.find(t => t.id === task.id);
    if (existing) {
      save(tasks.map(t => t.id === task.id ? task : t));
    } else {
      save([...tasks, task]);
    }
    setEditingTask(null);
    setIsNewTask(false);
  };

  const handleDelete = (id: string) => {
    save(tasks.filter(t => t.id !== id));
  };

  const handleStatusChange = (id: string, status: PlanningTask['status']) => {
    save(tasks.map(t => t.id === id ? {
      ...t,
      status,
      progress: status === 'done' ? 100 : t.progress,
      updatedAt: new Date().toISOString(),
    } : t));
  };

  const filteredTasks = tasks
    .filter(t => categoryFilter === 'all' || t.category === categoryFilter)
    .sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sortBy === 'progress') return b.progress - a.progress;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  if (!mounted) {
    return (
      <div className="space-y-4">
        <div className="h-10 rounded-xl shimmer" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-64 rounded-2xl shimmer" />)}
        </div>
      </div>
    );
  }

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
        <Button
          size="sm"
          onClick={() => {
            setEditingTask(null);
            setIsNewTask(true);
          }}
        >
          <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5 mr-1.5" />
          Nieuwe Taak
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={syncAppleReminders}
          disabled={syncing}
          className="text-xs"
        >
          <FontAwesomeIcon icon={faRotate} className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
          {syncing ? 'Syncing...' : 'Sync Reminders'}
        </Button>

        <div className="flex gap-1 ml-2">
          <Button
            size="sm"
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('kanban')}
          >
            <FontAwesomeIcon icon={faTableColumns} className="h-3.5 w-3.5 mr-1.5" />
            Kanban
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('list')}
          >
            <FontAwesomeIcon icon={faList} className="h-3.5 w-3.5 mr-1.5" />
            Lijst
          </Button>
        </div>

        <div className="flex gap-1 ml-auto">
          {(['all', 'prive', 'planb-task', 'planb-project'] as const).map((cat) => {
            const catIcons = {
              all: faGlobe,
              prive: faHouse,
              'planb-task': faBriefcase,
              'planb-project': faFolder,
            };
            const catLabels = {
              all: 'Alles',
              prive: 'Priv\u00e9',
              'planb-task': 'Taken',
              'planb-project': 'Projecten',
            };
            return (
              <Button
                key={cat}
                size="sm"
                variant={categoryFilter === cat ? 'secondary' : 'ghost'}
                onClick={() => setCategoryFilter(cat)}
                className="text-xs"
              >
                <FontAwesomeIcon icon={catIcons[cat]} className="h-3 w-3 mr-1.5" />
                {catLabels[cat]}
              </Button>
            );
          })}
        </div>

        <select
          className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 backdrop-blur-xl"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
        >
          <option value="deadline">Sorteer: Deadline</option>
          <option value="progress">Sorteer: Voortgang</option>
          <option value="updated">Sorteer: Recent</option>
        </select>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-sm">
        <Badge variant="outline">Totaal: {stats.total}</Badge>
        <Badge className="bg-amber-500/[0.12] text-amber-400 border-amber-500/[0.15]">Todo: {stats.todo}</Badge>
        <Badge className="bg-blue-500/[0.12] text-blue-400 border-blue-500/[0.15]">In Progress: {stats.inProgress}</Badge>
        <Badge className="bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/[0.15]">Done: {stats.done}</Badge>
        {stats.blocked > 0 && <Badge className="bg-red-500/[0.12] text-red-400 border-red-500/[0.15]">Blocked: {stats.blocked}</Badge>}
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {columns.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.status);
            return (
              <div key={col.status} className={cn(
                'rounded-2xl p-4 border-t-2 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06]',
                col.borderColor, col.glowColor
              )}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm text-white/80 flex items-center gap-2">
                    <FontAwesomeIcon icon={col.icon} className="h-3.5 w-3.5" />
                    {col.label}
                  </h3>
                  <Badge variant="outline" className="text-xs">{colTasks.length}</Badge>
                </div>
                <div className="space-y-3">
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={setEditingTask}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-white/30 text-center py-8">Geen taken</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={setEditingTask}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
          {filteredTasks.length === 0 && (
            <p className="text-center text-white/40 py-8">Geen taken gevonden</p>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {(editingTask || isNewTask) && (
        <TaskEditModal
          task={editingTask}
          isNew={isNewTask}
          onSave={handleSave}
          onClose={() => {
            setEditingTask(null);
            setIsNewTask(false);
          }}
        />
      )}
    </div>
  );
}

