import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'planning.json');
    const fileData = JSON.parse(await readFile(filePath, 'utf-8'));
    
    const tasksWithDeadlines = fileData
      .filter((t: any) => t.deadline && t.status !== 'done')
      .map((t: any) => ({
        title: t.title,
        deadline: t.deadline,
        status: t.status,
      }));
    
    return NextResponse.json({
      source: 'public/planning.json',
      totalTasks: fileData.length,
      tasksWithDeadlines,
      message: 'This is what deadlines widget sees. If different from Planning tab, visit Planning tab to trigger sync.',
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
