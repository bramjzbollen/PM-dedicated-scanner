import { NextRequest, NextResponse } from 'next/server';
import { getPMConfig, updatePMConfig } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getPMConfig();
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch {
    return NextResponse.json({ error: 'Failed to load PM config' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json();
    const updated = await updatePMConfig(payload || {});
    return NextResponse.json(updated, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch {
    return NextResponse.json({ error: 'Failed to update PM config' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  }
}
