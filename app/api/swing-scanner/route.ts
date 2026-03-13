import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'swing-scanner-data.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    console.error('Error reading swing scanner data:', error);
    return NextResponse.json(
      { success: false, error: 'Scanner data not available' },
      { status: 500 }
    );
  }
}
