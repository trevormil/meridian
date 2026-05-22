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
  });
  cachedAddress = fx.address;
  return { client: cachedClient, address: cachedAddress };
}

/**
 * Sign + broadcast an array of envelope-shaped messages. Polls the LCD for
 * the DeliverTx receipt so callers know whether the tx actually committed
 * (BROADCAST_MODE_SYNC otherwise only reports CheckTx).
 */
export async function botBroadcast(
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
