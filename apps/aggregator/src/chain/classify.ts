import type { LcdCollection } from './lcd.js';

export type MarketStatus = 'active' | 'closed' | 'resolved-yes' | 'resolved-no' | 'resolved-push' | 'unknown';

export function isPredictionMarket(c: LcdCollection): boolean {
  return Array.isArray(c.standards) && c.standards.includes('Prediction Market');
}

export type SettlementKind = 'yes-wins' | 'no-wins' | 'push-yes' | 'push-no';

export interface SettlementApprovalRef {
  approvalId: string;
  proposalId: string;
  kind: SettlementKind;
}

const SETTLE_PREFIXES: Array<[string, SettlementKind]> = [
  ['pm-settle-push-yes-', 'push-yes'],
  ['pm-settle-push-no-', 'push-no'],
  ['pm-settle-yes-', 'yes-wins'],
  ['pm-settle-no-', 'no-wins'],
];

/**
 * Resolve the 4 settlement approvals from a collection. SDK's
 * `buildPredictionMarket` uses deterministic approvalIds with a `pm-<role>-<hash>`
 * prefix; we match that prefix directly (much more robust than heuristics on
 * payout ratios + token IDs).
 */
export function findSettlementApprovals(c: LcdCollection): SettlementApprovalRef[] {
  const out: SettlementApprovalRef[] = [];
  for (const a of c.collectionApprovals ?? []) {
    const id: string = a.approvalId ?? '';
    const matched = SETTLE_PREFIXES.find(([p]) => id.startsWith(p));
    if (!matched) continue;
    const proposalId = a.approvalCriteria?.votingChallenges?.[0]?.proposalId ?? id;
    out.push({ approvalId: id, proposalId, kind: matched[1] });
  }
  return out;
}

export function deriveStatus(quorumReached: Record<SettlementKind, boolean>): MarketStatus {
  if (quorumReached['yes-wins']) return 'resolved-yes';
  if (quorumReached['no-wins']) return 'resolved-no';
  if (quorumReached['push-yes'] || quorumReached['push-no']) return 'resolved-push';
  return 'active';
}

export interface MarketSummary {
  collectionId: string;
  metadataUri: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  verifierAddress: string | null;
  depositDenom: string | null;
  depositAmount: string | null;
  mintEscrowAddress: string | null;
  poolId: string | null;
}

/**
 * Parse the inline metadata JSON the SDK writes into `customData`. The
 * builder packs name/description/image into a stringified JSON blob; falls
 * back gracefully when only `uri` is set.
 */
function parseCustomDataJson(s: string | undefined | null): Record<string, any> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return typeof v === 'object' && v !== null ? v : {};
  } catch {
    return {};
  }
}

export function extractSummary(c: LcdCollection): MarketSummary {
  const collectionId = String(c.collectionId);
  const metadataUri = c.collectionMetadata?.uri || null;
  const meta = parseCustomDataJson(c.collectionMetadata?.customData);

  let verifierAddress: string | null = null;
  let depositDenom: string | null = null;
  let depositAmount: string | null = null;

  for (const a of c.collectionApprovals ?? []) {
    // Verifier is the single voter on any voting challenge — same address across all 4 settlement approvals.
    const vc = a?.approvalCriteria?.votingChallenges?.[0];
    if (vc && !verifierAddress) verifierAddress = vc.voters?.[0]?.address ?? null;

    // Deposit denom + amount come from the paired-mint approval (fromListId='Mint').
    if (a.fromListId === 'Mint' || a.fromListId === 'mint') {
      const coin = a.approvalCriteria?.coinTransfers?.[0]?.coins?.[0];
      if (coin) {
        depositDenom = coin.denom ?? depositDenom;
        depositAmount = coin.amount ?? depositAmount;
      }
    }
  }

  return {
    collectionId,
    metadataUri,
    name: meta.name ?? null,
    description: meta.description ?? null,
    image: meta.image ?? null,
    verifierAddress,
    depositDenom,
    depositAmount,
    mintEscrowAddress: c.mintEscrowAddress ?? null,
    poolId: meta.predictionMarketPoolId ?? null,
  };
}
