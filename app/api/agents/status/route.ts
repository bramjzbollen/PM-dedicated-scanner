import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'done' | 'blocked';
  currentTask?: {
    title: string;
    progress: number;
    eta?: string;
  };
  sessionKey?: string;
  model?: string;
  startedAt?: number;
  runtime?: string;
}

const AGENT_CONFIG: Record<string, { name: string; role: string; emoji: string }> = {
  boeboesh: { name: 'Boeboesh', role: 'Coding & Build', emoji: '🛠️' },
  bavo: { name: 'Bavo', role: 'Nieuws & Content', emoji: '📰' },
  rover: { name: 'Rover', role: 'Trading & Analysis', emoji: '📊' },
  'jean-claude': { name: 'Jean-Claude', role: 'Wijn & Sommelier', emoji: '🍷' },
  julio: { name: 'Julio', role: 'Presentations & Visual', emoji: '🎨' },
  arne: { name: 'Arne', role: 'Fotografie & Video', emoji: '📸' },
  guido: { name: 'Guido', role: 'Boekhouding & Admin', emoji: '💰' },
};

// Pre-compute idle agents list (never changes)
const IDLE_AGENTS: AgentStatus[] = Object.entries(AGENT_CONFIG).map(([id, config]) => ({
  id, name: config.name, role: config.role, status: 'idle' as const,
}));

function formatRuntime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export async function GET() {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const agents: AgentStatus[] = [];
    const sessionsPath = path.join(process.cwd(), 'public', 'active-sessions.json');
    
    try {
      const raw = await fs.readFile(sessionsPath, 'utf-8');
      const sessions = JSON.parse(raw);
      const now = Date.now();
      
      for (const session of sessions.recent || []) {
        const agentId = session.sessionKey?.split(':')[1];
        const config = AGENT_CONFIG[agentId];
        if (!config) continue;
        
        const runtime = session.endedAt 
          ? session.endedAt - session.startedAt
          : now - session.startedAt;
        
        agents.push({
          id: agentId,
          name: config.name,
          role: config.role,
          status: session.status === 'done' ? 'done' : session.status === 'active' ? 'working' : 'idle',
          currentTask: session.task ? {
            title: session.task.substring(0, 80) + (session.task.length > 80 ? '...' : ''),
            progress: session.status === 'done' ? 100 : 50,
            eta: undefined,
          } : undefined,
          sessionKey: session.sessionKey,
          model: session.model,
          startedAt: session.startedAt,
          runtime: formatRuntime(runtime),
        });
      }
    } catch {
      // File doesn't exist — return idle agents
    }
    
    // Add idle agents not in active sessions
    const activeIds = new Set(agents.map(a => a.id));
    for (const idle of IDLE_AGENTS) {
      if (!activeIds.has(idle.id)) agents.push(idle);
    }
    
    const activeCount = agents.filter(a => a.status === 'working').length;
    
    return NextResponse.json({
      agents,
      total: IDLE_AGENTS.length,
      active: activeCount,
      idle: IDLE_AGENTS.length - activeCount,
      timestamp: Date.now(),
    }, {
      headers: {
        // Allow clients to cache for 5s to reduce redundant polling
        'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      agents: [], total: 0, active: 0, idle: 0, error: message,
    }, { status: 500 });
  }
}
