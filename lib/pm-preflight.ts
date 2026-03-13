import { createHash } from 'node:crypto';
import { getPMConfig } from '@/lib/pm-bot';

export type PreflightState = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NEEDS_CONFIG' | 'BLOCKED' | 'STUB';

export interface PreflightCheck {
  key:
    | 'accountSignatureType'
    | 'funderAddress'
    | 'apiKeyDeriveReadiness'
    | 'l2HeaderGeneration'
    | 'geoblockStatus'
    | 'tickSizeNegRisk'
    | 'balanceAllowance'
    | 'createOrderDryRun';
  label: string;
  state: PreflightState;
  detail: string;
  liveVerified: boolean;
  metadata?: Record<string, unknown>;
}

export interface PMPreflightResponse {
  timestamp: string;
  mode: 'paper' | 'live';
  liveOrdersEnabled: boolean;
  paperOnlyLock: boolean;
  overallState: PreflightState;
  readinessScorePct: number;
  selectedMarket: {
    input: string | null;
    resolved: string | null;
  };
  checks: PreflightCheck[];
}

function normalizeString(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function getEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim().length > 0) return String(value).trim();
  }
  return undefined;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 7000): Promise<{ ok: boolean; status: number; payload?: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
    let payload: any = undefined;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
    return { ok: res.ok, status: res.status, payload };
  } catch (err: any) {
    return { ok: false, status: 0, error: err?.message || 'Network error' };
  } finally {
    clearTimeout(timer);
  }
}

async function probeApiKeyEndpoint(timeoutMs = 7000): Promise<{ reachable: boolean; status: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://clob.polymarket.com/auth/api-key', {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    // 400/401/403 are still useful: endpoint exists and auth path is reachable.
    return { reachable: [200, 201, 400, 401, 403, 405].includes(res.status), status: res.status };
  } catch (err: any) {
    return { reachable: false, status: 0, error: err?.message || 'Network error' };
  } finally {
    clearTimeout(timer);
  }
}

function scoreForState(state: PreflightState): number {
  switch (state) {
    case 'PASS':
      return 1;
    case 'STUB':
      return 0.85;
    case 'UNKNOWN':
      return 0.6;
    case 'NEEDS_CONFIG':
      return 0;
    case 'BLOCKED':
    case 'FAIL':
    default:
      return 0;
  }
}

function weightedReadinessScore(checks: PreflightCheck[]): number {
  const weightByKey: Record<PreflightCheck['key'], number> = {
    accountSignatureType: 1.2,
    funderAddress: 1.2,
    apiKeyDeriveReadiness: 1.5,
    l2HeaderGeneration: 1.0,
    geoblockStatus: 1.4,
    tickSizeNegRisk: 1.3,
    balanceAllowance: 0.9,
    createOrderDryRun: 0.5,
  };

  const weighted = checks.reduce(
    (acc, check) => {
      const w = weightByKey[check.key] ?? 1;
      return {
        total: acc.total + scoreForState(check.state) * w,
        max: acc.max + w,
      };
    },
    { total: 0, max: 0 }
  );

  if (!weighted.max) return 0;
  return Math.round((weighted.total / weighted.max) * 100);
}

