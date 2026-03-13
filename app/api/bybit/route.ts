import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const CONFIG_DIR = join(process.cwd(), 'config');
const CREDS_PATH = join(CONFIG_DIR, 'bybit-credentials.json');

export const dynamic = 'force-dynamic';

interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  enabled: boolean;
  _updated?: string;
}

const DEFAULT_CREDS: BybitCredentials = {
  apiKey: '',
  apiSecret: '',
  testnet: true,
  enabled: false,
};

async function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

// GET: Return credentials (masked secret)
export async function GET() {
  try {
    await ensureDir();
    const raw = await readFile(CREDS_PATH, 'utf-8');
    const creds: BybitCredentials = JSON.parse(raw);
    
    // Mask the secret for security
    return NextResponse.json({
      apiKey: creds.apiKey ? creds.apiKey.substring(0, 8) + '...' : '',
      apiSecretSet: !!creds.apiSecret,
      testnet: creds.testnet,
      enabled: creds.enabled,
      _updated: creds._updated,
    });
  } catch {
    return NextResponse.json({
      apiKey: '',
      apiSecretSet: false,
      testnet: true,
      enabled: false,
    });
  }
}

// POST: Update credentials or toggle mode
export async function POST(request: NextRequest) {
  try {
    await ensureDir();
    const body = await request.json();
    
    // Load existing or create new
    let creds: BybitCredentials;
    try {
      creds = JSON.parse(await readFile(CREDS_PATH, 'utf-8'));
    } catch {
      creds = { ...DEFAULT_CREDS };
    }

    // Update fields
    if (body.apiKey !== undefined) creds.apiKey = body.apiKey;
    if (body.apiSecret !== undefined) creds.apiSecret = body.apiSecret;
    if (body.testnet !== undefined) creds.testnet = body.testnet;
    if (body.enabled !== undefined) creds.enabled = body.enabled;
    creds._updated = new Date().toISOString();

    // Validate: cannot enable mainnet without keys
    if (creds.enabled && !creds.testnet && (!creds.apiKey || !creds.apiSecret)) {
      return NextResponse.json({ 
        error: 'Cannot enable mainnet without API keys' 
      }, { status: 400 });
    }

    // Safety: require explicit confirmation for mainnet
    if (!creds.testnet && body.confirmMainnet !== true) {
      return NextResponse.json({ 
        error: 'Mainnet requires confirmMainnet: true',
        warning: 'This will use REAL MONEY. Are you sure?'
      }, { status: 400 });
    }

    await writeFile(CREDS_PATH, JSON.stringify(creds, null, 2));

    return NextResponse.json({ 
      success: true,
      testnet: creds.testnet,
      enabled: creds.enabled,
      apiKeySet: !!creds.apiKey,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
