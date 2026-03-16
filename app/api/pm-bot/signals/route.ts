import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await readFile(join(process.cwd(), 'public', 'pm-signals.json'), 'utf-8');
    const feed = JSON.parse(raw);
    const age = Date.now() - new Date(feed.timestamp).getTime();
    return NextResponse.json({ ...feed, ageMs: age, stale: age > 60000 }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ signals: [], stale: true }, { status: 500 });
  }
}
