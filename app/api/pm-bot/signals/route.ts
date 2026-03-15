import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'pm-signals.json');
    const data = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // If file doesn't exist yet, return empty state
    if (message.includes('ENOENT')) {
      return NextResponse.json(
        {
          generatedAt: null,
          scanDurationMs: 0,
          regime: { label: 'neutral', score: 0 },
          signalCount: 0,
          signals: [],
          status: 'awaiting_first_scan',
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { error: 'Failed to read PM signals', detail: message },
      { status: 500 },
    );
  }
}
