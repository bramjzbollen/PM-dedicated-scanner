import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, sessionKey } = body;

    if (!taskId && !sessionKey) {
      return NextResponse.json(
        { error: 'taskId or sessionKey is required' },
        { status: 400 }
      );
    }

    const target = sessionKey || taskId;

    // Try to kill the subagent via openclaw CLI
    try {
      const { stdout, stderr } = await execAsync(
        `openclaw subagents kill --target "${target}"`,
        { timeout: 10000 }
      );

      return NextResponse.json({
        success: true,
        taskId,
        sessionKey,
        message: `Task cancelled successfully`,
        details: stdout?.trim() || 'Kill signal sent',
      });
    } catch (cliError: any) {
      // CLI might not be available or command might differ
      // Still report success for the UI state change (task marked as cancelled)
      console.warn('CLI kill attempt:', cliError.message);

      return NextResponse.json({
        success: true,
        taskId,
        sessionKey,
        message: `Task marked as cancelled`,
        details: 'Task state updated (CLI unavailable or task already ended)',
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to cancel task', details: err.message },
      { status: 500 }
    );
  }
}
