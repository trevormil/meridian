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
import { txBus } from '../tx-bus';

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
/** bb1 address of the currently connected wallet — set by WalletContext on
 *  every connect/disconnect. Used by the post-broadcast intent re-sync so the
 *  aggregator picks up new/cancelled/filled intents even if its live WS event
 *  stream missed the tx. */
let _broadcastAddress: string | null = null;

export function setSignMode(mode: SignMode): void {
  _signMode = mode;
  clearSigningClient();
}

export function setBroadcastAddress(address: string | null): void {
  _broadcastAddress = address;
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

  const result = await client.signAndBroadcast(messages as any, { ...options, simulate: false, fee });

  // EVM-signed (MetaMask) path: the SDK returns success as soon as MetaMask
  // signs and `eth_sendTransaction` returns a hash — but that's just "queued",
  // not "included in a block". A revert at execution time would silently leave
  // the FE thinking it succeeded. Poll the EVM receipt to confirm.
  if (_signMode === 'metamask' && result.success && result.txHash) {
    await confirmEvmTxOrThrow(result.txHash);
  } else if (result.success && result.txHash) {
    // Cosmos path: SDK's signAndBroadcast returns the tx hash on mempool
    // accept, not DeliverTx. Wait for the tx to actually land in a block so
    // any post-tx refetches see the new state instead of pre-tx state.
    await confirmCosmosTxOrThrow(result.txHash);
  }

  // Notify subscribers (useRefreshOnTx) so chain-direct queries refetch with
  // the post-tx state. We also tack on a small grace period so the aggregator's
  // tx-watcher has time to publish its own state changes (intents/markets/etc).
  if (result.success && result.txHash) {
    // Force the aggregator to re-sync this user's intents across all markets.
    // Same fix as the seeder: the WS event stream sometimes misses txs, so we
    // ping the per-user endpoint which calls fetchIntentsForAddress +
    // syncIntentsForOwner under the hood. That writes the new intent rows AND
    // publishes on `intents-owner:{addr}` so the order book / fill watcher /
    // arb bot all see it within a tick.
    if (_broadcastAddress) {
      void syncIntentsAcrossKnownMarkets(_broadcastAddress).catch(() => {});
    }
    setTimeout(() => txBus.emit(result.txHash), 200);
  }

  return result;
}

async function syncIntentsAcrossKnownMarkets(address: string): Promise<void> {
  // Fetch the market list (cheap — aggregator serves from SQLite) and ping
  // the per-user endpoint for each. The endpoint internally calls
  // fetchIntentsForAddress + syncIntentsForOwner, so the aggregator's DB +
  // its `intents-owner:{addr}` realtime channel both update.
  try {
    const r = await fetch(`${env.aggregatorUrl}/api/v0/predictions`);
    if (!r.ok) return;
    const j = (await r.json()) as { predictions?: Array<{ collectionId: string }> };
    const cids = (j.predictions ?? []).map((m) => m.collectionId);
    await Promise.all(
      cids.map((cid) =>
        fetch(
          `${env.aggregatorUrl}/api/v0/intents/${address}?collectionId=${cid}&includeAll=true`,
        ).catch(() => undefined),
      ),
    );
  } catch {
    // non-fatal — bot/book will catch up on next bootstrap sweep
  }
}

async function confirmCosmosTxOrThrow(txHash: string, timeoutMs = 15_000): Promise<void> {
  // Hit the LCD directly for the by-hash lookup — the aggregator only proxies
  // the POST broadcast/simulate endpoints, not GET-by-hash. The LCD returns
  // 404 with `code:5` while the tx is still in mempool (or unknown) and a 200
  // with `tx_response.code` once committed.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${env.lcdUrl}/cosmos/tx/v1beta1/txs/${txHash}`);
      if (r.ok) {
        const j = (await r.json()) as { tx_response?: { code?: number; raw_log?: string } };
        const tx = j.tx_response;
        if (tx && tx.code !== undefined) {
          if (tx.code !== 0) {
            throw new Error(
              `Tx ${txHash.slice(0, 12)}… reverted on chain: ${extractChainError(tx.raw_log ?? '')}`,
            );
          }
          return;
        }
      }
      // 404 = not yet committed; keep polling.
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Tx ')) throw e;
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Tx ${txHash.slice(0, 12)}… never committed within ${timeoutMs / 1000}s`);
}

async function confirmEvmTxOrThrow(ethTxHash: string, timeoutMs = 20_000): Promise<void> {
  // ethTxHash is the EVM hash (0x...). We poll the EVM RPC for the receipt.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(env.evmRpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [ethTxHash],
          id: 1,
        }),
      });
      const j = (await r.json()) as { result?: { status?: string; blockNumber?: string } | null };
      const receipt = j.result;
      if (receipt) {
        if (receipt.status === '0x1') return; // success
        throw new Error(
          `EVM tx ${ethTxHash.slice(0, 12)}… reverted on chain. Check the precompile call — some Cosmos message types (e.g., complex MsgUniversalUpdateCollection payloads) aren't supported via the precompile; sign with Keplr instead.`,
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('EVM tx ')) throw e;
      // transient fetch error — retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `EVM tx ${ethTxHash.slice(0, 12)}… never confirmed within ${timeoutMs / 1000}s — check MetaMask's tx history.`,
  );
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
