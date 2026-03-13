import type { PlanningTask } from './types';

const STORAGE_KEY = 'mission-control-planning';

const defaultTasks: PlanningTask[] = [
  {
    id: 'p1',
    title: 'Dashboard uitbreiden',
    description: 'Alle 5 tabs bouwen: Home, Planning, Agents, Trading, Finance',
    status: 'in-progress',
    deadline: '2026-03-15',
    progress: 65,
    category: 'planb-project',
    tags: ['coding', 'priority'],
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-04T16:00:00Z',
  },
  {
    id: 'p2',
    title: 'Moneybird API koppeling',
    description: 'REST API integratie voor facturen en offertes',
    status: 'todo',
    deadline: '2026-03-20',
    progress: 0,
    category: 'planb-task',
    tags: ['api', 'finance'],
    createdAt: '2026-03-04T10:00:00Z',
    updatedAt: '2026-03-04T10:00:00Z',
  },
  {
    id: 'p3',
    title: 'Trading bot optimalisatie',
    description: 'Scalping strategie fine-tunen en backtesten',
    status: 'in-progress',
    deadline: '2026-03-10',
    progress: 80,
    category: 'planb-task',
    tags: ['trading', 'rover'],
    createdAt: '2026-02-28T10:00:00Z',
    updatedAt: '2026-03-04T12:00:00Z',
  },
  {
    id: 'p4',
    title: 'Belastingaangifte voorbereiden',
    description: 'Alle documenten verzamelen voor BTW aangifte Q1',
    status: 'todo',
    deadline: '2026-04-01',
    progress: 10,
    category: 'prive',
    tags: ['admin', 'deadline'],
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'p5',
    title: 'Website PLAN B updaten',
    description: 'Portfolio pagina toevoegen met recente projecten',
    status: 'todo',
    deadline: '2026-03-25',
    progress: 0,
    category: 'planb-project',
    tags: ['website', 'design'],
    createdAt: '2026-03-03T10:00:00Z',
    updatedAt: '2026-03-03T10:00:00Z',
  },
  {
    id: 'p6',
    title: 'Sportschool routine',
    description: '3x per week trainen - schema maken',
    status: 'in-progress',
    deadline: undefined,
    progress: 50,
    category: 'prive',
    tags: ['health'],
    createdAt: '2026-02-15T10:00:00Z',
    updatedAt: '2026-03-04T08:00:00Z',
  },
  {
    id: 'p7',
    title: 'Client presentatie Q1',
    description: 'Kwartaal rapport en resultaten presenteren',
    status: 'done',
    deadline: '2026-03-01',
    progress: 100,
    category: 'planb-task',
    tags: ['client', 'presentatie'],
    createdAt: '2026-02-20T10:00:00Z',
    updatedAt: '2026-03-01T16:00:00Z',
  },
  {
    id: 'p8',
    title: 'Agent systeem documenteren',
    description: 'Technische docs schrijven voor alle agents',
    status: 'blocked',
    deadline: '2026-03-18',
    progress: 30,
    category: 'planb-task',
    tags: ['docs', 'agents'],
    createdAt: '2026-03-02T10:00:00Z',
    updatedAt: '2026-03-04T10:00:00Z',
  },
];

export function loadTasks(): PlanningTask[] {
  if (typeof window === 'undefined') return defaultTasks;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // fallback
  }
  return defaultTasks;
}

export async function fetchAppleReminders(): Promise<PlanningTask[]> {
  try {
    const res = await fetch('/api/planning-sync/apple-reminders', { method: 'POST' });
    const data = await res.json();
    if (!data.success) return [];

    const planningRes = await fetch('/planning.json');
    const allTasks: PlanningTask[] = await planningRes.json();
    return allTasks.filter((t: any) => t.source === 'apple-reminders');
  } catch {
    return [];
  }
}

export function mergeTasks(localTasks: PlanningTask[], appleTasks: PlanningTask[]): PlanningTask[] {
  const local = localTasks.filter(t => !(t as any).source || (t as any).source !== 'apple-reminders');
  return [...local, ...appleTasks];
}

export function saveTasks(tasks: PlanningTask[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));

  fetch('/api/planning-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks),
  }).catch(() => {});
}

export function generateId(): string {
  return `p${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
