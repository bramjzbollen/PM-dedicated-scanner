import { NextResponse } from 'next/server';
import { 
  startScannerScheduler, 
  stopScannerScheduler, 
  getScannerSchedulerStatus 
} from '@/lib/scanner-scheduler';

export const dynamic = 'force-dynamic';

let schedulerInitialized = false;

function isV1SchedulerEnabled(): boolean {
  const raw = process.env.ENABLE_V1_SCANNER_SCHEDULER;
  return raw === '1' || raw === 'true';
}

export async function GET() {
  // V1 scheduler is noisy and not needed for V2 flow by default.
  // Only auto-start when explicitly enabled via env.
  if (!schedulerInitialized && isV1SchedulerEnabled()) {
    try {
      startScannerScheduler();
      schedulerInitialized = true;
    } catch (error) {
      return NextResponse.json({ 
        error: 'Failed to start scheduler',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 500 });
    }
  }
  
  const status = getScannerSchedulerStatus();
  
  return NextResponse.json({
    status: 'ok',
    scheduler: status,
    v1Enabled: isV1SchedulerEnabled(),
    message: status.running
      ? 'Scanner scheduler is running (updates every 2 minutes)'
      : isV1SchedulerEnabled()
        ? 'Scanner scheduler is stopped'
        : 'Scanner scheduler disabled (set ENABLE_V1_SCANNER_SCHEDULER=true to enable)',
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;
  
  if (action === 'start') {
    startScannerScheduler();
    schedulerInitialized = true;
    return NextResponse.json({ 
      message: 'Scheduler started',
      status: getScannerSchedulerStatus(),
    });
  }
  
  if (action === 'stop') {
    stopScannerScheduler();
    schedulerInitialized = false;
    return NextResponse.json({ 
      message: 'Scheduler stopped',
      status: getScannerSchedulerStatus(),
    });
  }
  
  return NextResponse.json({ 
    error: 'Invalid action. Use: start or stop' 
  }, { status: 400 });
}
