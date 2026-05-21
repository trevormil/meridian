import { GenericCosmosAdapter, BitBadgesSigningClient, encodeMsgsFromJson } from 'bitbadges';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../env.js';

/**
 * Meridian oracle signer — used by both the morning create-markets script
 * (creates one prediction market per strike, designated verifier = oracle)
 * and the evening settle script (casts the resolve-this-way vote).
 *
 * Mnemonic in apps/aggregator/fixtures/oracle.json (gitignored). The matching
 * chain account `oracle` is seeded in bitbadgeschain/config.yml.
 */
const FIXTURE = resolve(import.meta.dir, '../../fixtures/oracle.json');

export interface OracleSigner {
  client: BitBadgesSigningClient;
  address: string;
}

interface OracleFixture {
  name: string;
  address: string;
  mnemonic: string;
}

export function loadOracleFixture(): OracleFixture {
  if (!existsSync(FIXTURE)) {
    throw new Error(
      `oracle fixture missing: ${FIXTURE} — regen with \`bitbadgeschaind keys add oracle --keyring-backend test --output json\` and save the mnemonic`,
    );
  }
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as OracleFixture;
}

let _signer: OracleSigner | null = null;

export async function getOracleSigner(): Promise<OracleSigner> {
  if (_signer) return _signer;
  const fx = loadOracleFixture();
  const adapter = await GenericCosmosAdapter.fromMnemonic(fx.mnemonic, 'bitbadges-1');
  const client = new BitBadgesSigningClient({
    adapter,
    network: 'local',
    // Talk to the aggregator's simulate/broadcast proxy directly. Defaults to
    // localhost; override via AGG_URL env if running from a different host.
    apiUrl: process.env.AGG_URL ?? `http://localhost:${env.port}`,
    nodeUrl: process.env.AGG_URL ?? `http://localhost:${env.port}`,
    cosmosChainId: 'bitbadges-1',
    evmChainId: 90123,
    evmRpcUrl: env.rpcHttpUrl,
  });
  _signer = { client, address: fx.address };
  return _signer;
}

/**
 * Sign + broadcast + wait-for-commit. Polls LCD for the receipt so the caller
 * knows whether the tx actually executed (BROADCAST_MODE_SYNC otherwise only
 * reports CheckTx). Throws on revert.
 */
export async function oracleBroadcast(
  signer: OracleSigner,
  envelopes: unknown[],
  label: string,
): Promise<string> {
  const messages = encodeMsgsFromJson(envelopes as any[]);
  const r = await signer.client.signAndBroadcast(messages as any);
  if (!r.success) {
    throw new Error(`[oracle] ${label} mempool-rejected: ${r.error ?? `code ${r.code}`}`);
  }
  const commit = await waitForCommit(r.txHash);
  if (!commit) throw new Error(`[oracle] ${label} tx ${r.txHash.slice(0, 12)}… never committed`);
  if (commit.code !== 0) {
    throw new Error(
      `[oracle] ${label} reverted (code=${commit.code}): ${commit.rawLog.slice(0, 300)}`,
    );
  }
  return r.txHash;
}

async function waitForCommit(
  txHash: string,
  timeoutMs = 15_000,
): Promise<{ code: number; rawLog: string } | null> {
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
