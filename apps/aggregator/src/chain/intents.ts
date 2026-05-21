import { getBalance } from './lcd.js';

export interface IntentRow {
  collectionId: string;
  approvalLevel: 'incoming' | 'outgoing';
  ownerAddress: string;
  approvalId: string;
  payDenom: string | null;
  receiveDenom: string | null;
  payAmount: string | null;
  receiveAmount: string | null;
  transferTimesStart: number | null;
  transferTimesEnd: number | null;
  used: boolean;
  isActive: boolean;
}

/**
 * Heuristic mirror of bitbadges SDK's isPredictionMarketIntentApproval.
 * An intent approval is single-token-id, single-transfer, and pairs a YES/NO
 * token with a non-badgeslp coin denom in either direction.
 */
function looksLikeIntent(approval: any): boolean {
  const tokenIds = approval?.tokenIds ?? [];
  if (tokenIds.length !== 1) return false;
  const start = Number(tokenIds[0]?.start ?? 0);
  if (start !== 1 && start !== 2) return false;

  const maxNum = approval?.approvalCriteria?.maxNumTransfers?.overallMaxNumTransfers;
  if (maxNum && Number(maxNum) !== 1) return false;

  const orderCalc = approval?.approvalCriteria?.predeterminedBalances?.orderCalculationMethod;
  if (!orderCalc?.useOverallNumTransfers) return false;

  const coinTransfer = approval?.approvalCriteria?.coinTransfers?.[0];
  const denom = coinTransfer?.coins?.[0]?.denom;
  if (!denom || String(denom).startsWith('badgeslp:')) return false;
  return true;
}

function extractIntent(
  collectionId: string,
  approvalLevel: 'incoming' | 'outgoing',
  ownerAddress: string,
  approval: any,
): IntentRow | null {
  if (!looksLikeIntent(approval)) return null;
  const coinTransfer = approval.approvalCriteria.coinTransfers[0];
  const balance =
    approval.approvalCriteria.predeterminedBalances?.manualBalances?.[0]?.balances?.[0] ??
    approval.approvalCriteria.predeterminedBalances?.incrementedBalances?.startBalances?.[0];

  const tokenStart = Number(approval.tokenIds[0].start);
  const tokenAmount = balance?.amount ?? null;
  const coinAmount = coinTransfer.coins[0].amount;
  const coinDenom = coinTransfer.coins[0].denom;

  // For an outgoing approval (sell): owner sends YES/NO → receives coin
  // For an incoming approval (buy): owner receives YES/NO → pays coin
  const tokenDenom = tokenStart === 1 ? `badgeslp:${collectionId}:uyes` : `badgeslp:${collectionId}:uno`;
  let payDenom: string;
  let receiveDenom: string;
  let payAmount: string;
  let receiveAmount: string;
  if (approvalLevel === 'outgoing') {
    payDenom = tokenDenom;
    receiveDenom = coinDenom;
    payAmount = tokenAmount ?? '0';
    receiveAmount = coinAmount;
  } else {
    payDenom = coinDenom;
    receiveDenom = tokenDenom;
    payAmount = coinAmount;
    receiveAmount = tokenAmount ?? '0';
  }

  const times = approval.transferTimes?.[0] ?? {};
  const ttStart = times.start ? Number(times.start) : null;
  const ttEnd = times.end ? Number(times.end) : null;
  const used = false; // Chain doesn't expose per-approval fill count via balance query; assume unused.

  return {
    collectionId,
    approvalLevel,
    ownerAddress,
    approvalId: approval.approvalId,
    payDenom,
    receiveDenom,
    payAmount,
    receiveAmount,
    transferTimesStart: ttStart,
    transferTimesEnd: ttEnd,
    used,
    isActive: !used,
  };
}

export async function fetchIntentsForAddress(collectionId: string, address: string): Promise<IntentRow[]> {
  const balance = (await getBalance(collectionId, address)) as any;
  if (!balance) return [];
  const out: IntentRow[] = [];
  for (const a of balance.outgoingApprovals ?? []) {
    const row = extractIntent(collectionId, 'outgoing', address, a);
    if (row) out.push(row);
  }
  for (const a of balance.incomingApprovals ?? []) {
    const row = extractIntent(collectionId, 'incoming', address, a);
    if (row) out.push(row);
  }
  return out;
}
