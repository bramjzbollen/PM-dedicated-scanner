import { NextResponse } from 'next/server';
import { getPMWalletBalance } from '@/lib/pm-wallet-balance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const balance = await getPMWalletBalance();
    return NextResponse.json(balance, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Failed to fetch wallet balance',
        balanceUsd: 0,
        address: null,
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
