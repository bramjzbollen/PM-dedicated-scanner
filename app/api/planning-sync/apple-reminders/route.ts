import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const cachePath = join(process.cwd(), 'public', 'apple-reminders-cache.json');
    let cacheData;
    try {
      const raw = await readFile(cachePath, 'utf-8');
      cacheData = JSON.parse(raw);
    } catch {
      return NextResponse.json({
        success: false, importedCount: 0, available: false,
        warning: 'No cached reminders. Run: node scripts/sync-apple-reminders.cjs',
      });
    }

    if (!cacheData || !cacheData.success || !cacheData.reminders) {
      return NextResponse.json({
        success: false, importedCount: 0, available: false,
        warning: 'Invalid cache data',
      });
    }

    const planningPath = join(process.cwd(), 'public', 'planning.json');

    let existingTasks: any[] = [];
    try {
      const raw = await readFile(planningPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existingTasks = parsed;
    } catch { existingTasks = []; }

    const now = new Date().toISOString();
    const appleTasks = cacheData.reminders.map((r: any) => ({
      id: 'apple-' + r.id,
      reminderId: r.id,
      title: r.title,
      description: r.notes && r.notes !== 'missing value' ? r.notes : '',
      status: r.completed ? 'done' : 'todo',
      deadline: r.dueDateTime ? new Date(r.dueDateTime).toISOString().slice(0, 10) : undefined,
      progress: r.completed ? 100 : 0,
      category: r.sourceList === 'PRIVE to do' ? 'prive' : 'planb-task',
      tags: ['apple-reminders', r.sourceList === 'PRIVE to do' ? 'prive' : 'planb'],
      createdAt: now,
      updatedAt: now,
      dueDateTime: r.dueDateTime || undefined,
      priority: r.priority || 0,
      completed: r.completed,
      notes: r.notes && r.notes !== 'missing value' ? r.notes : undefined,
      sourceList: r.sourceList,
      source: 'apple-reminders',
    }));

    const preserved = existingTasks.filter((t: any) => t.source !== 'apple-reminders');
    const merged = [...preserved, ...appleTasks];
    await writeFile(planningPath, JSON.stringify(merged, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      importedCount: appleTasks.length,
      available: true,
      cacheTimestamp: cacheData.timestamp,
    });
  } catch (error) {
    return NextResponse.json({
      success: false, importedCount: 0, available: false,
      warning: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
