/**
 * Global Playwright setup.
 *
 * Spawns a fresh aggregator instance on a separate port (default 4043) so it
 * doesn't collide with dev or the aggregator e2e suite. Assumes the chain
 * itself is already running locally (`cr`) — same convention as the
 * aggregator e2e suite.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';

const AGG_PORT = Number(process.env.PW_AGG_PORT ?? 4043);
const LCD_URL = process.env.PW_LCD_URL ?? 'http://localhost:1317';
const RPC_URL = process.env.PW_RPC_URL ?? 'http://localhost:26657';
const AGG_ENTRY = resolve(__dirname, '../../../aggregator/src/index.ts');
const AGG_CWD = resolve(__dirname, '../../../aggregator');
const AGG_DATA_DIR = resolve(__dirname, '../../../aggregator/data-playwright');

let aggProc: ChildProcess | null = null;

async function waitFor(url: string, label: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // 1. Chain must already be up.
  await waitFor(`${LCD_URL}/cosmos/base/tendermint/v1beta1/blocks/latest`, 'chain LCD', 5_000).catch(() => {
    throw new Error(`Chain not reachable at ${LCD_URL}. Start it with \`cr\` first.`);
  });

  // 2. Fresh aggregator on side port + side data dir.
  rmSync(AGG_DATA_DIR, { recursive: true, force: true });
  mkdirSync(AGG_DATA_DIR, { recursive: true });

  aggProc = spawn('bun', ['run', AGG_ENTRY], {
    cwd: AGG_CWD,
    env: {
      ...process.env,
      PORT: String(AGG_PORT),
      LCD_URL,
      RPC_URL,
      RPC_HTTP_URL: RPC_URL,
      TENDERMINT_WS_URL: RPC_URL.replace(/^http/, 'ws') + '/websocket',
      DB_PATH: resolve(AGG_DATA_DIR, 'aggregator.sqlite'),
      BLOCK_CHECK_INTERVAL_MS: '1500',
      PRICE_POLL_EVERY_BLOCKS: '1',
      BOOTSTRAP_MAX_COLLECTION_ID: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  aggProc.stdout?.on('data', (b) => process.stdout.write(`\x1b[2m[pw-agg]\x1b[0m ${b}`));
  aggProc.stderr?.on('data', (b) => process.stderr.write(`\x1b[2m[pw-agg]\x1b[0m ${b}`));

  await waitFor(`http://localhost:${AGG_PORT}/health`, 'aggregator', 30_000);

  // Stash for teardown — Playwright doesn't pass state between setup/teardown.
  // Use a temp file as the handoff.
  await import('node:fs').then((fs) => {
    if (aggProc?.pid) fs.writeFileSync(resolve(AGG_DATA_DIR, 'agg.pid'), String(aggProc.pid));
  });
}
