import { execSync } from 'node:child_process';
import { config } from './config.js';
import { type Persona } from './personas.js';
import { sleep } from './wait.js';
import { log } from './log.js';

interface Coin { denom: string; amount: string }

export async function getBalance(address: string, denom: string): Promise<bigint> {
  const r = await fetch(`${config.lcdUrl}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${encodeURIComponent(denom)}`);
  if (!r.ok) return 0n;
  const j = (await r.json()) as { balance?: Coin };
  return BigInt(j.balance?.amount ?? '0');
}

/**
 * Ensure a persona has at least `minAmount` USDC (and a little BADGE for gas).
 * Uses the funder seed account (default `alice`) from the chain's keyring-backend
 * test to send via bitbadgeschaind. If the persona is already seeded in
 * config.yml and the chain was started with --reset-once, this is a no-op.
 */
export async function ensureFunded(persona: Persona, minAmount: bigint): Promise<void> {
  const usdc = await getBalance(persona.address, config.usdcDenom);
  if (usdc >= minAmount) {
    log.info(`${persona.name} already has ${usdc} ${config.usdcDenom.slice(0, 12)}…`);
    return;
  }
  const needed = minAmount - usdc;
  log.warn(`${persona.name} needs ${needed} USDC — funding from ${config.funderAccount}`);

  // Need a little BADGE for gas too.
  const badge = await getBalance(persona.address, 'ubadge');
  const gasSeed = badge < 1_000_000_000n ? '1000000000ubadge,' : '';

  const cmd = `${config.bitbadgeschaind} tx bank send ${config.funderAccount} ${persona.address} ${gasSeed}${needed}${config.usdcDenom} --keyring-backend test --chain-id ${config.chainId} --node ${config.rpcUrl} --gas auto --gas-adjustment 1.5 --fees 5000ubadge --yes --output json`;
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (e: any) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '');
    throw new Error(`Failed to fund ${persona.name}: ${out.slice(0, 500)}`);
  }
  await sleep(config.blockTimeMs);
  const after = await getBalance(persona.address, config.usdcDenom);
  log.ok(`funded ${persona.name} → ${after} USDC base units`);
}
