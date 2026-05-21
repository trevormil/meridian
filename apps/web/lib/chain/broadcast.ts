'use client';

import {
  BitBadgesSigningClient,
  GenericCosmosAdapter,
  GenericEvmAdapter,
  encodeMsgsFromJson,
  type BroadcastResult,
} from 'bitbadges';
import { env } from '../env';
import { isTestMode, testAdapterFor, getActivePersonaName } from './test-wallet';

let _client: BitBadgesSigningClient | null = null;
let _adapter: GenericCosmosAdapter | GenericEvmAdapter | null = null;

/**
 * Which wallet path subsequent broadcasts should use.
 *
 *   keplr     → GenericCosmosAdapter.fromKeplr           → tokenization.* MsgX direct
 *   metamask  → GenericEvmAdapter.fromBrowserWallet      → MsgEthereumTx wrapping
 *                                                         a precompile call
 *   test      → GenericCosmosAdapter.fromMnemonic        → Playwright/e2e path
 *
 * Chain-side accounting is identical across all three (events fire from the
 * tokenization module regardless of envelope), so the aggregator parsing is
 * the same. The aggregator's pubsub fires through whichever path lands.
 */
export type SignMode = 'keplr' | 'metamask' | 'test';
let _signMode: SignMode = 'keplr';

export function setSignMode(mode: SignMode): void {
  _signMode = mode;
  clearSigningClient();
}

export async function getSigningClient(): Promise<BitBadgesSigningClient> {
  if (_client) return _client;
  if (_signMode === 'metamask') {
    _adapter = await GenericEvmAdapter.fromBrowserWallet({ expectedChainId: env.evmChainId });
  } else if (isTestMode() && _signMode !== 'keplr') {
    const personaName = getActivePersonaName();
    if (!personaName) throw new Error('No active test persona — call setActivePersonaName() first');
    const { adapter } = await testAdapterFor(personaName);
    _adapter = adapter;
  } else {
    _adapter = await GenericCosmosAdapter.fromKeplr(env.chainId);
  }
  _client = new BitBadgesSigningClient({
    adapter: _adapter,
    network: 'local',
    apiUrl: env.aggregatorUrl,
    nodeUrl: env.aggregatorUrl,
    cosmosChainId: env.chainId,
    evmChainId: env.evmChainId,
    evmRpcUrl: env.evmRpcUrl,
  });
  return _client;
}

export function clearSigningClient(): void {
  _client = null;
  _adapter = null;
}

export interface BroadcastOptions {
  memo?: string;
}

/**
 * Sign + broadcast `{typeUrl, value}` envelopes returned by SDK builders.
 *
 * We run `simulate()` explicitly up front and surface simulation failure as a
 * thrown error — the SDK's `signAndBroadcast` otherwise silently swallows
 * simulation errors and falls back to default gas, which means Keplr prompts
 * the user to sign a transaction that will then fail on chain. By passing
 * `simulate: false` + the simulated fee, we keep the SDK from re-running its
 * own swallowed simulate inside `signAndBroadcast`.
 */
export class SimulationError extends Error {
  readonly raw: unknown;
  constructor(message: string, raw: unknown) {
    super(message);
    this.name = 'SimulationError';
    this.raw = raw;
  }
}

export async function broadcastMessages(envelopes: unknown[], options?: BroadcastOptions): Promise<BroadcastResult> {
  const client = await getSigningClient();
  const messages = encodeMsgsFromJson(envelopes as any[]);

  let fee;
  try {
    const sim = await client.simulate(messages as any, { memo: options?.memo });
    fee = sim.fee;
  } catch (e: any) {
    const detail =
      e?.response?.data?.message ||
      e?.response?.data?.error ||
      e?.message ||
      'unknown simulation error';
    throw new SimulationError(extractChainError(detail), e);
  }

  return client.signAndBroadcast(messages as any, { ...options, simulate: false, fee });
}

/**
 * Strip the Go file:line suffix and grpc framing from chain errors so the
 * surfaced message reads like a real description ("transfer time not in range"
 * instead of "failed to execute message; message index: 0: …: transfer time
 * not in range [.../types.go:131] with gas used: '88024'").
 */
function extractChainError(raw: string): string {
  // Drop everything from " [/" (file path bracket) onward.
  let s = raw.split(' [/')[0];
  // Drop "failed to execute message; message index: N: " prefix.
  s = s.replace(/^failed to execute message; message index: \d+: /, '');
  // Drop trailing "with gas used: '…'" if it slipped through.
  s = s.replace(/ with gas used: '[^']*'$/, '');
  return s.trim();
}
