'use client';

import {
  buildPredictionMarketBuyIntent,
  buildPredictionMarketSellIntent,
  type PredictionMarketSideArgs,
} from './sdk';
import { UintRangeArray } from 'bitbadges';

export type Side = 'yes' | 'no';
export type Direction = 'buy' | 'sell';

interface IntentInput {
  address: string;
  collectionId: string;
  side: Side;
  direction: Direction;
  tokenAmount: bigint;
  paymentAmount: bigint;
  paymentDenom: string;
  expirySeconds?: number;
}

function randomApprovalId(): string {
  // 16 random bytes hex — matches CLI convention.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function buildIntentMsg(input: IntentInput): { typeUrl: string; value: Record<string, unknown> } {
  // The chain stores transferTimes in MILLISECONDS (unix epoch). Sending
  // seconds silently fails on-chain with "transfer time not in range" because
  // the chain compares its now-ms (~10^12) against our end-sec (~10^9).
  const end = BigInt(Date.now() + (input.expirySeconds ?? 86400) * 1000);
  const args: PredictionMarketSideArgs = {
    address: input.address,
    collectionId: input.collectionId,
    tokenId: input.side === 'yes' ? 1n : 2n,
    tokenAmount: input.tokenAmount,
    paymentDenom: input.paymentDenom,
    paymentAmount: input.paymentAmount,
    transferTimes: UintRangeArray.From([{ start: 1n, end }]),
    approvalId: randomApprovalId(),
  };
  if (input.direction === 'buy') {
    return {
      typeUrl: '/tokenization.MsgSetIncomingApproval',
      value: { creator: input.address, collectionId: input.collectionId, approval: buildPredictionMarketBuyIntent(args) },
    };
  }
  return {
    typeUrl: '/tokenization.MsgSetOutgoingApproval',
    value: { creator: input.address, collectionId: input.collectionId, approval: buildPredictionMarketSellIntent(args) },
  };
}

export function buildCancelMsg(input: {
  address: string;
  collectionId: string;
  approvalId: string;
  approvalLevel: 'incoming' | 'outgoing';
}): { typeUrl: string; value: Record<string, unknown> } {
  const typeUrl =
    input.approvalLevel === 'incoming'
      ? '/tokenization.MsgDeleteIncomingApproval'
      : '/tokenization.MsgDeleteOutgoingApproval';
  return {
    typeUrl,
    value: {
      creator: input.address,
      collectionId: input.collectionId,
      approvalId: input.approvalId,
    },
  };
}

const PM_FULL_OWNERSHIP = [{ start: '1', end: '18446744073709551615' }];

/**
 * Fill another user's open intent. Builds a single MsgTransferTokens that
 * targets the intent owner's approval — the approval's coin transfer fires
 * automatically as part of the transfer, so USDC settles in the same atomic
 * tx as the YES/NO move.
 *
 * - For an INCOMING intent (owner = buyer): we send tokens TO the owner,
 *   prioritizing their incoming approval; their coinTransfer pays us in USDC.
 * - For an OUTGOING intent (owner = seller): we pull tokens FROM the owner,
 *   prioritizing their outgoing approval; their coinTransfer charges us USDC.
 */
export function buildFillIntentMsg(input: {
  filler: string;
  ownerAddress: string;
  collectionId: string;
  approvalId: string;
  approvalLevel: 'incoming' | 'outgoing';
  /** 1 = YES, 2 = NO. */
  tokenId: 1 | 2;
  tokenAmount: bigint;
}): { typeUrl: string; value: Record<string, unknown> } {
  const tokenIds = [{ start: String(input.tokenId), end: String(input.tokenId) }];
  const balances = [{ amount: input.tokenAmount.toString(), tokenIds, ownershipTimes: PM_FULL_OWNERSHIP }];
  const transfer =
    input.approvalLevel === 'incoming'
      ? { from: input.filler, toAddresses: [input.ownerAddress] }
      : { from: input.ownerAddress, toAddresses: [input.filler] };
  return {
    typeUrl: '/tokenization.MsgTransferTokens',
    value: {
      creator: input.filler,
      collectionId: input.collectionId,
      transfers: [
        {
          ...transfer,
          balances,
          prioritizedApprovals: [
            {
              approvalId: input.approvalId,
              approvalLevel: input.approvalLevel,
              approverAddress: input.ownerAddress,
              version: '0',
            },
          ],
          onlyCheckPrioritizedCollectionApprovals: false,
          onlyCheckPrioritizedOutgoingApprovals: input.approvalLevel === 'outgoing',
          onlyCheckPrioritizedIncomingApprovals: input.approvalLevel === 'incoming',
          memo: '',
        },
      ],
    },
  };
}
