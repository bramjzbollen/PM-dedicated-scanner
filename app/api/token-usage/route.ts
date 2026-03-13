import { NextResponse } from 'next/server';

// Model pricing (per million tokens, in USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-3.5': { input: 0.80, output: 4 },
  'claude-sonnet-3.5': { input: 3, output: 15 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
};

function normalizeModelName(model: string): string {
  // Normalize model names from the API to display names
  if (model.includes('opus-4') || model.includes('claude-opus-4')) return 'claude-opus-4';
  if (model.includes('sonnet-4') || model.includes('claude-sonnet-4')) return 'claude-sonnet-4';
  if (model.includes('haiku-3.5') || model.includes('claude-3-5-haiku')) return 'claude-haiku-3.5';
  if (model.includes('sonnet-3-5') || model.includes('claude-3-5-sonnet')) return 'claude-sonnet-3.5';
  if (model.includes('opus') && model.includes('3')) return 'claude-3-opus';
  if (model.includes('sonnet') && model.includes('3')) return 'claude-3-sonnet';
  if (model.includes('haiku') && model.includes('3')) return 'claude-3-haiku';
  return model;
}

function getPricing(model: string): { input: number; output: number } {
  return MODEL_PRICING[model] || { input: 3, output: 15 }; // default to sonnet pricing
}

// ─── Real Anthropic Admin API Usage ───
// Docs: https://docs.anthropic.com/en/docs/build-with-claude/usage-cost-api

interface AnthropicUsageEntry {
  date: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  [key: string]: unknown;
}

interface AnthropicBucketResult {
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  input_uncached_tokens?: number;
  cache_creation_tokens?: number;
  [key: string]: unknown;
}

interface AnthropicBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicBucketResult[];
}

interface AnthropicUsageResponse {
  data: AnthropicBucket[];
  has_more: boolean;
  next_page: string | null;
}

async function fetchAnthropicUsage(): Promise<AnthropicUsageEntry[] | null> {
  const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;

  if (!apiKey) {
    console.log('No ANTHROPIC_ADMIN_API_KEY set, using mock data');
    return null;
  }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);

    // Use the correct Usage & Cost Admin API endpoint
    // See: https://docs.anthropic.com/en/docs/build-with-claude/usage-cost-api
    const startingAt = startDate.toISOString().split('T')[0] + 'T00:00:00Z';
    const endingAt = now.toISOString().split('T')[0] + 'T00:00:00Z';

    const url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${startingAt}&ending_at=${endingAt}&group_by[]=model&bucket_width=1d&limit=31`;

    console.log(`Fetching Anthropic usage: ${url}`);

    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      next: { revalidate: 300 } as Record<string, unknown>,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Anthropic Usage API error ${res.status}: ${errText}`);
      return null;
    }

    const data: AnthropicUsageResponse = await res.json();

    // Transform buckets into flat entries
    const entries: AnthropicUsageEntry[] = [];
    for (const bucket of data.data) {
      const date = bucket.starting_at.split('T')[0];
      for (const result of bucket.results) {
        const model = result.model || 'unknown';
        // The API reports input_tokens as uncached + cached, or separately
        const inputTokens = result.input_tokens
          || ((result.input_uncached_tokens || 0) + (result.input_cached_tokens || 0) + (result.cache_creation_tokens || 0));
        const outputTokens = result.output_tokens || 0;

        if (inputTokens > 0 || outputTokens > 0) {
          entries.push({
            date,
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          });
        }
      }
    }

    // Also try to fetch additional pages if has_more
    // (for now we'll just use the first page, 31 days max)

    console.log(`Anthropic usage: got ${entries.length} entries from ${data.data.length} buckets`);
    return entries.length > 0 ? entries : null;
  } catch (err) {
    console.error('Failed to fetch Anthropic usage:', err);
    return null;
  }
}

function transformRealData(entries: AnthropicUsageEntry[]) {
  const now = new Date();

  // Group by date
  const dailyMap = new Map<string, Map<string, { input: number; output: number }>>();

  for (const entry of entries) {
    const date = entry.date;
    const model = normalizeModelName(entry.model);

    if (!dailyMap.has(date)) {
      dailyMap.set(date, new Map());
    }
    const modelMap = dailyMap.get(date)!;
    const existing = modelMap.get(model) || { input: 0, output: 0 };
    modelMap.set(model, {
      input: existing.input + (entry.input_tokens || 0),
      output: existing.output + (entry.output_tokens || 0),
    });
  }

  // Convert to daily format
  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, modelMap]) => {
      const models = Array.from(modelMap.entries()).map(([model, tokens]) => {
        const pricing = getPricing(model);
        const cost = (tokens.input / 1_000_000) * pricing.input + (tokens.output / 1_000_000) * pricing.output;
        return {
          model,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          costUSD: cost,
        };
      });

      return {
        date,
        inputTokens: models.reduce((sum, m) => sum + m.inputTokens, 0),
        outputTokens: models.reduce((sum, m) => sum + m.outputTokens, 0),
        costUSD: models.reduce((sum, m) => sum + m.costUSD, 0),
        models,
      };
    });

  // Summary
  const today = daily.find(d => d.date === now.toISOString().split('T')[0]) || daily[daily.length - 1];
  const currentMonth = now.getMonth();
  const monthData = daily.filter(d => new Date(d.date).getMonth() === currentMonth);

  const monthInputTokens = monthData.reduce((sum, d) => sum + d.inputTokens, 0);
  const monthOutputTokens = monthData.reduce((sum, d) => sum + d.outputTokens, 0);
  const monthCostUSD = monthData.reduce((sum, d) => sum + d.costUSD, 0);

  // Per-model aggregates
  const modelAgg = new Map<string, { inputTokens: number; outputTokens: number; costUSD: number }>();
  for (const day of monthData) {
    for (const m of day.models) {
      const existing = modelAgg.get(m.model) || { inputTokens: 0, outputTokens: 0, costUSD: 0 };
      modelAgg.set(m.model, {
        inputTokens: existing.inputTokens + m.inputTokens,
        outputTokens: existing.outputTokens + m.outputTokens,
        costUSD: existing.costUSD + m.costUSD,
      });
    }
  }

  const totalMonthTokens = monthInputTokens + monthOutputTokens;
  const models = Array.from(modelAgg.entries()).map(([model, data]) => ({
    model,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    costUSD: data.costUSD,
    percentage: totalMonthTokens > 0 ? ((data.inputTokens + data.outputTokens) / totalMonthTokens) * 100 : 0,
  }));

  return {
    daily,
    summary: {
      todayInputTokens: today?.inputTokens || 0,
      todayOutputTokens: today?.outputTokens || 0,
      todayCostUSD: today?.costUSD || 0,
      monthInputTokens,
      monthOutputTokens,
      monthCostUSD,
      prevMonthCostUSD: monthCostUSD * 0.85, // estimate if not available from API
      models,
    },
    lastUpdated: now.toISOString(),
    isLive: true,
  };
}

