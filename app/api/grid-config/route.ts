import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const CONFIG_PATH = join(process.cwd(), 'public', 'grid-config.json');
export const dynamic = 'force-dynamic';
export async function GET() {
  try { const raw = await readFile(CONFIG_PATH, 'utf-8'); return NextResponse.json(JSON.parse(raw)); }
  catch { return NextResponse.json({ error: 'Config not found' }, { status: 404 }); }
}
export async function POST(request: NextRequest) {
  try {
    const updates = await request.json();
    let config;
    try { config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')); }
    catch { return NextResponse.json({ error: 'Config not found' }, { status: 404 }); }
    config = { ...config, ...updates };
    config._updated = new Date().toISOString();
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    return NextResponse.json({ success: true, config });
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
