import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const config = {
  chainId: process.env.E2E_CHAIN_ID ?? 'bitbadges-1',
  lcdUrl: process.env.E2E_LCD_URL ?? 'http://localhost:1317',
  rpcUrl: process.env.E2E_RPC_URL ?? 'http://localhost:26657',
  aggregatorPort: Number(process.env.E2E_AGGREGATOR_PORT ?? 4042),
  aggregatorUrl: process.env.E2E_AGGREGATOR_URL ?? `http://localhost:${process.env.E2E_AGGREGATOR_PORT ?? 4042}`,
  /** USDC denom — must match what `buildPredictionMarket` defaults to. */
  usdcDenom: process.env.E2E_USDC_DENOM ?? 'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349',
  /** Per-persona starting USDC fund amount (base units). 100 USDC. */
  initialFunding: BigInt(process.env.E2E_FUNDING ?? 100_000_000n.toString()),
  /** Use a separate aggregator data dir so the e2e run doesn't clobber dev DB. */
  aggregatorDbDir: resolve(__dirname, '../../../data-e2e'),
  /** Path to bitbadgeschaind binary for funding txs (uses keyring-backend test). */
  bitbadgeschaind: process.env.E2E_CHAIN_BIN ?? `${process.env.HOME}/go/bin/bitbadgeschaind`,
  /** Existing seed account in keyring used to fund our personas when chain genesis didn't. */
  funderAccount: process.env.E2E_FUNDER ?? 'alice',
  /** How long to wait between txs before polling state. The chain emits a
   *  block roughly every 5s with ignite's default config; we use polling
   *  everywhere we can so this is a backstop, not a fixed cost. */
  blockTimeMs: Number(process.env.E2E_BLOCK_MS ?? 1_500),
};
