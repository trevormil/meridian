/**
 * Re-export SDK builders + a few USDC-only convenience wrappers.
 * Standalone app uses USDC for every market — the `denom` SDK param defaults
 * to 'USDC' so we omit it, keeping caller signatures small.
 */
import {
  buildPredictionMarket,
  buildPredictionMarketDepositMsg,
  buildPredictionMarketRedeemTx,
  buildPredictionMarketBuyIntent,
  buildPredictionMarketSellIntent,
  classifySettlementApproval,
  type PredictionMarketParams,
  type PredictionMarketSideArgs,
  type RedeemArgs,
} from 'bitbadges';

export {
  buildPredictionMarket,
  buildPredictionMarketDepositMsg,
  buildPredictionMarketRedeemTx,
  buildPredictionMarketBuyIntent,
  buildPredictionMarketSellIntent,
  classifySettlementApproval,
  type PredictionMarketParams,
  type PredictionMarketSideArgs,
  type RedeemArgs,
};

/**
 * Build a MsgCastVote envelope directly with camelCase fields. We intentionally
 * bypass the SDK's `buildPredictionMarketResolveTx` because it returns
 * snake_case keys (`collection_id`, `approval_id`, …) that `MsgCastVote`'s
 * wrapper class can't read — it accesses them via camelCase and crashes on
 * `this.collectionId.toString()`.
 */
export function buildCastVoteMsg(args: {
  creator: string;
  collectionId: string;
  approvalId: string;
  proposalId?: string;
  /** 0–100 percent vote in favor; defaults to 100 (full quorum cast). */
  yesWeight?: string;
}) {
  return {
    typeUrl: '/tokenization.MsgCastVote',
    value: {
      creator: args.creator,
      collectionId: String(args.collectionId),
      approvalLevel: 'collection',
      approverAddress: '',
      approvalId: args.approvalId,
      proposalId: args.proposalId ?? args.approvalId,
      yesWeight: args.yesWeight ?? '100',
    },
  };
}

export function buildResolveMsgs(args: {
  creator: string;
  collectionId: string;
  outcome: 'yes' | 'no' | 'push';
  approvals: SettlementApprovals;
}) {
  const { creator, collectionId, outcome, approvals } = args;
  if (outcome === 'yes') {
    if (!approvals.yesWinsApprovalId) throw new Error('Missing yes-wins approval id');
    return [buildCastVoteMsg({ creator, collectionId, approvalId: approvals.yesWinsApprovalId })];
  }
  if (outcome === 'no') {
    if (!approvals.noWinsApprovalId) throw new Error('Missing no-wins approval id');
    return [buildCastVoteMsg({ creator, collectionId, approvalId: approvals.noWinsApprovalId })];
  }
  if (!approvals.pushYesApprovalId || !approvals.pushNoApprovalId) {
    throw new Error('Push outcome requires both push-yes and push-no approval ids');
  }
  return [
    buildCastVoteMsg({ creator, collectionId, approvalId: approvals.pushYesApprovalId }),
    buildCastVoteMsg({ creator, collectionId, approvalId: approvals.pushNoApprovalId }),
  ];
}

export interface SettlementApprovals {
  mintApprovalId?: string;
  redeemApprovalId?: string;
  yesWinsApprovalId?: string;
  noWinsApprovalId?: string;
  pushYesApprovalId?: string;
  pushNoApprovalId?: string;
}

/**
 * Resolve the 7 prediction-market roles by approvalId prefix. SDK's
 * `buildPredictionMarket` uses deterministic IDs (`pm-mint-<hash>`,
 * `pm-redeem-<hash>`, `pm-settle-yes-<hash>`, etc.), which is far more
 * reliable than payout-ratio heuristics.
 */
export function resolveApprovals(collection: any): SettlementApprovals {
  const out: SettlementApprovals = {};
  for (const a of collection?.collectionApprovals ?? []) {
    const id: string = a.approvalId ?? '';
    if (id.startsWith('pm-mint-')) out.mintApprovalId = id;
    else if (id.startsWith('pm-redeem-')) out.redeemApprovalId = id;
    else if (id.startsWith('pm-settle-push-yes-')) out.pushYesApprovalId = id;
    else if (id.startsWith('pm-settle-push-no-')) out.pushNoApprovalId = id;
    else if (id.startsWith('pm-settle-yes-')) out.yesWinsApprovalId = id;
    else if (id.startsWith('pm-settle-no-')) out.noWinsApprovalId = id;
  }
  return out;
}
