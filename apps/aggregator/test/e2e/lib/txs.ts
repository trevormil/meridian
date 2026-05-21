/**
 * Tx-builder + broadcast wrappers for the e2e suite. Each function:
 *   - takes a Signer (persona + signing client)
 *   - constructs the right `{typeUrl, value}` envelope(s) via SDK builders
 *   - broadcasts + asserts success (throws on tx failure)
 *   - returns the broadcast result (so callers can inspect txHash, log etc.)
 *
 * Stays thin — the per-Msg logic lives in the SDK. This module is purely the
 * "happy-path orchestration" layer used by scenarios.
 */
import {
  buildPredictionMarket,
  buildPredictionMarketBuyIntent,
  buildPredictionMarketDepositMsg,
  buildPredictionMarketRedeemTx,
  buildPredictionMarketSellIntent,
  UintRangeArray,
  type BroadcastResult,
} from 'bitbadges';
import { broadcast, type Signer } from './signers.js';
import { config } from './config.js';
import { sleep } from './wait.js';

const PM_FULL_OWNERSHIP = [{ start: '1', end: '18446744073709551615' }];

function randomApprovalId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function send(signer: Signer, envelopes: unknown[], label: string): Promise<BroadcastResult> {
  const r = await broadcast(signer, envelopes);
  if (!r.success) throw new Error(`[tx:${label}] ${signer.persona.name} → ${r.error ?? `code ${r.code}`}`);
  // Small backstop so the next query sees the committed state. Scenarios
  // additionally poll on the specific state they care about (untilAgg / chain
  // balance polls), so this is just to avoid the immediate next call seeing
  // a stale mempool state.
  await sleep(config.blockTimeMs);
  return r;
}

/**
 * Force the aggregator to sync a single address's intents on a single
 * collection. Mirrors what the FE does whenever it loads the market page —
 * the aggregator's intent-watcher otherwise relies on the live Tendermint WS
 * subscription, which has been flaky on first-touch addresses.
 */
async function pingAggSyncIntents(address: string, collectionId: string): Promise<void> {
  try {
    await fetch(
      `${config.aggregatorUrl}/api/v0/intents/${address}?collectionId=${collectionId}&includeAll=true`,
      { cache: 'no-store' as any },
    );
  } catch {
    // non-fatal — the watcher will catch up on its next tick
  }
}

/**
 * Synchronously refresh fill candles + vote tallies for one collection via
 * the aggregator's /refresh-fills endpoint. Used after fillIntent / vote so
 * the test doesn't have to wait on the 30s backfill cycle or live subscribeTx
 * latency.
 */
async function pingAggRefreshFills(collectionId: string): Promise<void> {
  try {
    await fetch(`${config.aggregatorUrl}/api/v0/predictions/${collectionId}/refresh-fills`, {
      method: 'POST',
    });
  } catch {
    // non-fatal — backfill will pick it up later
  }
}

export async function createMarket(
  signer: Signer,
  params: { name: string; description?: string; verifier?: string; image?: string },
): Promise<BroadcastResult> {
  const msg = buildPredictionMarket({
    verifier: params.verifier ?? signer.persona.address,
    name: params.name,
    description: params.description ?? 'e2e test market',
    image: params.image ?? 'https://example.com/test.png',
  }) as { typeUrl: string; value: Record<string, unknown> };
  msg.value.creator = signer.persona.address;
  return send(signer, [msg], `createMarket(${params.name})`);
}

export async function deposit(signer: Signer, collectionId: string, amount: bigint, mintApprovalId: string): Promise<BroadcastResult> {
  const msg = buildPredictionMarketDepositMsg(signer.persona.address, collectionId, amount, mintApprovalId);
  return send(signer, [msg], `deposit(${collectionId}, ${amount})`);
}

export interface IntentParams {
  collectionId: string;
  side: 'yes' | 'no';
  direction: 'buy' | 'sell';
  tokenAmount: bigint;
  /** Implied probability 0..1; e.g., 0.6 means 60% YES. */
  price: number;
  expirySeconds?: number;
}

export async function postIntent(signer: Signer, p: IntentParams): Promise<{ result: BroadcastResult; approvalId: string }> {
  const approvalId = randomApprovalId();
  const end = BigInt(Date.now() + (p.expirySeconds ?? 86400) * 1000);
  const args = {
    address: signer.persona.address,
    collectionId: p.collectionId,
    tokenId: p.side === 'yes' ? 1n : 2n,
    tokenAmount: p.tokenAmount,
    paymentDenom: config.usdcDenom,
    paymentAmount: BigInt(Math.round(Number(p.tokenAmount) * p.price)),
    transferTimes: UintRangeArray.From([{ start: 1n, end }]),
    approvalId,
  };
  const approval = p.direction === 'buy' ? buildPredictionMarketBuyIntent(args) : buildPredictionMarketSellIntent(args);
  const envelope = {
    typeUrl: p.direction === 'buy' ? '/tokenization.MsgSetIncomingApproval' : '/tokenization.MsgSetOutgoingApproval',
    value: { creator: signer.persona.address, collectionId: p.collectionId, approval },
  };
  const result = await send(signer, [envelope], `postIntent(${p.direction}-${p.side}@${p.price})`);
  await pingAggSyncIntents(signer.persona.address, p.collectionId);
  return { result, approvalId };
}

