import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DeadlineItem {
  id: string;
  title: string;
  dueDate: string;
  minutesLeft: number;
  urgency: 'red' | 'orange' | 'green';
}

function getUrgency(minutesLeft: number): 'red' | 'orange' | 'green' {
  if (minutesLeft <= 0) return 'red';
  const hoursLeft = minutesLeft / 60;
  if (hoursLeft < 48) return 'red';       // < 2 days
  if (hoursLeft < 168) return 'orange';    // < 1 week
  return 'green';
}

interface PlanningTask {
  id: string;
  title: string;
  deadline?: string;
  status: string;
  progress: number;
}

export async function GET() {
  try {
    const now = new Date();

    // Try to read planning tasks from localStorage-synced file or public file
    let planningTasks: PlanningTask[] = [];
    
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Try planning.json first (synced from client)
      const planningPath = path.join(process.cwd(), 'public', 'planning.json');
      try {
        const raw = await fs.readFile(planningPath, 'utf-8');
        planningTasks = JSON.parse(raw);
      } catch {
        // File not found, use hardcoded planning data
      }
    } catch {
      // fs import failed
    }

    // If no file found, use the default planning tasks
    if (planningTasks.length === 0) {
      planningTasks = [
        { id: 'p1', title: 'Dashboard uitbreiden', deadline: '2026-03-15', status: 'in-progress', progress: 65 },
        { id: 'p2', title: 'Moneybird API koppeling', deadline: '2026-03-20', status: 'todo', progress: 0 },
        { id: 'p3', title: 'Trading bot optimalisatie', deadline: '2026-03-10', status: 'in-progress', progress: 80 },
        { id: 'p4', title: 'Belastingaangifte voorbereiden', deadline: '2026-04-01', status: 'todo', progress: 10 },
        { id: 'p5', title: 'Website PLAN B updaten', deadline: '2026-03-25', status: 'todo', progress: 0 },
        { id: 'p8', title: 'Agent systeem documenteren', deadline: '2026-03-18', status: 'blocked', progress: 30 },
      ];
    }

    // Filter: has deadline, not done, future or recent deadlines
    const withDeadlines = planningTasks
      .filter(t => t.deadline && t.status !== 'done')
      .map(t => {
        const due = new Date(t.deadline! + 'T23:59:59');
        const minutesLeft = Math.round((due.getTime() - now.getTime()) / 60000);
        return {
          id: t.id,
          title: t.title,
          dueDate: due.toISOString(),
          minutesLeft,
          urgency: getUrgency(minutesLeft),
        };
      })
      // Sort ascending (closest deadline first)
      .sort((a, b) => a.minutesLeft - b.minutesLeft)
      // Top 5 most urgent
      .slice(0, 5);

    return NextResponse.json({ items: withDeadlines, source: 'planning' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ items: [], error: message }, { status: 200 });
  }
}
