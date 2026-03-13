import { NextResponse } from 'next/server';
import { discoverPMSuggestedMarkets } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const markets = await discoverPMSuggestedMarkets();
    return NextResponse.json({ markets }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  } catch {
    return NextResponse.json({ error: 'Failed to discover suggested markets', markets: [] }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' } });
  }
}
