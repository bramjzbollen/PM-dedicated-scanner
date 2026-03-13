import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

// Cache the last successful read to serve stale data on errors
let cachedData: string | null = null;
let cacheTs = 0;
const CACHE_TTL = 3000; // 3s cache — scanner writes every 10s

export async function GET() {
  const now = Date.now();

  // Serve from cache if fresh enough
  if (cachedData && (now - cacheTs) < CACHE_TTL) {
    return new NextResponse(cachedData, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const filePath = join(process.cwd(), 'public', 'scalping-scanner-data.json');
    const raw = await readFile(filePath, 'utf-8');
    cachedData = raw;
    cacheTs = now;
    return new NextResponse(raw, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    // Serve stale cache on error
    if (cachedData) {
      return new NextResponse(cachedData, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Stale': 'true',
        },
      });
    }
    return NextResponse.json(
      { success: false, error: 'Scanner data not available' },
      { status: 500 }
    );
  }
}
