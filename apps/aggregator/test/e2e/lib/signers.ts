import { BitBadgesSigningClient, GenericCosmosAdapter, encodeMsgsFromJson, type BroadcastResult } from 'bitbadges';
import { config } from './config.js';
import { type Persona } from './personas.js';

export interface Signer {
  persona: Persona;
  client: BitBadgesSigningClient;
}

/**
 * Build a BitBadgesSigningClient that:
 *   - signs with the persona's mnemonic (no Keplr, no browser)
 *   - posts simulate + broadcast to the aggregator's `/api/v0/{simulate,broadcast}`
 *     proxy (which converts the SDK's number-array body shape into base64 and
 *     forwards to LCD's `/cosmos/tx/v1beta1/*` — same path the FE uses)
 *   - reads account info from the aggregator's `/cosmos/auth/v1beta1/accounts/*`
 *     proxy (handles fresh-account 500s gracefully)
 *
 * The aggregator MUST already be running before makeSigner() is called.
 */
export async function makeSigner(persona: Persona): Promise<Signer> {
  const adapter = await GenericCosmosAdapter.fromMnemonic(persona.mnemonic, config.chainId);
  const client = new BitBadgesSigningClient({
    adapter,
    network: 'local',
    apiUrl: config.aggregatorUrl,
    nodeUrl: config.aggregatorUrl,
    cosmosChainId: config.chainId,
    evmChainId: 90123,
    evmRpcUrl: 'http://localhost:8545',
  });
  return { persona, client };
}

/**
 * Sign + broadcast `{typeUrl, value}` envelopes. Wraps the SDK's
 * signAndBroadcast then **waits for the chain to commit the tx** and verifies
 * DeliverTx succeeded — not just CheckTx (mempool accept).
 *
 * BROADCAST_MODE_SYNC returns CheckTx only; a tx can pass CheckTx then revert
 * at DeliverTx for runtime reasons (wrong approval id, balance underflow, etc.)
 * The SDK reports `success: true` on CheckTx-accept, so we have to query the
 * tx hash to surface actual execution failures.
 */
export async function broadcast(signer: Signer, envelopes: unknown[]): Promise<BroadcastResult> {
  const messages = encodeMsgsFromJson(envelopes as any[]);
  const result = await signer.client.signAndBroadcast(messages as any);
  if (!result.success) {
    const reason = result.error ?? `code ${result.code}`;
    throw new Error(`tx mempool-rejected for ${signer.persona.name}: ${reason}`);
  }
  const tx = await waitForTxCommit(result.txHash);
  if (tx.code !== 0) {
    throw new Error(`tx ${result.txHash.slice(0, 12)}… reverted on chain (code=${tx.code}): ${tx.rawLog.slice(0, 400)}`);
  }
  return result;
}

async function waitForTxCommit(txHash: string, timeoutMs = 12_000): Promise<{ code: number; rawLog: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${config.lcdUrl}/cosmos/tx/v1beta1/txs/${txHash}`);
      if (r.ok) {
        const j = (await r.json()) as { tx_response?: { code?: number; raw_log?: string } };
        const txr = j.tx_response;
        if (txr && (txr.code !== undefined)) {
          return { code: Number(txr.code), rawLog: txr.raw_log ?? '' };
        }
      }
    } catch {
      // transient — retry
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error(`tx ${txHash.slice(0, 12)}… never committed within ${timeoutMs}ms`);
}
