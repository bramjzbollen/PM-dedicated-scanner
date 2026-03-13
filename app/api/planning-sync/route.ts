import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const tasks = await request.json();
    
    // Write to public/planning.json so deadlines API can read it
    const filePath = join(process.cwd(), 'public', 'planning.json');
    await writeFile(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
