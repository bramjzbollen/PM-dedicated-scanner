import { NextResponse } from 'next/server';
import { getPMConfig, getPMRuntimeState, updatePMConfig } from '@/lib/pm-bot';

export const dynamic = 'force-dynamic';

type Cmd = { action: 'status' | 'bag' | 'maxopen' | 'help'; value?: number };

function parse(text: string): Cmd {
  const t = (text || '').trim().toLowerCase();
  if (!t || t === 'pm' || t === 'pm help') return { action: 'help' };
  if (t === 'pm status' || t === 'status') return { action: 'status' };

  let m = t.match(/^pm\s+bag\s+(\d+(?:\.\d+)?)$/);
  if (m) return { action: 'bag', value: Number(m[1]) };

  m = t.match(/^pm\s+maxopen\s+(\d+)$/);
  if (m) return { action: 'maxopen', value: Number(m[1]) };

  return { action: 'help' };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || '');
    const cmd = parse(text);

    if (cmd.action === 'help') {
      return NextResponse.json({
        ok: true,
        message: 'Commands: pm status | pm bag <usd> | pm maxopen <n>',
      });
    }

    if (cmd.action === 'status') {
      const runtime = await getPMRuntimeState();
      return NextResponse.json({
        ok: true,
        message: `PM ${runtime.mode.toUpperCase()} / ${runtime.executionStatus} | balance $${(runtime.walletBalance?.balanceUsd || 0).toFixed(2)} | open ${runtime.stats.openBets} | winrate ${runtime.stats.winRatePct.toFixed(1)}%`,
      });
    }

    if (cmd.action === 'bag') {
      const v = Number(cmd.value || 0);
      if (!Number.isFinite(v) || v < 1 || v > 25) {
        return NextResponse.json({ ok: false, message: 'pm bag <usd> moet tussen 1 en 25 liggen.' }, { status: 400 });
      }
      const prev = await getPMConfig();
      await updatePMConfig({ paperBetSizeUsd: v });
      return NextResponse.json({ ok: true, message: `Bag size aangepast: $${prev.paperBetSizeUsd} -> $${v}` });
    }

    if (cmd.action === 'maxopen') {
      const v = Number(cmd.value || 0);
      if (!Number.isFinite(v) || v < 1 || v > 5) {
        return NextResponse.json({ ok: false, message: 'pm maxopen <n> moet tussen 1 en 5 liggen.' }, { status: 400 });
      }
      const prev = await getPMConfig();
      await updatePMConfig({ maxOpenBets: v });
      return NextResponse.json({ ok: true, message: `Max open bets aangepast: ${prev.maxOpenBets} -> ${v}` });
    }

    return NextResponse.json({ ok: false, message: 'Onbekend command' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || 'Command failed' }, { status: 500 });
  }
}
