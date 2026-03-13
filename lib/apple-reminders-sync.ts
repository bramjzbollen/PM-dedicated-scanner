import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchAppleReminders } from './apple-reminders';

interface PlanningTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  deadline?: string;
  progress: number;
  category: 'prive' | 'planb-task' | 'planb-project';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  reminderId?: string;
  dueDateTime?: string;
  priority?: number;
  completed?: boolean;
  notes?: string;
  sourceList?: string;
  source?: string;
}

export interface AppleReminderSyncResult {
  success: boolean;
  importedCount: number;
  available: boolean;
  warning?: string;
}

function toCategory(sourceList: string): PlanningTask['category'] {
  return sourceList === 'PRIVÉ to do' ? 'prive' : 'planb-task';
}

function toDeadline(dueDateTime?: string): string | undefined {
  if (!dueDateTime) return undefined;
  const parsed = new Date(dueDateTime);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export async function syncAppleRemindersToPlanningJson(): Promise<AppleReminderSyncResult> {
  const planningPath = path.join(process.cwd(), 'public', 'planning.json');

  const apple = await fetchAppleReminders();

  // Safe fallback: keep existing planning.json untouched if source unavailable.
  if (!apple.available) {
    return {
      success: false,
      importedCount: 0,
      available: false,
      warning: apple.warning,
    };
  }

  let existingTasks: PlanningTask[] = [];
  try {
    const raw = await readFile(planningPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      existingTasks = parsed;
    }
  } catch {
    existingTasks = [];
  }

  const now = new Date().toISOString();

  const appleTasks: PlanningTask[] = apple.reminders.map((r) => ({
    id: `apple-${r.id}`,
    reminderId: r.id,
    title: r.title,
    description: r.notes ?? '',
    status: r.completed ? 'done' : 'todo',
    deadline: toDeadline(r.dueDateTime),
    progress: r.completed ? 100 : 0,
    category: toCategory(r.sourceList),
    tags: ['apple-reminders', r.sourceList === 'PRIVÉ to do' ? 'prive' : 'planb'],
    createdAt: now,
    updatedAt: now,
    dueDateTime: r.dueDateTime,
    priority: r.priority,
    completed: r.completed,
    notes: r.notes,
    sourceList: r.sourceList,
    source: 'apple-reminders',
  }));

  // Keep non-Apple tasks as-is, replace Apple-sourced tasks with fresh import.
  const preservedTasks = existingTasks.filter((t) => t.source !== 'apple-reminders');
  const merged = [...preservedTasks, ...appleTasks];

  await writeFile(planningPath, JSON.stringify(merged, null, 2), 'utf-8');

  return {
    success: true,
    importedCount: appleTasks.length,
    available: true,
  };
}
