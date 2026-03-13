#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const txt = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const idx = l.indexOf('=');
    if (idx === -1) continue;
    const k = l.slice(0, idx).trim();
    const v = l.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

function val(key, env) {
  return process.env[key] ?? env[key];
}

function isEthAddress(v) {
  return /^0x[a-fA-F0-9]{40}$/.test(v || '');
}

const root = process.cwd();
const envLocal = loadEnvFile(path.join(root, '.env.local'));

const signatureType = val('PM_SIGNATURE_TYPE', envLocal);
const funder = val('PM_FUNDER_ADDRESS', envLocal) || val('POLY_FUNDER_ADDRESS', envLocal) || val('CLOB_FUNDER_ADDRESS', envLocal);
const privateKey = val('PM_PRIVATE_KEY', envLocal) || val('POLY_PRIVATE_KEY', envLocal) || val('POLYMARKET_PRIVATE_KEY', envLocal) || val('CLOB_PRIVATE_KEY', envLocal) || val('PRIVATE_KEY', envLocal);
const apiKey = val('POLYMARKET_API_KEY', envLocal) || val('PM_API_KEY', envLocal) || val('CLOB_API_KEY', envLocal);
const apiSecret = val('POLYMARKET_API_SECRET', envLocal) || val('PM_API_SECRET', envLocal) || val('CLOB_API_SECRET', envLocal);
const apiPass = val('POLYMARKET_API_PASSPHRASE', envLocal) || val('PM_API_PASSPHRASE', envLocal) || val('CLOB_API_PASSPHRASE', envLocal);

const checks = [
  {
    name: 'PM_SIGNATURE_TYPE = 2',
    ok: String(signatureType) === '2',
    detail: signatureType ? `found ${signatureType}` : 'missing',
  },
  {
    name: 'PM_FUNDER_ADDRESS is geldig ETH adres (proxy wallet)',
    ok: isEthAddress(funder),
    detail: funder ? `${funder.slice(0, 8)}...${funder.slice(-6)}` : 'missing',
  },
  {
    name: 'Signer private key aanwezig',
    ok: Boolean(privateKey && privateKey.startsWith('0x') && privateKey.length >= 66),
    detail: privateKey ? `present (${privateKey.length} chars)` : 'missing',
  },
  {
    name: 'API keyset aanwezig (alternatief op derive)',
    ok: Boolean(apiKey && apiSecret && apiPass),
    detail: apiKey && apiSecret && apiPass ? 'present' : 'not set (ok if using derive)',
  },
];

const hardRequiredOk = checks[0].ok && checks[1].ok && checks[2].ok;

console.log('--- Polymarket Scenario A Check ---');
for (const c of checks) {
  console.log(`${c.ok ? '✅' : '❌'} ${c.name} -> ${c.detail}`);
}
console.log('');
if (hardRequiredOk) {
  console.log('READY: Scenario A basisconfig is OK.');
  console.log('Next: start app + check /api/pm-bot/preflight');
  process.exit(0);
} else {
  console.log('NOT READY: vul ontbrekende Scenario A waarden in .env.local');
  process.exit(1);
}
