import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await readFile(join(process.cwd(), 'public', 'live-prices.json'), 'utf-8');
    const data = JSON.parse(raw);
    const symbolTs = data.symbolTs || {};
    const symbolTsValues = Object.values(symbolTs).filter((v) => Number.isFinite(v as number)) as number[];
    const latestSymbolTs = symbolTsValues.length ? Math.max(...symbolTsValues) : 0;
    const wsLastMessageTs = Number(data.ws?.lastMessageTs || 0);
    const lastSuccessTs = Math.max(latestSymbolTs, wsLastMessageTs, 0);

    return NextResponse.json({
      ...(data.prices || {}),
      __meta: {
        ts: data.ts || Date.now(),
        lastSuccessTs,
        count: data.count || 0,
        source: data.source || 'unknown',
        ws: data.ws || null,
        symbolTs,
        staleSymbols: data.staleSymbols || 0,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ __meta: { ts: 0, lastSuccessTs: 0, count: 0, source: 'unavailable', ws: null, symbolTs: {}, staleSymbols: 0 } });
  }
}
