/**
 * Convenience: send a small BADGE drip from the bot account to the oracle so
 * the oracle can pay tx gas. Only needed when the chain wasn't reset after
 * the `oracle` account was added to bitbadgeschain/config.yml — a full `cr`
 * reset seeds the oracle at genesis and this script becomes a no-op.
 *
 *   bun run src/meridian/bootstrap-oracle.ts
 */
import { GenericCosmosAdapter, BitBadgesSigningClient, encodeMsgsFromJson } from 'bitbadges';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../env.js';
import { loadOracleFixture } from './signer.js';

const BOT_FIXTURE = resolve(import.meta.dir, '../../fixtures/bot.json');
const DRIP_BADGE = '100000000'; // 0.1 BADGE (9 decimals) — plenty for ~hundreds of gas-paying txs
const DRIP_USDC = '100000000'; // 100 USDC — pads the oracle's USDC for any future deposits

async function main(): Promise<void> {
  const oracle = loadOracleFixture();

  // Check current balance — skip if oracle already has BADGE.
  const r = await fetch(`${env.lcdUrl}/cosmos/bank/v1beta1/balances/${oracle.address}/by_denom?denom=ubadge`);
  const j = (await r.json()) as { balance?: { amount?: string } };
  const current = BigInt(j.balance?.amount ?? '0');
  if (current > 100_000_000n) {
    console.log(`[bootstrap-oracle] oracle already has ${current} ubadge — no top-up needed`);
    return;
  }

  // Load bot fixture + sign a MsgSend.
  const bot = JSON.parse(readFileSync(BOT_FIXTURE, 'utf8')) as { mnemonic: string; address: string };
  const adapter = await GenericCosmosAdapter.fromMnemonic(bot.mnemonic, 'bitbadges-1');
  const client = new BitBadgesSigningClient({
    adapter,
    network: 'local',
    apiUrl: `http://localhost:${env.port}`,
    nodeUrl: `http://localhost:${env.port}`,
    cosmosChainId: 'bitbadges-1',
    evmChainId: 90123,
    evmRpcUrl: env.rpcHttpUrl,
  });

  // Cosmos bank MsgSend's `amount` array must be sorted by denom (alphabetical).
  // `ibc/...` < `ubadge` so the IBC coin comes first.
  const msg = {
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: {
      fromAddress: bot.address,
      toAddress: oracle.address,
      amount: [
        { denom: 'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349', amount: DRIP_USDC },
        { denom: 'ubadge', amount: DRIP_BADGE },
      ],
    },
  };
  const messages = encodeMsgsFromJson([msg] as any[]);
  const result = await client.signAndBroadcast(messages as any);
  if (!result.success) {
    console.error(`[bootstrap-oracle] mempool-rejected: ${result.error ?? result.code}`);
    process.exit(1);
  }

  // Wait for DeliverTx — CheckTx alone doesn't mean the bank send executed.
  for (let i = 0; i < 30; i++) {
    await new Promise((res) => setTimeout(res, 500));
    const tx = await fetch(`${env.lcdUrl}/cosmos/tx/v1beta1/txs/${result.txHash}`);
    if (tx.ok) {
      const j = (await tx.json()) as { tx_response?: { code?: number; raw_log?: string } };
      const code = j.tx_response?.code;
      if (code === undefined) continue;
      if (code !== 0) {
        console.error(`[bootstrap-oracle] reverted (code=${code}): ${j.tx_response?.raw_log?.slice(0, 200)}`);
        process.exit(1);
      }
      console.log(
        `[bootstrap-oracle] sent ${DRIP_BADGE} ubadge + ${DRIP_USDC} uUSDC → ${oracle.address} (tx ${result.txHash.slice(0, 12)}…)`,
      );
      return;
    }
  }
  console.error(`[bootstrap-oracle] tx ${result.txHash.slice(0, 12)}… never landed within 15s`);
  process.exit(1);
}

main().catch((e) => {
  console.error('[bootstrap-oracle] uncaught:', e);
  process.exit(2);
});
