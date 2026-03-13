import { NextResponse } from 'next/server';
import { getExecutionAdapter } from '@/lib/execution-adapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const adapter = getExecutionAdapter();
  const status = adapter.getSourceStatus();

  return NextResponse.json({
    ...status,
    envRequired: [
      'EXECUTION_MODE=live|paper',
      'BYBIT_EXECUTION_TESTNET=true|false',
      'BYBIT_TESTNET_API_KEY (required for live testnet execution)',
      'BYBIT_TESTNET_API_SECRET (required for live testnet execution)',
      'BYBIT_API_KEY/BYBIT_API_SECRET (optional fallback names)',
    ],
  });
}
