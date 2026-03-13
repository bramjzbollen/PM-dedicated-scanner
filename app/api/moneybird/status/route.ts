import { NextResponse } from 'next/server';

const INVOICE_STATUSES = ['paid', 'open', 'overdue', 'unpaid'] as const;
const ESTIMATE_STATUSES = ['sent', 'accepted', 'rejected', 'pending'] as const;

type EntityType = 'invoice' | 'estimate';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type: EntityType = body?.type;
    const id = String(body?.id ?? '').trim();
    const status = String(body?.status ?? '').trim();

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    if (type !== 'invoice' && type !== 'estimate') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const allowed: readonly string[] = type === 'invoice' ? INVOICE_STATUSES : ESTIMATE_STATUSES;
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: `Invalid status for ${type}` }, { status: 400 });
    }

    // Moneybird MCP here is read-only. Return a guarded response so UI can apply local draft status safely.
    return NextResponse.json({
      success: true,
      type,
      id,
      status,
      persisted: false,
      mode: 'local-draft',
      message: 'Moneybird write is read-only in this environment; status updated locally.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update status' },
      { status: 500 }
    );
  }
}
