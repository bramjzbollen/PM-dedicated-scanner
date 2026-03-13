import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join('C:', 'Users', 'bramb', '.openclaw', 'openclaw.json');

// P0-5 FIX: Known valid models that the UI model selector offers.
// These are always accepted regardless of what's in the config file.
const KNOWN_UI_MODELS = [
  'anthropic/claude-haiku-4-5',
  'anthropic/claude-3-5-haiku-latest',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-opus-4-6',
  'openai-codex/gpt-5.3-codex',
];

function getAllowedModels(config: any): string[] {
  const defaults = Object.keys(config?.agents?.defaults?.models ?? {});
  const fromAgents = (config?.agents?.list ?? [])
    .flatMap((agent: any) => [agent?.model?.primary, ...(agent?.model?.fallbacks ?? [])])
    .filter(Boolean);

  // Merge config-derived models with known UI models
  return Array.from(new Set([...defaults, ...fromAgents, ...KNOWN_UI_MODELS]));
}

export async function POST(request: Request) {
  try {
    const { agentId, model } = await request.json();

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'Invalid agentId' }, { status: 400 });
    }
    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }

    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8').replace(/^\uFEFF/, '');
    const config = JSON.parse(raw);
    const allowedModels = getAllowedModels(config);

    if (allowedModels.length > 0 && !allowedModels.includes(model)) {
      return NextResponse.json(
        { error: `Invalid model. Allowed: ${allowedModels.join(', ')}` },
        { status: 400 }
      );
    }

    // Ensure agents structure exists
    if (!config.agents) config.agents = {};
    if (!Array.isArray(config.agents.list)) {
      config.agents.list = [];
    }

    const agentList = config.agents.list;
    const agent = agentList.find((a: any) => a.id === agentId);
    if (!agent) {
      return NextResponse.json({ error: `Agent "${agentId}" not found` }, { status: 404 });
    }

    const previousModel = agent.model?.primary ?? 'unknown';
    agent.model = {
      primary: model,
      fallbacks: Array.isArray(agent.model?.fallbacks) ? agent.model.fallbacks : [],
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      agentId,
      previousModel,
      newModel: model,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to update model', details: err.message },
      { status: 500 }
    );
  }
}
