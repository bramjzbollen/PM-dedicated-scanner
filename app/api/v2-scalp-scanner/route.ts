import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureV2ScannerRunning } from '@/lib/v2-scanner-manager';

export const dynamic = 'force-dynamic';

let cachedData: string | null = null;
let cacheTs = 0;
const CACHE_TTL = 3000;

export async function GET() {
  ensureV2ScannerRunning();
  const now = Date.now();
  if (cachedData && (now - cacheTs) < CACHE_TTL) {
    return new NextResponse(cachedData, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const raw = await readFile(join(process.cwd(), 'public', 'v2-scalp-signals.json'), 'utf-8');
    cachedData = raw;
    cacheTs = now;
    return new NextResponse(raw, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    if (cachedData) {
      return new NextResponse(cachedData, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Stale': 'true' },
      });
    }
    return NextResponse.json({ success: false, error: 'V2 scalp scanner data not available' }, { status: 500 });
  }
}