export async function cancelIntent(
  signer: Signer,
  p: { collectionId: string; approvalId: string; approvalLevel: 'incoming' | 'outgoing' },
): Promise<BroadcastResult> {
  const typeUrl =
    p.approvalLevel === 'incoming'
      ? '/tokenization.MsgDeleteIncomingApproval'
      : '/tokenization.MsgDeleteOutgoingApproval';
  const envelope = {
    typeUrl,
    value: { creator: signer.persona.address, collectionId: p.collectionId, approvalId: p.approvalId },
  };
  const r = await send(signer, [envelope], `cancel(${p.approvalId.slice(0, 8)})`);
  await pingAggSyncIntents(signer.persona.address, p.collectionId);
  return r;
}

export async function fillIntent(
  signer: Signer,
  p: {
    collectionId: string;
    ownerAddress: string;
    approvalId: string;
    approvalLevel: 'incoming' | 'outgoing';
    tokenId: 1 | 2;
    tokenAmount: bigint;
  },
): Promise<BroadcastResult> {
  const tokenIds = [{ start: String(p.tokenId), end: String(p.tokenId) }];
  const balances = [{ amount: p.tokenAmount.toString(), tokenIds, ownershipTimes: PM_FULL_OWNERSHIP }];
  const transfer =
    p.approvalLevel === 'incoming'
      ? { from: signer.persona.address, toAddresses: [p.ownerAddress] }
      : { from: p.ownerAddress, toAddresses: [signer.persona.address] };
  const envelope = {
    typeUrl: '/tokenization.MsgTransferTokens',
    value: {
      creator: signer.persona.address,
      collectionId: p.collectionId,
      transfers: [
        {
          ...transfer,
          balances,
          prioritizedApprovals: [
            {
              approvalId: p.approvalId,
              approvalLevel: p.approvalLevel,
              approverAddress: p.ownerAddress,
              version: '0',
            },
          ],
          onlyCheckPrioritizedCollectionApprovals: false,
          onlyCheckPrioritizedOutgoingApprovals: p.approvalLevel === 'outgoing',
          onlyCheckPrioritizedIncomingApprovals: p.approvalLevel === 'incoming',
          memo: '',
        },
      ],
    },
  };
  const r = await send(signer, [envelope], `fillIntent(${p.approvalId.slice(0, 8)})`);
  // Sync both sides — owner's incoming/outgoing approvals + filler's just-
  // changed balances. The owner side is what flips the intent to `used`.
  await pingAggSyncIntents(p.ownerAddress, p.collectionId);
  await pingAggSyncIntents(signer.persona.address, p.collectionId);
  // Force the aggregator to pick up the new fill's candle + headline price
  // immediately rather than waiting on the 30s backfill cycle.
  await pingAggRefreshFills(p.collectionId);
  return r;
}

export async function vote(
  signer: Signer,
  p: { collectionId: string; approvalId: string; yesWeight?: string },
): Promise<BroadcastResult> {
  const envelope = {
    typeUrl: '/tokenization.MsgCastVote',
    value: {
      creator: signer.persona.address,
      collectionId: String(p.collectionId),
      approvalLevel: 'collection',
      approverAddress: '',
      approvalId: p.approvalId,
      proposalId: p.approvalId,
      yesWeight: p.yesWeight ?? '100',
    },
  };
  const r = await send(signer, [envelope], `vote(${p.approvalId.slice(0, 12)})`);
  // Force vote tally + status refresh — same reason as fillIntent.
  await pingAggRefreshFills(p.collectionId);
  return r;
}

export type RedeemState = 'active' | 'yes-wins' | 'no-wins' | 'push';

export async function redeem(
  signer: Signer,
  p: {
    collectionId: string;
    state: RedeemState;
    pairAmount?: bigint;
    yesBalance?: bigint;
    noBalance?: bigint;
    approvals: {
      redeemApprovalId?: string;
      yesWinsApprovalId?: string;
      noWinsApprovalId?: string;
      pushYesApprovalId?: string;
      pushNoApprovalId?: string;
    };
  },
): Promise<BroadcastResult | null> {
  const tx = buildPredictionMarketRedeemTx({
    creator: signer.persona.address,
    collectionId: p.collectionId,
    state: p.state,
    pairAmount: p.pairAmount,
    yesBalance: p.yesBalance,
    noBalance: p.noBalance,
    redeemApprovalId: p.approvals.redeemApprovalId,
    yesWinsApprovalId: p.approvals.yesWinsApprovalId,
    noWinsApprovalId: p.approvals.noWinsApprovalId,
    pushYesApprovalId: p.approvals.pushYesApprovalId,
    pushNoApprovalId: p.approvals.pushNoApprovalId,
  });
  if (!tx.messages.length) return null;
  return send(signer, tx.messages, `redeem(${p.state})`);
}

/** Helper: derive the 7 approvalIds from a collection's raw chain response. */
export function approvalsFromCollection(c: any): {
  mintApprovalId?: string;
  transferApprovalId?: string;
  redeemApprovalId?: string;
  yesWinsApprovalId?: string;
  noWinsApprovalId?: string;
  pushYesApprovalId?: string;
  pushNoApprovalId?: string;
} {
  const out: Record<string, string> = {};
  for (const a of c?.collectionApprovals ?? []) {
    const id: string = a.approvalId ?? '';
    if (id.startsWith('pm-mint-')) out.mintApprovalId = id;
    else if (id.startsWith('pm-transfer-')) out.transferApprovalId = id;
    else if (id.startsWith('pm-redeem-')) out.redeemApprovalId = id;
    else if (id.startsWith('pm-settle-push-yes-')) out.pushYesApprovalId = id;
    else if (id.startsWith('pm-settle-push-no-')) out.pushNoApprovalId = id;
    else if (id.startsWith('pm-settle-yes-')) out.yesWinsApprovalId = id;
    else if (id.startsWith('pm-settle-no-')) out.noWinsApprovalId = id;
  }
  return out;
}
