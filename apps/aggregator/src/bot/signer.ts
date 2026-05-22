import { GenericCosmosAdapter, BitBadgesSigningClient, encodeMsgsFromJson } from 'bitbadges';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../env.js';

/**
 * Bot signing client — shared by the SEED_MODE seeder and the always-on
 * arbitrage bot. Loads the mnemonic from `apps/aggregator/fixtures/bot.json`
 * (gitignored). The matching chain account is seeded in
 * `bitbadgeschain/config.yml` under `accounts: - name: bot`.
 *
 * Returns null when the fixture is missing, which both workers treat as
 * "disabled, log + skip" rather than crashing the aggregator.
 */
interface BotFixture {
  name: string;
  address: string;
  mnemonic: string;
}

const FIXTURE = resolve(import.meta.dir, '../../fixtures/bot.json');

let cachedClient: BitBadgesSigningClient | null = null;
let cachedAddress: string | null = null;

function loadFixture(): BotFixture | null {
  if (!existsSync(FIXTURE)) return null;
  try {
    return JSON.parse(readFileSync(FIXTURE, 'utf8')) as BotFixture;
  } catch {
    return null;
  }
}

export async function getBotSigner(): Promise<{ client: BitBadgesSigningClient; address: string } | null> {
  if (cachedClient && cachedAddress) return { client: cachedClient, address: cachedAddress };
  const fx = loadFixture();
  if (!fx) return null;
  const adapter = await GenericCosmosAdapter.fromMnemonic(fx.mnemonic, 'bitbadges-1');
  cachedClient = new BitBadgesSigningClient({
    adapter,
    network: 'local',
    apiUrl: `http://localhost:${env.port}`,
    nodeUrl: `http://localhost:${env.port}`,
    cosmosChainId: 'bitbadges-1',
    evmChainId: 90123,
    evmRpcUrl: env.rpcHttpUrl,
    // 1M covers a single-approval seed tx even late in a market's sequence
    // (the 108th approval's overlap check against ~107 existing ≈ ~250k). The
    // seeder sends one tx at a time and waits for commit, so there's never
    // more than ~one bot tx in flight — a high gasWanted no longer starves the
    // block (the problem when we batched at 2M), it just leaves headroom.
    defaultGasLimit: 1_000_000,
  });
  cachedAddress = fx.address;
  return { client: cachedClient, address: cachedAddress };
}

/**
 * Global serialization lock for ALL bot broadcasts. The seeder and the arb
 * bot share ONE account (getBotSigner is cached), so concurrent broadcasts
 * race on the account sequence: both grab sequence N, one commits, the other
 * is admitted at CheckTx then silently dropped ("never committed"). Chaining
 * every broadcast through this promise guarantees only one tx from the bot
 * account is in flight at a time — the sequence advances cleanly between txs.
 */
let broadcastLock: Promise<unknown> = Promise.resolve();

/**
 * Sign + broadcast an array of envelope-shaped messages. Polls the LCD for
 * the DeliverTx receipt so callers know whether the tx actually committed
 * (BROADCAST_MODE_SYNC otherwise only reports CheckTx). Serialized across the
 * whole process so the seeder + arb bot can't collide on the shared sequence.
 */
export async function botBroadcast(
  signer: { client: BitBadgesSigningClient; address: string },
  envelopes: unknown[],
  label: string,
): Promise<{ txHash: string; code: number; rawLog: string } | null> {
  const run = broadcastLock.then(() => doBotBroadcast(signer, envelopes, label));
  // Keep the chain alive even if this broadcast throws.
  broadcastLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function doBotBroadcast(
  signer: { client: BitBadgesSigningClient; address: string },
  envelopes: unknown[],
  label: string,
): Promise<{ txHash: string; code: number; rawLog: string } | null> {
  if (!envelopes.length) return null;
  const messages = encodeMsgsFromJson(envelopes as any[]);
  const r = await signer.client.signAndBroadcast(messages as any);
  if (!r.success) {
    console.warn(`[bot] ${label} mempool-rejected: ${r.error ?? r.code}`);
    return null;
  }
  const commit = await waitForCommit(r.txHash);
  if (!commit) {
    console.warn(`[bot] ${label} tx ${r.txHash.slice(0, 12)}… never committed`);
    return null;
  }
  if (commit.code !== 0) {
    console.warn(`[bot] ${label} tx ${r.txHash.slice(0, 12)}… reverted (code=${commit.code}): ${commit.rawLog.slice(0, 200)}`);
  }
  return { txHash: r.txHash, code: commit.code, rawLog: commit.rawLog };
}

async function waitForCommit(txHash: string, timeoutMs = 20_000): Promise<{ code: number; rawLog: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${env.lcdUrl}/cosmos/tx/v1beta1/txs/${txHash}`);
      if (r.ok) {
        const j = (await r.json()) as { tx_response?: { code?: number; raw_log?: string } };
        const tx = j.tx_response;
        if (tx?.code !== undefined) return { code: Number(tx.code), rawLog: tx.raw_log ?? '' };
      }
    } catch {
      // transient
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  return null;
}
