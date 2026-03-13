import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join('C:', 'Users', 'bramb', '.openclaw', 'openclaw.json');

const ALLOWED_MODELS = [
  'anthropic/claude-3-5-haiku-latest',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-opus-4-6',
  'openai-codex/gpt-5.3-codex',
];

export async function POST(request: Request) {
  try {
    const { agentId, fallbacks } = await request.json();

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'Invalid agentId' }, { status: 400 });
    }
    if (!Array.isArray(fallbacks)) {
      return NextResponse.json({ error: 'fallbacks must be an array' }, { status: 400 });
    }
    for (const fb of fallbacks) {
      if (!ALLOWED_MODELS.includes(fb)) {
        return NextResponse.json(
          { error: `Invalid fallback model: ${fb}. Allowed: ${ALLOWED_MODELS.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);

    const agentList = config.agents?.list;
    if (!Array.isArray(agentList)) {
      return NextResponse.json({ error: 'No agents list found in config' }, { status: 500 });
    }

    const agent = agentList.find((a: any) => a.id === agentId);
    if (!agent) {
      return NextResponse.json({ error: `Agent "${agentId}" not found` }, { status: 404 });
    }

    const previousFallbacks = agent.model?.fallbacks ?? [];

    if (!agent.model) {
      agent.model = { primary: 'anthropic/claude-sonnet-4-5', fallbacks };
    } else {
      agent.model.fallbacks = fallbacks;
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      agentId,
      previousFallbacks,
      newFallbacks: fallbacks,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to update fallbacks', details: err.message },
      { status: 500 }
    );
  }
}
