import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface PMEvent {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  closed: boolean;
  markets?: any[];
}

/**
 * Fetch live Polymarket events and filter for 5m/15m/1h BTC/ETH/SOL.
 */
export async function GET() {
  try {
    const url = 'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=500';
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'PM API error', events: [] }, { status: 502 });
    }

    const allEvents: PMEvent[] = await res.json();

    // Filter: 5m/15m/1h + BTC/ETH/SOL/XRP
    const filtered = allEvents.filter((ev) => {
      const s = ev.slug.toLowerCase();
      const matchesSymbol = /^(btc|bitcoin|eth|ethereum|sol|solana|xrp|ripple)-/.test(s);
      const matchesTimeframe = /-updown-(5m|15m|1h|60m)-\d+$/.test(s) || s.includes('8am-et');
      return matchesSymbol && matchesTimeframe;
    });

    const mapped = filtered.map((ev) => ({
      slug: ev.slug,
      title: ev.title,
      id: ev.id,
      hasMarkets: (ev.markets?.length || 0) > 0,
    }));

    return NextResponse.json(
      { ok: true, count: mapped.length, events: mapped, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to fetch PM events', events: [] }, { status: 500 });
  }
}
