import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Trigger Bavo subagent via OpenClaw sessions API
    // This would normally use sessions_spawn, but we're in Next.js API route
    // So we'll write a trigger file that the main agent can pick up
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const triggerPath = path.join(process.cwd(), 'public', 'bavo-trigger.json');
    await fs.writeFile(triggerPath, JSON.stringify({
      triggered: true,
      timestamp: new Date().toISOString(),
      source: 'dashboard-button',
    }), 'utf-8');
    
    return NextResponse.json({ 
      success: true,
      message: 'Bavo trigger activated. Jos will spawn Bavo shortly.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
