import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join('C:', 'Users', 'bramb', '.openclaw', 'openclaw.json');

export async function GET() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);

    const agents = (config.agents?.list ?? []).map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      model: agent.model ?? config.agents?.defaults?.model ?? {},
      identity: agent.identity ?? {},
      avatar: agent.identity?.avatar
        ? `/avatars/${agent.identity.avatar.replace(/^avatars\//, '')}`
        : undefined,
      skills: agent.skills ?? [],
    }));

    return NextResponse.json({ agents });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to read config', details: err.message },
      { status: 500 }
    );
  }
}
