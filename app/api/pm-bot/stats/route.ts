import { NextResponse } from 'next/server';
import { getPMStats } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getPMStats(), { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch {
    return NextResponse.json({ error: 'Failed to load PM stats' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  }
}
