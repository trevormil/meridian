import { getDb } from '../db/index.js';
import { tallyVotes } from '../db/votes.js';
import { findSettlementApprovals, deriveStatus, type SettlementKind } from '../chain/classify.js';
import { publish, channel } from '../pubsub.js';
import { snapshotMarket } from '../snapshots.js';

/**
 * Recompute a market's status from the locally-tallied votes against each of
 * its 4 settlement approvals. We read the voting challenge config (whitelist
 * + quorumThreshold) out of the cached raw collection JSON in the markets
 * table, then check each proposal for quorum.
 *
 * Quorum rule:
 *   reached when `sum(yesWeight/100 * voterWeight) ≥ (quorumThreshold/100) * totalVoterWeight`
 *
 * With single-verifier markets (voterWeight=1, threshold=100), a single
 * yesWeight=100 vote satisfies this. PUSH outcome requires BOTH push-yes
 * and push-no to reach quorum.
 */
export function refreshMarketStatusFromVotes(collectionId: string): void {
  const row = getDb()
    .prepare('SELECT raw_collection_json, status FROM markets WHERE collection_id = ?')
    .get(collectionId) as { raw_collection_json: string; status: string } | null;
  if (!row?.raw_collection_json) return;
  if (row.status?.startsWith('resolved-')) return; // already final

  let collection: any;
  try {
    collection = JSON.parse(row.raw_collection_json);
  } catch {
    return;
  }
  const approvals = findSettlementApprovals(collection);
  if (!approvals.length) return;

  const reached: Record<SettlementKind, boolean> = {
    'yes-wins': false,
    'no-wins': false,
    'push-yes': false,
    'push-no': false,
  };

  for (const a of approvals) {
    const tally = tallyVotes(collectionId, a.approvalId);
    if (tally.totalVoterWeight === 0) continue;
    // Find quorumThreshold for this approval from the cached collection JSON.
    const threshold = quorumThresholdFor(collection, a.approvalId);
    if (threshold === null) continue;
    const required = (threshold / 100) * tally.totalVoterWeight;
    if (tally.totalYesWeight >= required - 1e-9) {
      reached[a.kind] = true;
    }
  }

  const newStatus = deriveStatus(reached);
  if (newStatus === 'active' || newStatus === 'unknown') return; // nothing to flip
  getDb()
    .prepare('UPDATE markets SET status = ?, last_synced = ? WHERE collection_id = ?')
    .run(newStatus, Date.now(), collectionId);
  console.log(`[status] #${collectionId} → ${newStatus}`);
  publish(channel.market(collectionId), snapshotMarket(collectionId));
}

function quorumThresholdFor(collection: any, approvalId: string): number | null {
  for (const a of collection?.collectionApprovals ?? []) {
    if (a.approvalId !== approvalId) continue;
    const t = a.approvalCriteria?.votingChallenges?.[0]?.quorumThreshold;
    return t !== undefined ? Number(t) : null;
  }
  return null;
}