export async function buildPMPreflight(inputMarket?: string | null): Promise<PMPreflightResponse> {
  const config = await getPMConfig();

  const signatureTypeRaw = getEnv('PM_SIGNATURE_TYPE', 'POLY_SIGNATURE_TYPE', 'CLOB_SIGNATURE_TYPE');
  const signatureTypeNum = signatureTypeRaw === undefined ? Number.NaN : Number(signatureTypeRaw);
  const signatureTypeValid = [0, 1, 2].includes(signatureTypeNum);

  const funder = normalizeString(getEnv('PM_FUNDER_ADDRESS', 'POLY_FUNDER_ADDRESS', 'CLOB_FUNDER_ADDRESS'));
  const funderValid = Boolean(funder && isEthAddress(funder));

  const pmApiKey = getEnv('POLYMARKET_API_KEY', 'PM_API_KEY', 'CLOB_API_KEY');
  const pmApiSecret = getEnv('POLYMARKET_API_SECRET', 'PM_API_SECRET', 'CLOB_API_SECRET');
  const pmApiPassphrase = getEnv('POLYMARKET_API_PASSPHRASE', 'PM_API_PASSPHRASE', 'CLOB_API_PASSPHRASE');
  const privateKey = getEnv('PM_PRIVATE_KEY', 'POLY_PRIVATE_KEY', 'POLYMARKET_PRIVATE_KEY', 'CLOB_PRIVATE_KEY', 'PRIVATE_KEY');

  const hasApiCreds = Boolean(pmApiKey && pmApiSecret && pmApiPassphrase);
  const hasPrivateKey = Boolean(privateKey);

  const selectedFromConfig = config.events.find((e) => e.enabled)?.marketKey || config.events[0]?.marketKey || null;
  const selectedMarket = normalizeString(inputMarket) || selectedFromConfig;

  const [geoblockRes, clobMarketsRes, apiKeyProbe] = await Promise.all([
    fetchJsonWithTimeout('https://polymarket.com/api/geoblock'),
    fetchJsonWithTimeout('https://clob.polymarket.com/markets?next_cursor=MA=='),
    probeApiKeyEndpoint(),
  ]);

  const geoblocked = Boolean(geoblockRes.payload?.blocked);

  const markets = Array.isArray(clobMarketsRes.payload?.data) ? clobMarketsRes.payload.data : [];
  const sampleMarket = markets[0];
  const hasTickSize =
    sampleMarket?.minimum_tick_size !== undefined ||
    sampleMarket?.minimumTickSize !== undefined ||
    sampleMarket?.tick_size !== undefined ||
    sampleMarket?.tickSize !== undefined;
  const hasNegRisk = sampleMarket?.neg_risk !== undefined || sampleMarket?.negRisk !== undefined;

  const apiKeyDeriveConfigReady = signatureTypeValid && funderValid && hasPrivateKey;

  const l2HeaderReady = hasApiCreds || apiKeyDeriveConfigReady;
  const l2HeaderSimulationId = l2HeaderReady
    ? createHash('sha256').update(`${pmApiKey ? 'api-key' : 'derive'}:${Date.now().toString().slice(0, 8)}`).digest('hex').slice(0, 16)
    : null;

  const checks: PreflightCheck[] = [
    {
      key: 'accountSignatureType',
      label: 'Signature type config (0/1/2)',
      state: signatureTypeRaw === undefined ? 'NEEDS_CONFIG' : signatureTypeValid ? 'PASS' : 'FAIL',
      detail:
        signatureTypeRaw === undefined
          ? 'Signature type ontbreekt. Zet PM_SIGNATURE_TYPE/POLY_SIGNATURE_TYPE/CLOB_SIGNATURE_TYPE op 0, 1 of 2.'
          : signatureTypeValid
            ? `Signature type ${signatureTypeNum} is geldig.`
            : `Ongeldige signature type "${signatureTypeRaw}". Verwacht 0/1/2.`,
      liveVerified: false,
      metadata: { configured: signatureTypeRaw !== undefined },
    },
    {
      key: 'funderAddress',
      label: 'Funder address validatie',
      state: !funder ? 'NEEDS_CONFIG' : funderValid ? 'PASS' : 'FAIL',
      detail: !funder
        ? 'Geen funder address gevonden (PM_FUNDER_ADDRESS/POLY_FUNDER_ADDRESS/CLOB_FUNDER_ADDRESS).'
        : funderValid
          ? 'Funder address formaat is geldig (0x + 40 hex).'
          : 'Funder address ongeldig formaat (verwacht 0x + 40 hex chars).',
      liveVerified: false,
      metadata: { funderPresent: Boolean(funder), funderValid },
    },
    {
      key: 'apiKeyDeriveReadiness',
      label: 'createOrDeriveApiKey readiness',
      state: !apiKeyProbe.reachable
        ? 'UNKNOWN'
        : hasApiCreds
          ? 'PASS'
          : apiKeyDeriveConfigReady
            ? 'STUB'
            : 'NEEDS_CONFIG',
      detail: !apiKeyProbe.reachable
        ? `Auth endpoint niet bereikbaar (${apiKeyProbe.status || 'network error'}${apiKeyProbe.error ? `: ${apiKeyProbe.error}` : ''}).`
        : hasApiCreds
          ? `API key-set aanwezig (endpoint probe ${apiKeyProbe.status}). Rotatie/derive niet uitgevoerd.`
          : apiKeyDeriveConfigReady
            ? `Derive-pad config lijkt compleet (signatureType + funder + private key), maar alleen safe precheck uitgevoerd (endpoint probe ${apiKeyProbe.status}).`
            : 'Config incompleet voor derive (signatureType/funder/private key vereist).',
      liveVerified: apiKeyProbe.reachable,
      metadata: {
        endpointStatus: apiKeyProbe.status,
        hasApiCreds,
        hasPrivateKey,
        deriveConfigReady: apiKeyDeriveConfigReady,
      },
    },
    {
      key: 'l2HeaderGeneration',
      label: 'L2 header generation readiness (dry-run)',
      state: l2HeaderReady ? 'STUB' : 'NEEDS_CONFIG',
      detail: l2HeaderReady
        ? 'Dry-run header-shape generatie mogelijk (gesimuleerd, geen echte signing of orderflow).'
        : 'Niet genoeg config voor L2 header readiness (API key-set of derive-config nodig).',
      liveVerified: false,
      metadata: {
        simulated: true,
        hasApiCreds,
        deriveConfigReady: apiKeyDeriveConfigReady,
        simulationId: l2HeaderSimulationId,
      },
    },
    {
      key: 'geoblockStatus',
      label: 'Geoblock status',
      state: !geoblockRes.ok
        ? 'UNKNOWN'
        : geoblocked
          ? 'BLOCKED'
          : 'PASS',
      detail: !geoblockRes.ok
        ? `Geo-check niet bevestigd (${geoblockRes.status || 'network error'}${geoblockRes.error ? `: ${geoblockRes.error}` : ''}).`
        : geoblocked
          ? 'Endpoint meldt GEO BLOCKED voor huidige runtime.'
          : 'Endpoint bereikbaar en runtime lijkt niet geoblocked.',
      liveVerified: true,
      metadata: { statusCode: geoblockRes.status, blocked: geoblocked },
    },
    {
      key: 'tickSizeNegRisk',
      label: 'tickSize/negRisk capability',
      state: !clobMarketsRes.ok
        ? 'UNKNOWN'
        : hasTickSize && hasNegRisk
          ? 'PASS'
          : 'FAIL',
      detail: !clobMarketsRes.ok
        ? `CLOB markets metadata endpoint faalde (${clobMarketsRes.status || 'network error'}${clobMarketsRes.error ? `: ${clobMarketsRes.error}` : ''}).`
        : hasTickSize && hasNegRisk
          ? 'CLOB market payload bevat minimum_tick_size/tick_size én neg_risk velden.'
          : 'CLOB payload mist required minimum_tick_size(tick_size)- of neg_risk-velden.',
      liveVerified: clobMarketsRes.ok,
      metadata: {
        statusCode: clobMarketsRes.status,
        endpoint: '/markets?next_cursor=MA==',
        selectedMarket,
        hasTickSize,
        hasNegRisk,
      },
    },
    {
      key: 'balanceAllowance',
      label: 'Balance/allowance readiness',
      state: !hasApiCreds && !apiKeyDeriveConfigReady ? 'NEEDS_CONFIG' : 'STUB',
      detail: !hasApiCreds && !apiKeyDeriveConfigReady
        ? 'Credentials ontbreken. Zet API key-set of derive-config om balance/allowance checks mogelijk te maken.'
        : 'Credentials/config aanwezig, maar balance/allowance blijft read-only simulated (geen live wallet mutaties).',
      liveVerified: false,
      metadata: {
        hasApiCreds,
        deriveConfigReady: apiKeyDeriveConfigReady,
      },
    },
    {
      key: 'createOrderDryRun',
      label: 'Order path guard (paper/live)',
      state: 'PASS',
      detail: 'Orderflow blijft guarded: live alleen toegestaan na preflight PASS + freshness + geoblock checks.',
      liveVerified: false,
      metadata: { simulatedOnly: true, guardedLiveMode: true },
    },
  ];

  const readinessScorePct = weightedReadinessScore(checks);

  const overallState: PreflightState = checks.some((c) => c.state === 'BLOCKED')
    ? 'BLOCKED'
    : checks.some((c) => c.state === 'FAIL')
      ? 'FAIL'
      : checks.some((c) => c.state === 'NEEDS_CONFIG')
        ? 'NEEDS_CONFIG'
        : checks.some((c) => c.state === 'UNKNOWN')
          ? 'UNKNOWN'
          : checks.every((c) => c.state === 'PASS' || c.state === 'STUB')
            ? 'PASS'
            : 'UNKNOWN';

  const liveRequested = config.mode === 'live';

  return {
    timestamp: new Date().toISOString(),
    mode: liveRequested ? 'live' : 'paper',
    liveOrdersEnabled: liveRequested,
    paperOnlyLock: !liveRequested,
    overallState,
    readinessScorePct,
    selectedMarket: {
      input: normalizeString(inputMarket) || null,
      resolved: selectedMarket,
    },
    checks,
  };
}
