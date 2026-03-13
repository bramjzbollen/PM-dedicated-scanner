import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

let v2Proc: ChildProcessWithoutNullStreams | null = null;
let lastStartAt = 0;

const MIN_RESTART_GAP_MS = 15_000;

function buildLogStream() {
  const logPath = join(process.cwd(), 'scanner-output.log');
  const dir = dirname(logPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return createWriteStream(logPath, { flags: 'a' });
}

export function ensureV2ScannerRunning() {
  if (v2Proc && !v2Proc.killed) return;

  const now = Date.now();
  if (now - lastStartAt < MIN_RESTART_GAP_MS) return;
  lastStartAt = now;

  const log = buildLogStream();
  log.write(`\n[${new Date().toISOString()}] [V2-MANAGER] starting hybrid-scanner-v2.cjs\n`);

  const child = spawn(process.execPath, ['scripts/hybrid-scanner-v2.cjs'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (buf) => log.write(buf));
  child.stderr.on('data', (buf) => log.write(buf));
  child.on('exit', (code, signal) => {
    log.write(`\n[${new Date().toISOString()}] [V2-MANAGER] scanner exited code=${code} signal=${signal}\n`);
    if (v2Proc === child) v2Proc = null;
  });

  v2Proc = child;
}