// ─── Mock Data Fallback ───

type ModelName = 'claude-opus-4' | 'claude-sonnet-4' | 'claude-haiku-3.5';

function generateMockData() {
  const now = new Date();
  const daily: {
    date: string;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
    models: { model: ModelName; inputTokens: number; outputTokens: number; costUSD: number }[];
  }[] = [];

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayOfWeek = date.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const multiplier = isWeekday ? 1 : 0.3;

    const opusInput = Math.floor((150000 + Math.random() * 200000) * multiplier);
    const opusOutput = Math.floor((40000 + Math.random() * 80000) * multiplier);
    const sonnetInput = Math.floor((800000 + Math.random() * 600000) * multiplier);
    const sonnetOutput = Math.floor((200000 + Math.random() * 300000) * multiplier);
    const haikuInput = Math.floor((1200000 + Math.random() * 800000) * multiplier);
    const haikuOutput = Math.floor((400000 + Math.random() * 500000) * multiplier);

    const opusCost = (opusInput / 1_000_000) * 15 + (opusOutput / 1_000_000) * 75;
    const sonnetCost = (sonnetInput / 1_000_000) * 3 + (sonnetOutput / 1_000_000) * 15;
    const haikuCost = (haikuInput / 1_000_000) * 0.80 + (haikuOutput / 1_000_000) * 4;

    daily.push({
      date: dateStr,
      inputTokens: opusInput + sonnetInput + haikuInput,
      outputTokens: opusOutput + sonnetOutput + haikuOutput,
      costUSD: opusCost + sonnetCost + haikuCost,
      models: [
        { model: 'claude-opus-4', inputTokens: opusInput, outputTokens: opusOutput, costUSD: opusCost },
        { model: 'claude-sonnet-4', inputTokens: sonnetInput, outputTokens: sonnetOutput, costUSD: sonnetCost },
        { model: 'claude-haiku-3.5', inputTokens: haikuInput, outputTokens: haikuOutput, costUSD: haikuCost },
      ],
    });
  }

  const today = daily[daily.length - 1];
  const currentMonth = now.getMonth();
  const monthData = daily.filter(d => new Date(d.date).getMonth() === currentMonth);

  const monthInputTokens = monthData.reduce((sum, d) => sum + d.inputTokens, 0);
  const monthOutputTokens = monthData.reduce((sum, d) => sum + d.outputTokens, 0);
  const monthCostUSD = monthData.reduce((sum, d) => sum + d.costUSD, 0);
  const prevMonthCostUSD = monthCostUSD * (0.7 + Math.random() * 0.4);

  const modelAggregates: Record<ModelName, { inputTokens: number; outputTokens: number; costUSD: number }> = {
    'claude-opus-4': { inputTokens: 0, outputTokens: 0, costUSD: 0 },
    'claude-sonnet-4': { inputTokens: 0, outputTokens: 0, costUSD: 0 },
    'claude-haiku-3.5': { inputTokens: 0, outputTokens: 0, costUSD: 0 },
  };

  for (const day of monthData) {
    for (const m of day.models) {
      modelAggregates[m.model].inputTokens += m.inputTokens;
      modelAggregates[m.model].outputTokens += m.outputTokens;
      modelAggregates[m.model].costUSD += m.costUSD;
    }
  }

  const totalMonthTokens = monthInputTokens + monthOutputTokens;
  const models = (Object.keys(modelAggregates) as ModelName[]).map((model) => ({
    model,
    inputTokens: modelAggregates[model].inputTokens,
    outputTokens: modelAggregates[model].outputTokens,
    costUSD: modelAggregates[model].costUSD,
    percentage: totalMonthTokens > 0
      ? ((modelAggregates[model].inputTokens + modelAggregates[model].outputTokens) / totalMonthTokens) * 100
      : 0,
  }));

  return {
    daily,
    summary: {
      todayInputTokens: today.inputTokens,
      todayOutputTokens: today.outputTokens,
      todayCostUSD: today.costUSD,
      monthInputTokens,
      monthOutputTokens,
      monthCostUSD,
      prevMonthCostUSD,
      models,
    },
    lastUpdated: now.toISOString(),
    isLive: false,
  };
}

export async function GET() {
  try {
    // Try real Anthropic API first
    const realData = await fetchAnthropicUsage();
    if (realData && Array.isArray(realData) && realData.length > 0) {
      const transformed = transformRealData(realData);
      return NextResponse.json(transformed);
    }

    // Fallback to mock data
    const data = generateMockData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch token usage' },
      { status: 500 }
    );
  }
}
