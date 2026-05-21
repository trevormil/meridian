import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { until, sleep } from './wait.js';
import { log } from './log.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AGGREGATOR_ENTRY = resolve(__dirname, '../../../src/index.ts');
const AGGREGATOR_CWD = resolve(__dirname, '../../..');

export interface AggregatorHandle {
  proc: ChildProcessWithoutNullStreams;
  url: string;
  stop: () => Promise<void>;
}

export async function startAggregator(): Promise<AggregatorHandle> {
  // Fresh DB every run — e2e assertions depend on a clean slate.
  rmSync(config.aggregatorDbDir, { recursive: true, force: true });

  log.step(`spawning aggregator on :${config.aggregatorPort}`);
  const proc = spawn('bun', ['run', AGGREGATOR_ENTRY], {
    cwd: AGGREGATOR_CWD,
    env: {
      ...process.env,
      PORT: String(config.aggregatorPort),
      LCD_URL: config.lcdUrl,
      RPC_URL: config.rpcUrl,
      RPC_HTTP_URL: config.rpcUrl,
      TENDERMINT_WS_URL: config.rpcUrl.replace(/^http/, 'ws') + '/websocket',
      DB_PATH: resolve(config.aggregatorDbDir, 'aggregator.sqlite'),
      BLOCK_CHECK_INTERVAL_MS: '1500',
      PRICE_POLL_EVERY_BLOCKS: '1',
      BOOTSTRAP_MAX_COLLECTION_ID: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (b) => process.stdout.write(`\x1b[2m[agg]\x1b[0m ${b}`));
  proc.stderr.on('data', (b) => process.stderr.write(`\x1b[2m[agg]\x1b[0m ${b}`));

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) log.fail(`aggregator exited code ${code}`);
  });

  // Wait for /health
  await until(
    async () => {
      const r = await fetch(`${config.aggregatorUrl}/health`).catch(() => null);
      return r?.ok ? true : null;
    },
    { what: 'aggregator /health', timeoutMs: 15_000 },
  );
  log.ok(`aggregator ready at ${config.aggregatorUrl}`);

  return {
    proc,
    url: config.aggregatorUrl,
    stop: async () => {
      proc.kill('SIGTERM');
      // give it a moment to flush sqlite
      await sleep(500);
      if (!proc.killed) proc.kill('SIGKILL');
    },
  };
}
