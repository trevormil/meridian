import { Hono } from 'hono';
import { GenericCosmosAdapter, BitBadgesSigningClient, encodeMsgsFromJson } from 'bitbadges';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../env.js';

/**
 * Faucet — dispenses a fixed amount of USDC (default 10) from a seeded chain
 * key to any requesting bb1 address. Pure dev convenience; rate limited only
 * by the faucet's own balance.
 *
 * The faucet's mnemonic is loaded from `apps/aggregator/fixtures/faucet.json`
 * (gitignored). The chain's `accounts:` block in bitbadgeschain/config.yml
 * seeds the matching address with USDC at genesis.
 *
 * Endpoint:
 *   POST /api/v0/faucet/claim   { "address": "bb1..." }  →  { "txHash", "amount", "denom" }
 *   GET  /api/v0/faucet/status                            →  { "balance", "address", "perClaim" }
 */

interface FaucetConfig {
  name: string;
  address: string;
  mnemonic: string;
}

const FAUCET_FIXTURE = resolve(import.meta.dir, '../../fixtures/faucet.json');
const PER_CLAIM = 10_000_000n; // 10 USDC at 6 decimals

let cachedClient: BitBadgesSigningClient | null = null;
let cachedAddress: string | null = null;

function loadFaucet(): FaucetConfig | null {
  if (!existsSync(FAUCET_FIXTURE)) return null;
  try {
    return JSON.parse(readFileSync(FAUCET_FIXTURE, 'utf8')) as FaucetConfig;
  } catch {
    return null;
  }
}

async function getSigner(): Promise<{ client: BitBadgesSigningClient; address: string } | null> {
  if (cachedClient && cachedAddress) return { client: cachedClient, address: cachedAddress };
  const cfg = loadFaucet();
  if (!cfg) return null;
  const adapter = await GenericCosmosAdapter.fromMnemonic(cfg.mnemonic, 'bitbadges-1');
  cachedClient = new BitBadgesSigningClient({
    adapter,
    network: 'local',
    apiUrl: `http://localhost:${env.port}`,
    nodeUrl: `http://localhost:${env.port}`,
    cosmosChainId: 'bitbadges-1',
    evmChainId: 90123,
    evmRpcUrl: env.rpcHttpUrl,
  });
  cachedAddress = cfg.address;
  return { client: cachedClient, address: cachedAddress };
}

async function faucetBalance(address: string): Promise<bigint> {
  const r = await fetch(`${env.lcdUrl}/bitbadges/bitbadgeschain/tokenization/get_aliased_denom_balance/${address}/${encodeURIComponent(env.usdcDenom)}`);
  if (!r.ok) {
    // Fallback to bank denom in case USDC is set to an ibc/* core denom.
    const b = await fetch(`${env.lcdUrl}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${encodeURIComponent(env.usdcDenom)}`);
    if (!b.ok) return 0n;
    const j = (await b.json()) as { balance?: { amount?: string } };
    return BigInt(j.balance?.amount ?? '0');
  }
  const j = (await r.json()) as { amount?: string };
  return BigInt(j.amount ?? '0');
}

export const faucet = new Hono();

faucet.get('/faucet/status', async (c) => {
  const cfg = loadFaucet();
  if (!cfg) return c.json({ enabled: false, reason: 'no_fixture' });
  const balance = await faucetBalance(cfg.address).catch(() => 0n);
  return c.json({
    enabled: true,
    address: cfg.address,
    balance: balance.toString(),
    perClaim: PER_CLAIM.toString(),
    denom: env.usdcDenom,
    claimsLeft: Number(balance / PER_CLAIM),
  });
});

faucet.post('/faucet/claim', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { address?: string } | null;
  const to = body?.address?.trim();
  if (!to || !to.startsWith('bb1')) {
    return c.json({ error: 'invalid_address', detail: 'expected bb1... cosmos address' }, 400);
  }

  const signer = await getSigner();
  if (!signer) return c.json({ error: 'faucet_disabled', detail: 'fixtures/faucet.json missing' }, 503);

  // Pre-flight: confirm there's enough in the tap. Cheaper than letting the
  // chain reject and returning an opaque error.
  const balance = await faucetBalance(signer.address).catch(() => 0n);
  if (balance < PER_CLAIM) {
    return c.json(
      { error: 'faucet_empty', balance: balance.toString(), perClaim: PER_CLAIM.toString() },
      503,
    );
  }

  // MsgSend with the configured USDC denom. The recipient lands the full
  // PER_CLAIM amount; the chain takes its 0.1% community-pool skim from the
  // faucet's gross (or none if ProtocolFeeDenominator is 0 per PR #99).
  const envelope = {
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: {
      fromAddress: signer.address,
      toAddress: to,
      amount: [{ denom: env.usdcDenom, amount: PER_CLAIM.toString() }],
    },
  };

  try {
    const messages = encodeMsgsFromJson([envelope] as any[]);
    const result = await signer.client.signAndBroadcast(messages as any);
    if (!result.success) {
      return c.json({ error: 'broadcast_failed', detail: result.error ?? `code ${result.code}` }, 500);
    }
    return c.json({
      ok: true,
      txHash: result.txHash,
      amount: PER_CLAIM.toString(),
      denom: env.usdcDenom,
      to,
    });
  } catch (e) {
    return c.json({ error: 'sign_failed', detail: (e as Error).message }, 500);
  }
});
